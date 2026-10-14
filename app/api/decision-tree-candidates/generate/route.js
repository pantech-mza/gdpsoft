import OpenAI from "openai";
export const maxDuration = 180;
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { requireActor } from "../../../../lib/decision-trees/auth";
import { validateTree } from "../../../../lib/decision-trees/validate";
import { repairMissingDestinations, hasUnresolvedReview } from "../../../../lib/decision-trees/recover";


// Structured Outputs: fuerza forma JSON sin depender de instrucciones de texto libre.
// Todos los nodos incluyen "next" y "options"; solo el tipo correspondiente los usa.
const CANDIDATE_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "gdpsoft_tree_candidates_v2",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      normative_summary: { type: "string" },
      candidate_count: { type: "integer" },
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            confidence: { type: "number" },
            source_pages: { type: "string" },
            tree_json: {
              type: "object",
              additionalProperties: false,
              properties: {
                start_node: { type: "string" },
                nodes: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["question", "instruction", "result"] },
                      text: { type: "string" },
                      next: { type: ["string", "null"] },
                      options: {
                        type: "array",
                        items: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            label: { type: "string" },
                            next: { type: "string" },
                          },
                          required: ["label", "next"],
                        },
                      },
                    },
                    required: ["id", "type", "text", "next", "options"],
                  },
                },
              },
              required: ["start_node", "nodes"],
            },
          },
          required: ["title", "description", "confidence", "source_pages", "tree_json"],
        },
      },
    },
    required: ["normative_summary", "candidate_count", "candidates"],
  },
};

function cleanJsonText(text) {
  if (!text) {
    return "";
  }

  return String(text)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function normalizeConfidence(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(
    0,
    Math.min(1, number)
  );
}

function normalizeCandidate(
  candidate,
  index
) {
  if (
    !candidate ||
    typeof candidate !== "object"
  ) {
    return null;
  }

  const title =
    String(
      candidate.title || ""
    ).trim();

  if (!title) {
    return null;
  }

  const description =
    candidate.description
      ? String(
          candidate.description
        ).trim()
      : null;

  const sourcePages =
    candidate.source_pages
      ? String(
          candidate.source_pages
        ).trim()
      : null;

  const confidence =
    normalizeConfidence(
      candidate.confidence
    );

  let treeJson =
    candidate.tree_json;

  if (
    !treeJson ||
    typeof treeJson !== "object" ||
    Array.isArray(treeJson)
  ) {
    treeJson = {
      start_node: null,
      nodes: [],
    };
  }

  if (
    !Array.isArray(
      treeJson.nodes
    )
  ) {
    treeJson.nodes = [];
  }

  return {
    title,
    description,
    confidence,
    source_pages:
      sourcePages,
    generated_json: {
      ...treeJson,

      detection_order:
        index + 1,

      generated_from:
        "NORMATIVE_AI_ANALYSIS",
    },
  };
}

export async function POST(request) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  try {
    // =====================================================
    // VALIDAR CONFIGURACIÓN
    // =====================================================

    if (
      !process.env.OPENAI_API_KEY
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta OPENAI_API_KEY",
        },
        {
          status: 500,
        }
      );
    }

    if (
      !process.env
        .OPENAI_VECTOR_STORE_ID
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta OPENAI_VECTOR_STORE_ID",
        },
        {
          status: 500,
        }
      );
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 1, timeout: 90_000 });

    // =====================================================
    // BODY
    // =====================================================

    const body =
      await request.json();

    const normativeId =
      Number(
        body?.normative_id
      );

    const socialWorkId =
      Number(
        body?.social_work_id
      );

    const regenerate =
      body?.regenerate === true;

    if (!normativeId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "normative_id es obligatorio",
        },
        {
          status: 400,
        }
      );
    }

    if (!socialWorkId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "social_work_id es obligatorio",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // CARGAR NORMATIVA
    // =====================================================

    const {
      data: normative,
      error: normativeError,
    } =
      await supabaseAdmin
        .from("normatives")
        .select(`
          id,
          title,
          original_filename,
          status,
          version,
          is_current,
          openai_status,
          openai_file_id,
          openai_vector_store_file_id,
          openai_vector_store_id,
          document_kind
        `)
        .eq(
          "id",
          normativeId
        )
        .single();

    if (
      normativeError ||
      !normative
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Normativa no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    if (
      normative.is_current !==
      true
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La normativa no está vigente",
        },
        {
          status: 400,
        }
      );
    }

    if (
      normative.openai_status !==
      "completed"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La normativa todavía no está indexada correctamente en OpenAI",
          openai_status:
            normative.openai_status,
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // VALIDAR QUE LA NORMATIVA PERTENECE A ESA OOSS
    // =====================================================

    const {
      data: relation,
      error: relationError,
    } =
      await supabaseAdmin
        .from(
          "normative_social_works"
        )
        .select(`
          id,
          normative_id,
          social_work_id,
          document_role,
          scope_id,
          billing_channel_id
        `)
        .eq(
          "normative_id",
          normativeId
        )
        .eq(
          "social_work_id",
          socialWorkId
        )
        .limit(1)
        .maybeSingle();

    if (
      relationError ||
      !relation
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La normativa no está vinculada a la Obra Social indicada",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // CARGAR OOSS
    // =====================================================

    const {
      data: socialWork,
      error:
        socialWorkError,
    } =
      await supabaseAdmin
        .from("social_works")
        .select(`
          id,
          name,
          active,
          tys_code
        `)
        .eq(
          "id",
          socialWorkId
        )
        .single();

    if (
      socialWorkError ||
      !socialWork
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Obra Social no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    // =====================================================
    // EVITAR DUPLICADOS ACCIDENTALES
    // =====================================================

    const {
      data:
        existingCandidates,
      error:
        existingError,
    } =
      await supabaseAdmin
        .from(
          "decision_tree_candidates"
        )
        .select(`
          id,
          social_work_id,
          normative_id,
          title,
          description,
          confidence,
          source_pages,
          generated_json,
          status,
          created_at,
          updated_at
        `)
        .eq(
          "social_work_id",
          socialWorkId
        )
        .eq(
          "normative_id",
          normativeId
        )
        .order(
          "created_at",
          {
            ascending:
              true,
          }
        );

    // El lote nunca debe consumir OpenAI si esta combinación ya tiene
    // propuestas históricas (aprobadas/rechazadas incluidas) o un árbol.
    // La regeneración explícita es una acción separada del administrador.
    if (existingError) {
      return NextResponse.json({ ok: false, error: "No se pudo comprobar si ya existen propuestas" }, { status: 500 });
    }

    const { data: existingTrees, error: treesError } = await supabaseAdmin
      .from("decision_trees")
      .select("id")
      .eq("social_work_id", socialWorkId)
      .eq("normative_id", normativeId)
      .limit(1);

    if (treesError) {
      return NextResponse.json({ ok: false, error: "No se pudo comprobar si existen árboles" }, { status: 500 });
    }

    if (!regenerate && (existingCandidates.length > 0 || (existingTrees || []).length > 0)) {
      return NextResponse.json({
        ok: true,
        generated: false,
        reused: true,
        normative: { id: normative.id, title: normative.title, original_filename: normative.original_filename },
        social_work: { id: socialWork.id, name: socialWork.name },
        count: existingCandidates.length,
        candidates: existingCandidates,
      });
    }


// Búsqueda directa y generación estructurada en llamadas independientes.
// El resultado final no depende del texto que siga a una llamada de file_search.
function outputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) return response.output_text.trim();
  return (response?.output || [])
    .filter(item => item?.type === "message")
    .flatMap(item => item?.content || [])
    .filter(content => content?.type === "output_text" && typeof content?.text === "string")
    .map(content => content.text)
    .join("\n").trim();
}

function failWith(code, error, status = 422, diagnostic = {}) {
  return NextResponse.json({ ok: false, code, error, diagnostic }, { status });
}

function knownOpenAIError(error, stage) {
  const status = Number(error?.status) || 502;
  const safeStatus = [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].includes(status) ? status : 502;
  const rawMessage = String(error?.message || "");
  const known = rawMessage.slice(0, 320).replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTADO]");
  return failWith(stage === "search" ? "VECTOR_SEARCH_FAILED" : "OPENAI_REQUEST_FAILED",
    `Falló ${stage === "search" ? "la búsqueda de la normativa" : "la generación de OpenAI"} (HTTP ${safeStatus}). ${known}`,
    safeStatus >= 500 || safeStatus === 429 ? 502 : safeStatus,
    { stage, http_status: safeStatus, provider_code: error?.code || null });
}

function responseDiagnostic(response, stage) {
  return {
    stage,
    response_id: response?.id || null,
    status: response?.status || null,
    incomplete_reason: response?.incomplete_details?.reason || null,
    output_types: (response?.output || []).map(x => x?.type).slice(0, 12),
    output_chars: outputText(response).length,
    output_tokens: response?.usage?.output_tokens ?? null,
  };
}

function validateCandidates(parsed) {
  if (!parsed || !Array.isArray(parsed.candidates)) {
    return { ok: false, code: "INVALID_AI_SCHEMA", error: "No se recibió una lista de propuestas", issues: ["candidates debe ser un arreglo"] };
  }
  // Una normativa puede abarcar más de tres circuitos independientes.
  // No descartar una respuesta válida por una cuota de árboles arbitraria:
  // cada propuesta se revisa con validateTree y permanece SUGGESTED.
  const candidates = parsed.candidates.map(normalizeCandidate);
  const issues = [];
  candidates.forEach((candidate, index) => {
    if (!candidate) { issues.push(`Propuesta ${index + 1}: faltan título o estructura`); return; }
    const graphErrors = validateTree(candidate.generated_json);
    for (const error of graphErrors) issues.push(`Propuesta ${index + 1}: ${error}`);
    // validateTree ya limita a 100 nodos y comprueba todos los enlaces.
    for (const node of candidate.generated_json.nodes) {
      if (node.type === "result" && /^(resultado final|fin|listo|terminar)$/i.test(String(node.text || "").trim()))
        issues.push(`Propuesta ${index + 1}: el resultado debe indicar una acción o condición concreta`);
    }
  });
  return issues.length
    ? { ok: false, code: "INVALID_TREE_GRAPH", error: "La IA entregó recorridos incompletos", issues: issues.slice(0, 8) }
    : { ok: true, candidates };
}

async function requestCandidates(openai, model, evidence, context, repair = null) {
  const instructions = `Sos analista de procedimientos de farmacia. Trabajás EXCLUSIVAMENTE con la evidencia de UNA normativa proporcionada. Tu objetivo es convertir reglas verificables en ÁRBOLES DE DECISIÓN para el personal de mostrador.
DETECCIÓN: considerá decisiones operativas expresiones como "obligatorio", "no se acepta", "solo si", "salvo", "hasta N", "previa autorización", "dentro de N días", "por receta", "debe adjuntar", "por plan". Una normativa NO necesita contener un diagrama o preguntas literales: transformá estas condiciones en preguntas de SÍ/NO con instrucciones y resultados respaldados. Por ejemplo, "la validación online es obligatoria" implica comprobar "¿Cuenta con validación online?" y, en la rama negativa, orientar conforme a la misma norma, sin inventar autorizaciones.
A partir de apartados INDEPENDIENTES documentados (validación, vigencia, requisitos de receta, cantidades, autorizaciones, presentación, coberturas, etc.) construí tantos árboles como amerite la evidencia, sin límite artificial y sin repetir el mismo tema.
OBLIGATORIO: No inventes requisitos, importes, cobertura, autorizaciones ni excepciones. Si una condición no tiene una solución autorizada documentada, el resultado terminal será "Detener la operación y consultar al área de Obras Sociales o farmacéutico antes de continuar", nunca asumir aprobación o forzar cobertura. Las condiciones temporales históricas o campañas fechadas requieren indicar que se debe comprobar su vigencia actual; no presentarlas como reglas vigentes.
FORMA: JSON estricto. Cada árbol tiene inicio, preguntas con >=2 opciones, instrucciones con destino next, resultados con texto útil y sin destino. Cada rama debe terminar en resultado CONCRETO, sin nodos desconectados ni bucles. Limitar a 100 nodos por árbol. source_pages solo si las páginas son verificables en la evidencia; de lo contrario cadena vacía. El campo confidence indica qué tan explícito es el respaldo, no precisión inventada.
Solamente usar candidates=[] si NO hay NINGUNA regla operativa verificable en toda la evidencia. Si ves reglas como validación obligatoria, vencimiento o topes, DEVOLVÉ candidatos basados en esas reglas; no declares falta de decisiones por no encontrar preguntas explícitas. Nunca uses conocimiento externo.`;
  const repairInfo = repair
    ? `\nTU RESPUESTA PREVIA NO PASÓ VALIDACIÓN: ${repair.issues.join(" | ")}. Corregí la estructura sin inventar nuevos requisitos. RESPUESTA PREVIA (referencia editable): ${JSON.stringify(repair.original).slice(0, 12500)}`
    : "";
  const input = `Obra social: ${context.socialWorkName} (ID ${context.socialWorkId})\nNormativa: ${context.title} (ID ${context.normativeId})\n\nEVIDENCIA EXCLUSIVA DE ESTA NORMATIVA:\n${evidence}${repairInfo}`;
  const response = await openai.responses.create({
    model,
    store: false,
    max_output_tokens: 12000,
    text: { format: CANDIDATE_RESPONSE_FORMAT },
    instructions,
    input,
  });
  const diag = responseDiagnostic(response, repair ? "repair" : "generation");
  if (response.status === "incomplete") {
    return { ok: false, code: "AI_INCOMPLETE", error: `OpenAI interrumpió la respuesta (${diag.incomplete_reason || "motivo desconocido"})`, diagnostic: diag };
  }
  const refusals = (response.output || []).flatMap(item => item?.content || []).filter(c => c.type === "refusal");
  if (refusals.length) return { ok: false, code: "AI_REFUSAL", error: "OpenAI no pudo elaborar la respuesta solicitada", diagnostic: diag };
  const text = cleanJsonText(outputText(response));
  if (!text) return { ok: false, code: "AI_EMPTY_OUTPUT", error: "OpenAI completó sin devolver texto JSON", diagnostic: diag };
  let parsed;
  try { parsed = JSON.parse(text); }
  catch {
    return { ok: false, code: "INVALID_AI_JSON", error: "El contenido recibido no es JSON interpretable", diagnostic: { ...diag, starts_with: text.slice(0, 60), ends_with: text.slice(-60) } };
  }
  const checked = validateCandidates(parsed);
  if (!checked.ok) return { ...checked, diagnostic: diag, original: parsed, response };
  return { ok: true, parsed, normalizedCandidates: checked.candidates, response };
}

// Rescate estructural tras agotar el intento de reparación por IA.
// Las propuestas correctas se mantienen. Los enlaces sin destino se convierten
// en resultados de BLOQUEO para revisión (nunca en autorizaciones inventadas).
function salvageTreeDrafts(draft) {
  if (!draft?.original || !Array.isArray(draft.original.candidates)) return null;
  const rescued = [];
  const warnings = [];
  let blocked = 0;
  let skipped = 0;
  for (let i = 0; i < draft.original.candidates.length; i++) {
    const normalized = normalizeCandidate(draft.original.candidates[i], i);
    if (!normalized) {
      skipped++;
      warnings.push(`Propuesta ${i + 1}: se descartó por falta de título o estructura`);
      continue;
    }
    let candidate = normalized;
    let issues = validateTree(candidate.generated_json);
    if (issues.length) {
      const repaired = repairMissingDestinations(candidate.generated_json);
      if (repaired.warnings.length) {
        candidate = {
          ...candidate,
          description: [candidate.description || "", "REVISIÓN OBLIGATORIA: existen pasos sin definición normativa. Completar en el editor visual antes de aprobar."].filter(Boolean).join(" | "),
          generated_json: repaired.tree,
        };
        warnings.push(...repaired.warnings.map(w => `Propuesta ${i + 1}: ${w}`));
      }
      issues = validateTree(candidate.generated_json);
    }
    for (const node of candidate.generated_json.nodes || []) {
      if (node.type === "result" && /^(resultado final|fin|listo|terminar)$/i.test(String(node.text || "").trim()))
        issues.push("El resultado terminal es genérico y requiere una acción concreta");
    }
    if (issues.length) {
      skipped++;
      warnings.push(`Propuesta ${i + 1} OMITIDA (no se guardó): ${issues.slice(0, 3).join("; ")}`);
      continue;
    }
    if (hasUnresolvedReview(candidate.generated_json)) blocked++;
    rescued.push(candidate);
  }
  if (!rescued.length) return null;
  return {
    ok: true,
    parsed: draft.original,
    normalizedCandidates: rescued,
    response: draft.response || { usage: null, id: null },
    warnings: warnings.slice(0, 30),
    pending_review_count: blocked,
    skipped_count: skipped,
    rescued: true,
  };
}

// Dos búsquedas dirigidas al mismo documento: los primeros resultados de una
// consulta genérica no son necesariamente los apartados con reglas de atención.
const EVIDENCE_QUERIES = [
  "validación obligatoria online receta sin validar autorización expresa qué hacer ante rechazo y débito",
  "requisitos receta plazo vigencia documentación del beneficiario firma sello diagnóstico enmiendas",
  "límites cantidades por receta renglón envases topes antibióticos inyectables",
  "planes descuentos cobertura empadronamiento excepciones medicamentos autorizados PMI diabetes vacunas",
  "facturación tickets troqueles presentación comprobante autorización procedimientos especiales",
];

function safeEvidenceMetrics(searchResults) {
  return {
    stage: "normative_evidence",
    matching_results: searchResults.hitCount,
    extracted_fragments: searchResults.usedCount,
    extracted_characters: searchResults.evidence.length,
    normative_files: searchResults.filenames.slice(0, 8),
  };
}

async function getEvidence(openai, vectorStoreId, normativeId, fileIds, searches = EVIDENCE_QUERIES) {
  const results = await openai.vectorStores.search(vectorStoreId, {
    query: searches,
    max_num_results: 50,
    filters: { type: "and", filters: [
      { type: "eq", key: "normative_id", value: normativeId },
      { type: "eq", key: "is_current", value: true },
    ] },
  });
  let hits = Array.isArray(results?.data) ? results.data : [];
  // Nunca incluir fragmentos de una normativa distinta.
  hits = hits.filter(hit => {
    if (hit.attributes?.normative_id != null) return String(hit.attributes.normative_id) === String(normativeId);
    return fileIds.length > 0 && Boolean(hit.file_id) && fileIds.includes(hit.file_id);
  });
  const seen = new Set();
  const filenames = new Set();
  const chunks = [];
  let total = 0;
  for (const hit of hits) {
    const content = (hit.content || []).filter(c => c?.type === "text").map(c => c.text || "").join("\n").trim();
    if (!content) continue;
    const key = content.replace(/\s+/g, " ").slice(0, 240);
    if (seen.has(key)) continue;
    seen.add(key);
    filenames.add(hit.filename || hit.file_id || "archivo sin nombre");
    const snippet = `[Fuente: ${hit.filename || hit.file_id || "normativa"}; fragmento recuperado]\n${content.slice(0, 2500)}`;
    if (total + snippet.length > 38000) break;
    chunks.push(snippet);
    total += snippet.length;
  }
  return { evidence: chunks.join("\n\n-----\n\n"), hitCount: hits.length, usedCount: chunks.length, filenames: [...filenames] };
}

    // 1) Obtener evidencia de la normativa por búsqueda directa (sin generación de texto).
    const vectorStoreId = normative.openai_vector_store_id || process.env.OPENAI_VECTOR_STORE_ID;
    const fileIds = [...new Set([normative.openai_file_id, normative.openai_vector_store_file_id].filter(Boolean))];
    let searchResults;
    try {
      searchResults = await getEvidence(openai, vectorStoreId, normativeId, fileIds);
    } catch (err) {
      console.error("GDPSoft árbol: búsqueda vectorial", { normativeId, socialWorkId, status: err.status, code: err.code });
      return knownOpenAIError(err, "search");
    }
    if (!searchResults.evidence) {
      return failWith("NO_NORMATIVE_EVIDENCE", "No se recuperaron fragmentos verificables de esta normativa. Revisá su indexación y atributos en OpenAI antes de reintentar.", 422,
        { stage: "search", normative_id: normativeId, matching_results: searchResults.hitCount });
    }

    // 2) Generar los recorridos respaldados por la normativa, sin límite fijo de 3.
    // La cantidad depende del documento, no de una cuota artificial.
    const contextData = { socialWorkName: socialWork.name, socialWorkId, normativeId, title: normative.title };
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    let draft;
    try { draft = await requestCandidates(openai, model, searchResults.evidence, contextData); }
    catch (err) {
      console.error("GDPSoft árbol: generación", { normativeId, socialWorkId, status: err.status, code: err.code });
      return knownOpenAIError(err, "generation");
    }

    // Primero intentar reparación semántica por IA. Si todavía queda un enlace
    // roto, rescatar las propuestas verificables y BLOQUEAR la rama incompleta.
    // No se añade una instrucción clínica ni se da por autorizada ninguna dispensa.
    if (!draft.ok && draft.code === "INVALID_TREE_GRAPH" && draft.original) {
      const initial = draft;
      try {
        const repaired = await requestCandidates(openai, model, searchResults.evidence, contextData, {
          issues: draft.issues || [], original: draft.original,
        });
        draft = repaired;
      } catch (err) {
        console.error("GDPSoft árbol: reparación", { normativeId, socialWorkId, status: err.status, code: err.code });
        const salvage = salvageTreeDrafts(initial);
        if (salvage) draft = salvage;
        else return knownOpenAIError(err, "generation");
      }
      if (!draft.ok || (draft.ok && draft.normalizedCandidates?.length === 0)) {
        const a = salvageTreeDrafts(initial);
        const b = salvageTreeDrafts(draft);
        draft = [a, b].filter(Boolean).sort((x, y) =>
          y.normalizedCandidates.length - x.normalizedCandidates.length ||
          x.pending_review_count - y.pending_review_count
        )[0] || draft;
      }
    }

    if (!draft.ok) {
      console.error("GDPSoft árbol: respuesta rechazada", {
        normativeId, socialWorkId, code: draft.code, diagnostic: draft.diagnostic,
      });
      return failWith(draft.code, `${draft.error}${draft.issues?.length ? ". " + draft.issues.join("; ") : ""}`,
        422, draft.diagnostic || {});
    }

    // Importante: que el modelo responda [] NO demuestra que la normativa carece
    // de decisiones. Buscar apartados específicos e intentar una segunda pasada.
    if (draft.normalizedCandidates.length === 0) {
      const queries = [
        "VALIDACIÓN OBLIGATORIA recetas no validadas serán debitadas autorización expresa",
        "LÍMITES DE CANTIDADES medicamentos por receta renglón envases antibióticos",
        "DOCUMENTACIÓN BENEFICIARIO RECETARIO VALIDEZ planes cobertura requisitos farmacia",
      ];
      let supplemental;
      try { supplemental = await getEvidence(openai, vectorStoreId, normativeId, fileIds, queries); }
      catch (err) { return knownOpenAIError(err, "search"); }
      const expandedEvidence = supplemental.evidence && supplemental.evidence !== searchResults.evidence
        ? `${searchResults.evidence.slice(0, 22000)}\n\n----- EVIDENCIA COMPLEMENTARIA -----\n\n${supplemental.evidence.slice(0, 18000)}`
        : searchResults.evidence;
      try { draft = await requestCandidates(openai, model, expandedEvidence, contextData); }
      catch (err) { return knownOpenAIError(err, "generation"); }
      if (!draft.ok && draft.code === "INVALID_TREE_GRAPH" && draft.original) {
        const initial = draft;
        try {
          draft = await requestCandidates(openai, model, expandedEvidence, contextData, {
            issues: draft.issues || [], original: draft.original,
          });
        } catch (err) {
          draft = salvageTreeDrafts(initial) || draft;
          if (!draft.ok) return knownOpenAIError(err, "generation");
        }
        if (!draft.ok || (draft.ok && draft.normalizedCandidates?.length === 0)) {
          const a = salvageTreeDrafts(initial);
          const b = salvageTreeDrafts(draft);
          draft = [a, b].filter(Boolean).sort((x,y) =>
            y.normalizedCandidates.length - x.normalizedCandidates.length ||
            x.pending_review_count - y.pending_review_count
          )[0] || draft;
        }
      }
      if (!draft.ok) {
        return failWith(draft.code, `${draft.error}${draft.issues?.length ? ". " + draft.issues.join("; ") : ""}`,
          422, { ...draft.diagnostic, ...safeEvidenceMetrics(searchResults), second_pass: true });
      }
    }

    const { parsed, normalizedCandidates, response } = draft;
    if (normalizedCandidates.length === 0) {
      // Evitamos marcar falsamente como 'analizada sin decisiones'.
      return failWith("NO_DECISIONS_NEEDS_REVIEW",
        "La IA devolvió cero propuestas incluso tras una segunda lectura. No implica que la normativa carezca de decisiones: revisar el documento y sus fragmentos indexados.",
        422, { ...safeEvidenceMetrics(searchResults), normative_summary: String(parsed.normative_summary || "").slice(0, 700), second_pass: true, response_id: response?.id || null });
    }

    // =====================================================
    // REGENERAR
    // NO BORRAMOS HISTÓRICO
    // RECHAZAMOS SUGERENCIAS ANTERIORES
    // =====================================================

    if (
      regenerate &&
      Array.isArray(
        existingCandidates
      ) &&
      existingCandidates.length >
        0
    ) {
      const oldIds = existingCandidates
        .filter(item => item.status === "SUGGESTED")
        .map(item => item.id);

      if (oldIds.length > 0) await supabaseAdmin
        .from(
          "decision_tree_candidates"
        )
        .update({
          status:
            "REJECTED",

          reviewed_at:
            new Date().toISOString(),

          updated_at:
            new Date().toISOString(),
        })
        .in(
          "id",
          oldIds
        );
    }

    // =====================================================
    // GUARDAR CANDIDATOS
    // =====================================================

    const rows =
      normalizedCandidates.map(
        (candidate) => ({
          social_work_id:
            socialWorkId,

          normative_id:
            normativeId,

          title:
            candidate.title,

          description:
            candidate.description,

          confidence:
            candidate.confidence,

          source_pages:
            candidate.source_pages,

          generated_json:
            candidate.generated_json,

          status:
            "SUGGESTED",

          created_by:
            auth.actor.id,

          reviewed_by:
            null,

          reviewed_at:
            null,

          updated_at:
            new Date().toISOString(),
        })
      );

    const {
      data:
        savedCandidates,

      error:
        insertError,
    } =
      await supabaseAdmin
        .from(
          "decision_tree_candidates"
        )
        .insert(rows)
        .select(`
          id,
          social_work_id,
          normative_id,
          title,
          description,
          confidence,
          source_pages,
          generated_json,
          status,
          created_at,
          updated_at
        `);

    if (insertError) {
      console.error(
        "Error guardando candidatos:",
        insertError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Se detectaron árboles pero no pudieron guardarse",
          details:
            process.env.NODE_ENV ===
            "development"
              ? insertError.message
              : undefined,
        },
        {
          status: 500,
        }
      );
    }

    // =====================================================
    // RESPUESTA
    // =====================================================

    return NextResponse.json({
      ok: true,

      generated:
        true,

      reused:
        false,

      normative: {
        id:
          normative.id,

        title:
          normative.title,

        original_filename:
          normative.original_filename,

        version:
          normative.version,
      },

      social_work: {
        id:
          socialWork.id,

        name:
          socialWork.name,
      },

      normative_summary:
        parsed?.normative_summary ||
        null,

      count:
        savedCandidates?.length ||
        0,

      warnings: draft.warnings || [],
      pending_review_count: draft.pending_review_count || 0,
      skipped_count: draft.skipped_count || 0,
      generated_with_observations: Boolean(draft.warnings?.length),

      candidates:
        savedCandidates || [],

      search_results:
        searchResults.hitCount,

      usage:
        response.usage ||
        null,

      response_id:
        response.id ||
        null,
    });
  } catch (error) {
    console.error(
      "POST /api/decision-tree-candidates/generate error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al analizar la normativa para generar árboles",
        code: "UNEXPECTED_GENERATION_ERROR",
        details:
          process.env.NODE_ENV ===
          "development"
            ? error?.message
            : undefined,
      },
      {
        status: 500,
      }
    );
  }
}