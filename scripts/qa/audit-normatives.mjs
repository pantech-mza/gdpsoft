import OpenAI from "openai";
import {
  argValue, hasFlag, getSupabase, fetchAll, isNoInfo, saveExports, upsertAudit
} from "./audit-common.mjs";

const runId = argValue("run");
const limit = Number(argValue("limit", "0")) || 0;
const onlyNoInfo = hasFlag("only-no-info");
const caseId = argValue("case-id");
const debugSearch = hasFlag("debug-search");
const dryRun = hasFlag("dry-run");
const auditVersion = "v1.5-short-literal-quote";
if (!runId) {
  console.error("Uso: node scripts/qa/audit-normatives.mjs --run=<RUN_ID> [--limit=20] [--only-no-info] [--case-id=BAT-SW-153-GENERAL] [--debug-search] [--dry-run]");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
if (!process.env.OPENAI_VECTOR_STORE_ID) throw new Error("Falta OPENAI_VECTOR_STORE_ID");

const supabase = getSupabase();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const allFails = await fetchAll(() =>
  supabase.from("assistant_qa_results")
    .select("id,run_id,case_id,suite,category,social_work_id,normative_id,question,expected,actual,route,source,model,elapsed_ms,status,score,failure_reason,quality_score")
    .eq("run_id", runId)
    .eq("status", "FAIL")
    .order("created_at", { ascending: true })
);

let rows = allFails;
if (onlyNoInfo) rows = rows.filter((r) => isNoInfo(r.actual?.answer || r.actual?.text || ""));
if (caseId) rows = rows.filter((r) => r.case_id === caseId);
if (limit > 0) rows = rows.slice(0, limit);

console.log(`FAIL encontrados: ${allFails.length}`);
console.log(`Casos a auditar: ${rows.length}`);
console.log(`Modo: ${dryRun ? "DRY RUN" : "GUARDAR RESULTADOS"}\n`);

// V1.2: ninguna evidencia documental se considera confirmada solo por el texto generado por el modelo.
// Se exige que la cita aparezca literalmente en los fragmentos devueltos por File Search.
function normalizedQuote(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[“”„«»]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ").trim();
}
// Diagnóstico de estructura: OpenAI puede devolver la búsqueda sin resultados incluidos,
// o fragmentos con distintas representaciones de content. No imprimimos texto privado.
function inspectSearch(response) {
  const calls = (response.output || []).filter(x => x.type === "file_search_call");
  const results = calls.flatMap(call => Array.isArray(call.results) ? call.results : []);
  const files = [];
  for (const result of results) {
    const filename = result.filename || result.file_name || "";
    // Responses API File Search devuelve texto normalmente en result.text.
    // Conservamos compatibilidad con respuestas que utilizan result.content.
    const parts = Array.isArray(result.content) ? result.content : (result.content ? [result.content] : []);
    const contentText = parts.map(c => typeof c === "string" ? c : (c?.text || c?.content || ""))
      .filter(x => typeof x === "string").join("\n");
    const directText = typeof result.text === "string" ? result.text : "";
    const snippet = directText || contentText;
    if (snippet.trim()) files.push({ filename, text: snippet });
  }
  return {
    files,
    diagnostic: {
      response_status: response.status || null,
      output_types: (response.output || []).map(x => x.type || "unknown"),
      file_search_calls: calls.length,
      file_search_statuses: calls.map(x => x.status || null),
      results_present: calls.map(x => Object.prototype.hasOwnProperty.call(x, "results")),
      result_count: results.length,
      text_snippet_count: files.length,
      result_field_names: results.slice(0, 2).map(r => Object.keys(r).sort()),
      result_content_shapes: results.slice(0, 2).map(r => Array.isArray(r.content) ? "array" : typeof r.content),
      result_text_types: results.slice(0, 2).map(r => typeof r.text),
      result_text_lengths: results.slice(0, 2).map(r => typeof r.text === "string" ? r.text.length : 0),
    }
  };
}
function validateDocumentEvidence(verdict, evidence, filename, files) {
  if (!["FOUND_IN_SOURCE", "CONTRADICTED"].includes(verdict)) return { valid: true, why: "not_document_claim" };
  if (!files.length) return { valid: false, why: "no_file_search_results" };
  const quote = normalizedQuote(evidence);
  if (quote.length < 20) return { valid: false, why: "missing_or_short_literal_quote" };
  const relevant = filename ? files.filter(f => normalizedQuote(f.filename) === normalizedQuote(filename)) : [];
  if (!relevant.length) return { valid: false, why: "filename_not_retrieved" };
  if (!relevant.some(f => normalizedQuote(f.text).includes(quote))) {
    return { valid: false, why: "quote_not_in_retrieved_snippet", filename_matches: relevant.length, quote_length: quote.length };
  }
  return { valid: true, why: "literal_quote_verified" };
}

const out = [];
let i = 0;
for (const qa of rows) {
  i++;
  const answer = qa.actual?.answer || qa.actual?.text || "";
  const { data: sw } = await supabase.from("social_works").select("*").eq("id", qa.social_work_id).maybeSingle();

  const structured = sw ? {
    id: sw.id,
    name: sw.name,
    plan: sw.plan,
    recipe_type: sw.recipe_type,
    recipe_validity: sw.recipe_validity,
    letterhead: sw.letterhead,
    rp: sw.rp,
    validator_name: sw.validator_name,
    validator_type: sw.validator_type,
    diagnosis: sw.diagnosis,
    monodrug: sw.monodrug,
    commercial_name: sw.commercial_name,
    substitution: sw.substitution,
    observations: sw.observations,
  } : null;

  const instructions = `
Sos un auditor documental conservador de GDPSoft para dispensación farmacéutica. Tu evaluación NO decide normas operativas: solo determina si existe prueba directa para responder la pregunta EXACTA.

Clasificá con uno de estos verdict:
FOUND_IN_SOURCE: evidencia documental explícita que responde exactamente la pregunta; NO alcanza información relacionada.
CONTRADICTED: la respuesta original afirma algo y un texto documental explícito demuestra lo contrario.
STRUCTURED_ONLY: el perfil estructurado provisto responde directamente, pero no hay evidencia documental suficiente.
NOT_FOUND: la búsqueda no encontró evidencia; NO afirmes que el dato está ausente de todas las normativas.
NEEDS_REVIEW: evidencia ambigua, insuficiente, indirecta o con contextos mezclados.

Reglas obligatorias:
- Firma del médico != firma del afiliado != firma del farmacéutico != firma de quien retira.
- Sello del médico != sello de cobertura != sello de la farmacia.
- Autorización, firma de recepción y validación electrónica son conceptos diferentes.
- Receta exigida != sello exigido; receta válida != firma exigida.
- Datos de medicamento != datos de beneficiario.
- Firma != sello. No infieras obligaciones con "implica", "generalmente" o "sugiere".
- Una mención de la palabra preguntada NO basta: debe responder el requisito específico, con su alcance y excepciones.
- No inferir obligatoriedad desde prácticas generales. Si hay variantes o circuitos, aclarar el alcance.
- No uses las expectativas QA como evidencia. No presupongas que un FAIL es una respuesta equivocada.
- Para FOUND_IN_SOURCE y CONTRADICTED: evidence DEBE ser una cita TEXTUAL EXACTA, preferentemente entre 30 y 120 caracteres y nunca una frase ensamblada de varios tramos. Copiá una sola secuencia CONTIGUA de UN único resultado de File Search.
- No parafrasees, corrijas ortografía, normalices signos, agregues conectores ni combines fragmentos al escribir evidence.
- Elegí una cita corta y suficiente para la pregunta, y evidence_filename debe ser exactamente el nombre del archivo correspondiente.
- Si la respuesta requiere combinar varias citas, o no podés copiar un tramo CONTIGUO que baste, devolvé NEEDS_REVIEW sin presentar la síntesis como prueba literal.
- Si no recuperaste resultados verificables, devolvé NEEDS_REVIEW, salvo STRUCTURED_ONLY cuando el perfil realmente contiene respuesta explícita.
- Si encontrás algo parecido pero no exactamente equivalente, NEEDS_REVIEW.
- NOT_FOUND significa solo ausencia en los fragmentos recuperados, no ausencia global.
- Respondé únicamente JSON válido: {"verdict":"...","reason":"...","evidence":"...","evidence_filename":"..."}.
`;

  const input = JSON.stringify({
    social_work_id: qa.social_work_id,
    social_work_name: sw?.name || null,
    question: qa.question,
    original_answer: answer,
    original_route: qa.route,
    original_source: qa.source,
    structured_profile: structured,
  });

  let verdict = "NEEDS_REVIEW", reason = "", evidence = "", evidence_filename = null;
  let searchDiagnostic = null;
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_AUDIT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      store: false,
      max_output_tokens: 500,
      instructions,
      input,
      tool_choice: "required",
      tools: [{
        type: "file_search",
        vector_store_ids: [process.env.OPENAI_VECTOR_STORE_ID],
        max_num_results: 8,
        filters: {
          type: "and",
          filters: [
            { type: "or", filters: [
              { type: "eq", key: "social_work_id", value: qa.social_work_id },
              { type: "eq", key: "secondary_social_work_id", value: qa.social_work_id },
            ]},
            { type: "eq", key: "is_current", value: true },
          ],
        },
      }],
      include: ["file_search_call.results"],
    });

    let parsed;
    try { parsed = JSON.parse(response.output_text); }
    catch {
      const match = response.output_text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : null;
    }
    const search = inspectSearch(response);
    const files = search.files;
    searchDiagnostic = search.diagnostic;
    if (debugSearch) console.log(`  SEARCH ${qa.case_id}: ${JSON.stringify(searchDiagnostic)}`);
    if (parsed) {
      verdict = parsed.verdict || verdict;
      reason = parsed.reason || "";
      evidence = parsed.evidence || "";
      evidence_filename = parsed.evidence_filename || null;
    }
    const supportedVerdicts = ["FOUND_IN_SOURCE", "CONTRADICTED", "STRUCTURED_ONLY", "NOT_FOUND", "NEEDS_REVIEW"];
    if (!supportedVerdicts.includes(verdict)) {
      reason = `Veredicto no reconocido: ${verdict}`;
      verdict = "NEEDS_REVIEW";
    }
    const check = validateDocumentEvidence(verdict, evidence, evidence_filename, files);
    if (!check.valid) {
      reason = `[EVIDENCE_GATE:${check.why}] ${reason}`;
      if (debugSearch) console.log(`  GATE ${qa.case_id}: ${JSON.stringify({why:check.why, quote_length:check.quote_length ?? normalizedQuote(evidence).length, filename_matches:check.filename_matches ?? null})}`);
      verdict = "NEEDS_REVIEW";
    }
    if (verdict === "NOT_FOUND") {
      if (!searchDiagnostic?.result_count) {
        verdict = "NEEDS_REVIEW";
        reason = `[SIN RESULTADOS VERIFICABLES: no confirma ausencia documental] ${reason}`;
      } else {
        reason = `[BÚSQUEDA NO EXHAUSTIVA] ${reason}`;
      }
    }

  } catch (e) {
    verdict = "NEEDS_REVIEW";
    reason = `Error auditor OpenAI: ${e.message}`;
  }

  const audit = {
    run_id: runId,
    qa_result_id: qa.id,
    case_id: qa.case_id,
    audit_type: "NORMATIVE",
    social_work_id: qa.social_work_id,
    question: qa.question,
    original_status: qa.status,
    original_answer: answer,
    route: qa.route,
    source: qa.source,
    verdict,
    reason,
    evidence,
    evidence_filename,
    elapsed_ms: qa.elapsed_ms,
    model: process.env.OPENAI_AUDIT_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
    metadata: { audit_version: auditVersion, category: qa.category, normative_id: qa.normative_id, expected: qa.expected, original_failure_reason: qa.failure_reason, structured_profile_checked: Boolean(structured), search_scope: "vector_store_top8_non_exhaustive", search_diagnostic: searchDiagnostic },
    updated_at: new Date().toISOString(),
  };

  if (!dryRun) await upsertAudit(supabase, audit);
  out.push(audit);
  console.log(`[${i}/${rows.length}] ${sw?.name || qa.social_work_id} · ${qa.case_id} → ${verdict}`);
}

const paths = await saveExports(`normative-audit-v1_5-${runId}${caseId ? `-${caseId}` : ""}`, out);
const counts = out.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
console.log("\nRESUMEN:", counts);
console.log("JSON:", paths.jsonPath);
console.log("CSV :", paths.csvPath);
