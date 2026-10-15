import { scopeLinkedNormatives } from "../../../../lib/assistant/linked-normatives.mjs";
import OpenAI from "openai";
import { resolveOperation } from "../../../../lib/operations/resolve-operation";
import { formatCircuitResponse } from "../../../../lib/operations/camara-colegio-policy.mjs";

import {
  supabaseAdmin,
} from "../../../../lib/supabase/admin";
import { needsManualPrescriptionReview, buildUncertainPrescriptionReply } from "../../../../lib/assistant/prescription-safety.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI({
  apiKey:
    process.env.OPENAI_API_KEY,
});

const BUCKET =
  "assistant-images";

// =========================================================
// CONFIGURACIÓN
// =========================================================

const PRINTED_CONFIDENCE =
  0.95;

const HANDWRITTEN_CONFIDENCE =
  0.99;

const SOCIAL_WORK_AUTO_CONFIDENCE =
  0.98;

// =========================================================
// CAMPOS VISUALES CANÓNICOS
// =========================================================

const CANONICAL_VISUAL_FIELDS =
  new Set([
    "letterhead",
    "institution_name",

    "social_work_name",

    "patient_name",
    "affiliate_number",

    "prescription_date",

    "doctor_name",
    "doctor_registration_number",
    "doctor_signature",
    "doctor_stamp",

    "diagnosis",

    "active_ingredient",
    "medication_name",
    "concentration",
    "dosage",
    "quantity",
    "presentation",

    "authorization_number",
    "prescription_number",

    "other",
  ]);

// =========================================================
// CAMPOS CRÍTICOS
// =========================================================

const CRITICAL_FIELDS =
  new Set([
    "social_work_name",

    "patient_name",
    "affiliate_number",

    "prescription_date",

    "doctor_name",
    "doctor_registration_number",

    "diagnosis",

    "active_ingredient",
    "medication_name",
    "concentration",
    "dosage",
    "quantity",
    "presentation",

    "authorization_number",
    "prescription_number",
  ]);

// =========================================================
// REQUISITO NORMATIVO → CAMPO VISUAL PERMITIDO
// =========================================================

const REQUIREMENT_FIELD_MAP = {
  letterhead: [
    "letterhead",
    "institution_name",
  ],

  institution_name: [
    "institution_name",
    "letterhead",
  ],

  social_work_name: [
    "social_work_name",
  ],

  patient_name: [
    "patient_name",
  ],

  affiliate_number: [
    "affiliate_number",
  ],

  prescription_date: [
    "prescription_date",
  ],

  doctor_name: [
    "doctor_name",
  ],

  doctor_registration_number: [
    "doctor_registration_number",
  ],

  doctor_signature: [
    "doctor_signature",
  ],

  doctor_stamp: [
    "doctor_stamp",
  ],

  diagnosis: [
    "diagnosis",
  ],

  active_ingredient: [
    "active_ingredient",
  ],

  medication_name: [
    "medication_name",
  ],

  concentration: [
    "concentration",
  ],

  dosage: [
    "dosage",
  ],

  quantity: [
    "quantity",
  ],

  presentation: [
    "presentation",
  ],

  authorization_number: [
    "authorization_number",
  ],

  prescription_number: [
    "prescription_number",
  ],

  other: [],
};

// =========================================================
// NORMALIZAR
// =========================================================

function normalizeText(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

// =========================================================
// FRASE COMPLETA
// =========================================================

function containsWholePhrase(
  text,
  phrase
) {
  const normalizedText =
    ` ${normalizeText(
      text
    )} `;

  const normalizedPhrase =
    normalizeText(
      phrase
    );

  if (!normalizedPhrase) {
    return false;
  }

  return normalizedText.includes(
    ` ${normalizedPhrase} `
  );
}

// =========================================================
// CAMPO CANÓNICO
// =========================================================

function canonicalFieldName(
  value
) {
  const key =
    normalizeText(
      value
    )
      .replace(
        /\s+/g,
        "_"
      );

  const aliases = {
    hospital_name:
      "institution_name",

    medical_center:
      "institution_name",

    medical_center_name:
      "institution_name",

    institution:
      "institution_name",

    membrete:
      "letterhead",

    header:
      "letterhead",

    entity_name:
      "social_work_name",

    os_social:
      "social_work_name",

    obra_social:
      "social_work_name",

    ooss:
      "social_work_name",

    social_work:
      "social_work_name",

    patient:
      "patient_name",

    beneficiary_name:
      "patient_name",

    nombre_paciente:
      "patient_name",

    affiliate:
      "affiliate_number",

    member_number:
      "affiliate_number",

    beneficiary_number:
      "affiliate_number",

    socio_number:
      "affiliate_number",

    prescription_code:
      "affiliate_number",

    numero_afiliado:
      "affiliate_number",

    numero_socio:
      "affiliate_number",

    date:
      "prescription_date",

    fecha:
      "prescription_date",

    prescription_date:
      "prescription_date",

    doctor:
      "doctor_name",

    physician_name:
      "doctor_name",

    doctor_matricula:
      "doctor_registration_number",

    registration_number:
      "doctor_registration_number",

    matricula:
      "doctor_registration_number",

    physician_registration:
      "doctor_registration_number",

    signature:
      "doctor_signature",

    firma:
      "doctor_signature",

    stamp:
      "doctor_stamp",

    sello:
      "doctor_stamp",

    diagnosis:
      "diagnosis",

    diagnostico:
      "diagnosis",

    generic_name:
      "active_ingredient",

    monodrug:
      "active_ingredient",

    droga:
      "active_ingredient",

    principio_activo:
      "active_ingredient",

    medication:
      "medication_name",

    medicine:
      "medication_name",

    medicamento:
      "medication_name",

    drug_name:
      "medication_name",

    potency:
      "concentration",

    concentracion:
      "concentration",

    dose:
      "dosage",

    dosis:
      "dosage",

    cantidad:
      "quantity",

    presentacion:
      "presentation",

    authorization:
      "authorization_number",

    autorizacion:
      "authorization_number",

    recipe_number:
      "prescription_number",

    numero_receta:
      "prescription_number",
  };

  const canonical =
    aliases[key] ||
    key;

  if (
    CANONICAL_VISUAL_FIELDS.has(
      canonical
    )
  ) {
    return canonical;
  }

  return "other";
}

// =========================================================
// LABEL
// =========================================================

function fieldLabel(
  field
) {
  const labels = {
    letterhead:
      "Membrete",

    institution_name:
      "Institución",

    social_work_name:
      "Obra social",

    patient_name:
      "Nombre del paciente",

    affiliate_number:
      "Número de afiliado / socio",

    prescription_date:
      "Fecha de prescripción",

    doctor_name:
      "Profesional",

    doctor_registration_number:
      "Matrícula profesional",

    doctor_signature:
      "Firma profesional",

    doctor_stamp:
      "Sello profesional",

    diagnosis:
      "Diagnóstico",

    active_ingredient:
      "Droga / principio activo",

    medication_name:
      "Medicamento",

    concentration:
      "Concentración",

    dosage:
      "Dosis",

    quantity:
      "Cantidad",

    presentation:
      "Presentación",

    authorization_number:
      "Autorización",

    prescription_number:
      "Número de receta",

    other:
      "Otro dato",
  };

  return (
    labels[field] ||
    field
  );
}

// =========================================================
// CONVERSACIÓN
// =========================================================

async function loadConversation(
  conversationId
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "conversations"
      )
      .select(`
        id,
        user_id,
        branch_id,
        device_id,
        active_social_work_id,
        active_billing_channel_id,
        closed_at
      `)
      .eq(
        "id",
        conversationId
      )
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}

// =========================================================
// IMAGEN ACTIVA
// =========================================================

async function loadActiveImage({
  conversationId,
  imageId = null,
}) {
  let query =
    supabaseAdmin
      .from(
        "conversation_images"
      )
      .select(`
        id,
        conversation_id,
        branch_id,
        device_id,
        storage_path,
        original_filename,
        mime_type,
        file_size_bytes,
        status,
        is_active,
        created_at
      `)
      .eq(
        "conversation_id",
        conversationId
      )
      .is(
        "deleted_at",
        null
      );

  if (imageId) {
    query =
      query.eq(
        "id",
        imageId
      );
  } else {
    query =
      query.eq(
        "is_active",
        true
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        "created_at",
        {
          ascending:
            false,
        }
      )
      .limit(1)
      .maybeSingle();

  if (error) {
    throw new Error(
      error.message
    );
  }

  return data;
}

// =========================================================
// OOSS
// =========================================================

async function loadSocialWorkDictionary() {
  const [
    socialWorksResult,
    aliasesResult,
  ] =
    await Promise.all([
      supabaseAdmin
        .from(
          "social_works"
        )
        .select("*")
        .eq(
          "active",
          true
        ),

      supabaseAdmin
        .from(
          "social_work_aliases"
        )
        .select("*"),
    ]);

  if (
    socialWorksResult.error
  ) {
    throw new Error(
      socialWorksResult
        .error.message
    );
  }

  if (
    aliasesResult.error
  ) {
    console.error(
      "social_work_aliases:",
      aliasesResult
        .error.message
    );
  }

  return {
    socialWorks:
      socialWorksResult.data ||
      [],

    aliases:
      aliasesResult.data ||
      [],
  };
}

// =========================================================
// CANDIDATOS OOSS
// =========================================================

function buildSocialWorkCandidates({
  socialWorks,
  aliases,
}) {
  const byId =
    new Map();

  for (
    const sw of
      socialWorks || []
  ) {
    const id =
      Number(sw.id);

    if (
      Number.isInteger(id)
    ) {
      byId.set(
        id,
        sw
      );
    }
  }

  const candidates =
    [];

  for (
    const sw of
      socialWorks || []
  ) {
    if (!sw?.name) {
      continue;
    }

    candidates.push({
      socialWork:
        sw,

      phrase:
        sw.name,

      normalized:
        normalizeText(
          sw.name
        ),

      source:
        "NAME",
    });
  }

  for (
    const alias of
      aliases || []
  ) {
    const socialWork =
      byId.get(
        Number(
          alias
            ?.social_work_id
        )
      );

    if (!socialWork) {
      continue;
    }

    const aliasValue =
      alias?.alias ||
      alias?.name ||
      alias?.alias_name ||
      alias?.value ||
      null;

    if (!aliasValue) {
      continue;
    }

    candidates.push({
      socialWork,

      phrase:
        aliasValue,

      normalized:
        normalizeText(
          aliasValue
        ),

      source:
        "ALIAS",
    });
  }

  return candidates
    .filter(
      (item) =>
        item.normalized
    )
    .sort(
      (a, b) =>
        b.normalized.length -
        a.normalized.length
    );
}

// =========================================================
// DETECTAR OOSS EN PREGUNTA
// =========================================================

function detectSocialWorkInText({
  text,
  candidates,
}) {
  const matches =
    [];

  const seen =
    new Set();

  for (
    const candidate of
      candidates
  ) {
    if (
      !containsWholePhrase(
        text,
        candidate.phrase
      )
    ) {
      continue;
    }

    const id =
      Number(
        candidate
          .socialWork
          .id
      );

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    matches.push({
      id,

      name:
        candidate
          .socialWork
          .name,

      match:
        candidate.phrase,

      source:
        candidate.source,
    });
  }

  return matches;
}

// =========================================================
// RESOLVER OOSS VISUAL
// =========================================================

function resolveDetectedSocialWork({
  value,
  candidates,
}) {
  const normalized =
    normalizeText(
      value
    );

  if (!normalized) {
    return null;
  }

  for (
    const candidate of
      candidates
  ) {
    if (
      candidate.normalized ===
      normalized
    ) {
      return {
        id:
          Number(
            candidate
              .socialWork
              .id
          ),

        name:
          candidate
            .socialWork
            .name,
      };
    }
  }

  return null;
}

// =========================================================
// CAMBIAR OOSS CONVERSACIÓN
// =========================================================

async function setConversationSocialWork({
  conversationId,
  socialWorkId,
}) {
  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "conversations"
      )
      .update({
        active_social_work_id:
          socialWorkId,

        active_billing_channel_id:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        conversationId
      );

  if (error) {
    throw new Error(
      error.message
    );
  }
}

// =========================================================
// SIGNED URL
// =========================================================

async function createImageUrl(
  storagePath
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .storage
      .from(BUCKET)
      .createSignedUrl(
        storagePath,
        60 * 5
      );

  if (error) {
    throw new Error(
      error.message
    );
  }

  if (
    !data?.signedUrl
  ) {
    throw new Error(
      "No se pudo generar la URL temporal de la imagen."
    );
  }

  return data.signedUrl;
}

// =========================================================
// JSON
// =========================================================

function parseJsonOutput(
  value,
  fallback
) {
  let clean =
    String(
      value || ""
    ).trim();

  clean =
    clean
      .replace(
        /^```json\s*/i,
        ""
      )
      .replace(
        /^```\s*/i,
        ""
      )
      .replace(
        /\s*```$/,
        ""
      )
      .trim();

  try {
    return JSON.parse(
      clean
    );
  } catch {
    return fallback;
  }
}

// =========================================================
// SANEAR CAMPO INCIERTO
// =========================================================

function normalizeUncertainField(
  item
) {
  return {
    field:
      canonicalFieldName(
        item?.field
      ),

    raw_reading:
      item?.raw_reading != null
        ? String(
            item.raw_reading
          )
        : null,

    uncertain_part:
      item?.uncertain_part != null
        ? String(
            item.uncertain_part
          )
        : null,

    reason:
      String(
        item?.reason ||
        "No puedo confirmar el valor completo."
      ),

    confidence:
      Number(
        item?.confidence ||
        0
      ),
  };
}

// =========================================================
// SANEAR VISIÓN
// =========================================================

function sanitizeVisualAnalysis(
  input
) {
  const analysis =
    input &&
    typeof input ===
      "object"
      ? input
      : {};

  const confirmedInput =
    Array.isArray(
      analysis
        ?.confirmed_fields
    )
      ? analysis
          .confirmed_fields
      : [];

  const uncertainInput =
    Array.isArray(
      analysis
        ?.uncertain_fields
    )
      ? analysis
          .uncertain_fields
      : [];

  const absentInput =
    Array.isArray(
      analysis
        ?.absent_fields
    )
      ? analysis
          .absent_fields
      : [];

  const confirmedFields =
    [];

  const uncertainFields =
    uncertainInput.map(
      normalizeUncertainField
    );

  const absentFields =
    [];

  // =====================================================
  // REVALIDAR CONFIRMADOS
  // =====================================================

  for (
    const rawField of
      confirmedInput
  ) {
    const field =
      canonicalFieldName(
        rawField?.field
      );

    const value =
      String(
        rawField?.value ||
        ""
      ).trim();

    const confidence =
      Number(
        rawField
          ?.confidence ||
        0
      );

    const evidence =
      String(
        rawField
          ?.evidence ||
        "unknown"
      )
        .toLowerCase()
        .trim();

    const critical =
      CRITICAL_FIELDS.has(
        field
      );

    let minimum =
      PRINTED_CONFIDENCE;

    if (
      evidence ===
      "handwritten"
    ) {
      minimum =
        critical
          ? HANDWRITTEN_CONFIDENCE
          : 0.98;
    }

    if (
      value &&
      confidence >= minimum
    ) {
      confirmedFields.push({
        field,
        value,
        confidence,
        evidence,
      });

      continue;
    }

    uncertainFields.push({
      field,

      raw_reading:
        null,

      uncertain_part:
        null,

      reason:
        evidence ===
        "handwritten"
          ? "La lectura es manuscrita y no puedo confirmar el valor completo con suficiente certeza."
          : "No puedo confirmar el valor completo con suficiente certeza.",

      confidence,
    });
  }

  // =====================================================
  // AUSENCIAS VISUALES
  // =====================================================

  for (
    const rawField of
      absentInput
  ) {
    const field =
      canonicalFieldName(
        rawField?.field
      );

    const confidence =
      Number(
        rawField
          ?.confidence ||
        0
      );

    const reason =
      String(
        rawField?.reason ||
        "No se observa este dato."
      );

    /*
     * Para afirmar AUSENCIA necesitamos
     * un nivel de certeza muy alto.
     *
     * Firma y sello son especialmente
     * sensibles porque una imagen borrosa
     * puede hacer parecer que no existen.
     */
    const minimumAbsenceConfidence =
      (
        field ===
          "doctor_signature" ||
        field ===
          "doctor_stamp"
      )
        ? 0.995
        : 0.99;

    if (
      field !== "other" &&
      confidence >=
        minimumAbsenceConfidence
    ) {
      absentFields.push({
        field,
        reason,
        confidence,
      });

      continue;
    }

    /*
     * Si no estamos prácticamente seguros
     * de que falta, NO lo tratamos como
     * incumplimiento.
     */
    uncertainFields.push({
      field,

      raw_reading:
        null,

      uncertain_part:
        null,

      reason:
        "No puedo confirmar visualmente si este dato está ausente o si simplemente no se distingue con suficiente claridad.",

      confidence,
    });
  }

  // =====================================================
  // OBRA SOCIAL VISUAL
  // =====================================================

  let detectedSocialWork =
    analysis
      ?.detected_social_work ||
    null;

  const detectedRaw =
    analysis
      ?.detected_social_work_raw ||
    null;

  const detectedConfidence =
    Number(
      analysis
        ?.detected_social_work_confidence ||
      0
    );

  const detectedEvidence =
    String(
      analysis
        ?.detected_social_work_evidence ||
      "unknown"
    )
      .toLowerCase()
      .trim();

  /*
   * Una OOSS manuscrita jamás se toma
   * automáticamente como confirmada.
   */
  if (
    detectedEvidence ===
      "handwritten" ||
    detectedConfidence <
      SOCIAL_WORK_AUTO_CONFIDENCE
  ) {
    detectedSocialWork =
      null;
  }

  return {
    detected_social_work:
      detectedSocialWork,

    detected_social_work_raw:
      detectedRaw,

    detected_social_work_confidence:
      detectedConfidence,

    detected_social_work_evidence:
      detectedEvidence,

    document_type:
      analysis
        ?.document_type ||
      "unknown",

    confirmed_fields:
      confirmedFields,

    uncertain_fields:
      uncertainFields,

    absent_fields:
      absentFields,

    summary:
      String(
        analysis?.summary ||
        ""
      ),

    direct_answer:
      String(
        analysis
          ?.direct_answer ||
        ""
      ),
  };
}

// =========================================================
// VISIÓN
// =========================================================

async function analyzeImage({
  imageUrl,
  pdfBase64 = null,
  pdfFilename = "receta.pdf",
  question,
}) {
  const model =
    process.env
      .OPENAI_VISION_MODEL ||
    process.env
      .OPENAI_MODEL ||
    "gpt-4.1-mini";

  const instructions = `
Sos el módulo de lectura visual de GDPSoft.

Tu única función en esta etapa es observar el documento.

NO determines todavía si cumple una normativa.
NO inventes.
NO completes caracteres.
NO reconstruyas palabras o números por contexto.

Respondé EXCLUSIVAMENTE JSON válido.

FORMATO:

{
  "detected_social_work": string | null,
  "detected_social_work_raw": string | null,
  "detected_social_work_confidence": number,
  "detected_social_work_evidence": "logo" | "printed" | "handwritten" | "unknown",

  "document_type": "prescription" | "authorization" | "credential" | "informational_notice" | "validator_screen" | "other" | "unknown",

  "confirmed_fields": [
    {
      "field": "letterhead" | "institution_name" | "social_work_name" | "patient_name" | "affiliate_number" | "prescription_date" | "doctor_name" | "doctor_registration_number" | "doctor_signature" | "doctor_stamp" | "diagnosis" | "active_ingredient" | "medication_name" | "concentration" | "dosage" | "quantity" | "presentation" | "authorization_number" | "prescription_number" | "other",
      "value": string,
      "confidence": number,
      "evidence": "printed" | "handwritten" | "logo"
    }
  ],

  "uncertain_fields": [
    {
      "field": string,
      "raw_reading": string | null,
      "uncertain_part": string | null,
      "reason": string,
      "confidence": number
    }
  ],

  "absent_fields": [
    {
      "field": string,
      "reason": string,
      "confidence": number
    }
  ],

  "summary": string,
  "direct_answer": string
}

REGLAS OBLIGATORIAS:

1. Si no entendés UN SOLO carácter de un dato,
   ese dato completo NO puede ir en confirmed_fields.

2. Si un número parece:
   20364?876
   NO escribas 203647876.

3. Si no sabés qué dígito falta,
   no inventes una lectura completa.

4. Para:
   - obra social
   - paciente
   - afiliado/socio
   - fecha
   - matrícula
   - autorización
   - número de receta
   - medicamento
   - droga
   - concentración
   - dosis
   - cantidad
   - presentación

   cualquier duda implica uncertain_fields.

5. Una OOSS manuscrita:
   detected_social_work = null.

   Podés usar detected_social_work_raw
   únicamente como lectura tentativa.

6. detected_social_work sólo puede confirmarse
   automáticamente si está claramente impresa
   o aparece mediante logo y la confianza es >= 0.98.

7. patient_name es el PACIENTE.
   Nunca confundas patient_name con doctor_name.

8. doctor_name es el MÉDICO.
   Nunca lo uses como paciente.

9. doctor_registration_number es sólo la matrícula.
   NO significa que exista firma.
   NO significa que exista sello.

10. doctor_signature sólo puede confirmarse
    si visualmente se observa firma.

11. doctor_stamp sólo puede confirmarse
    si visualmente se observa sello.

12. letterhead indica que se observa
    un membrete/institución identificable.

13. absent_fields sólo puede usarse cuando
    el área correspondiente es visible y podés
    afirmar que el dato realmente no está.

14. Si no sabés si falta o simplemente
    no lo podés leer:
    uncertain_fields, NO absent_fields.

15. No inventes medicamentos ni dosis
    a partir de escritura manuscrita dudosa.

16. No digas que una receta es válida.

17. direct_answer debe respetar exactamente
    confirmed_fields, uncertain_fields y absent_fields.

Pregunta:
${question}
`.trim();

  const response =
    await openai
      .responses
      .create({
        model,

        store:
          false,

        max_output_tokens:
          1200,

        instructions,

        input: [
          {
            role:
              "user",

            content: [
              {
                type:
                  "input_text",

                text:
                  question,
              },

              pdfBase64
                ? {type:"input_file", filename:pdfFilename, file_data:`data:application/pdf;base64,${pdfBase64}`}
                : {type:"input_image", image_url:imageUrl, detail:"high"},
            ],
          },
        ],
      });

  const parsed =
    parseJsonOutput(
      response.output_text,
      {
        detected_social_work:
          null,

        detected_social_work_raw:
          null,

        detected_social_work_confidence:
          0,

        detected_social_work_evidence:
          "unknown",

        document_type:
          "unknown",

        confirmed_fields:
          [],

        uncertain_fields:
          [],

        absent_fields:
          [],

        summary:
          "",

        direct_answer:
          "",
      }
    );

  return {
    model,

    responseId:
      response.id,

    usage:
      response.usage ||
      null,

    analysis:
      sanitizeVisualAnalysis(
        parsed
      ),
  };
}

// =========================================================
// PREGUNTA "PUEDO RECIBIR / DISPENSAR"
// =========================================================

function isPrescriptionCheckQuestion(
  question
) {
  const text =
    normalizeText(
      question
    );

  const patterns = [
    "puedo recibir",
    "puedo aceptar",
    "puedo dispensar",
    "se puede recibir",
    "se puede aceptar",
    "se puede dispensar",

    "esta receta sirve",
    "esta receta esta bien",
    "esta receta es valida",
    "es valida esta receta",

    "cumple los requisitos",
    "cumple requisitos",
    "cumple para",

    "revisar receta",
    "verificar receta",
    "controlar receta",

    "le falta algo",
    "falta algun dato",
  ];

  return patterns.some(
    (pattern) =>
      text.includes(
        normalizeText(
          pattern
        )
      )
  );
}

// =========================================================
// PREGUNTA VISUAL
// =========================================================

function isSocialWorkVisualQuestion(
  question
) {
  const text =
    normalizeText(
      question
    );

  return (
    text.includes(
      "obra social"
    ) ||
    text.includes(
      "ooss"
    )
  );
}

function isAffiliateVisualQuestion(
  question
) {
  const text =
    normalizeText(
      question
    );

  return (
    text.includes(
      "afiliado"
    ) ||
    text.includes(
      "numero de socio"
    ) ||
    text.includes(
      "beneficiario"
    )
  );
}

function isGeneralVisualQuestion(
  question
) {
  const text =
    normalizeText(
      question
    );

  const patterns = [
    "que datos",
    "que informacion",
    "que muestra",
    "que dice",
    "que aparece",
    "que ves",
    "identificar",
    "identifica",
    "leer imagen",
    "lee la imagen",
  ];

  return patterns.some(
    (pattern) =>
      text.includes(
        normalizeText(
          pattern
        )
      )
  );
}

function isVisualOnlyQuestion(
  question
) {
  return (
    isSocialWorkVisualQuestion(
      question
    ) ||
    isAffiliateVisualQuestion(
      question
    ) ||
    isGeneralVisualQuestion(
      question
    )
  );
}

// =========================================================
// ENCONTRAR CAMPO
// =========================================================

function findField(
  fields,
  field
) {
  return (
    fields || []
  ).find(
    (item) =>
      canonicalFieldName(
        item?.field
      ) ===
      field
  );
}

// =========================================================
// RESPUESTA VISUAL SEGURA
// =========================================================

function buildVisualAnswer({
  question,
  analysis,
}) {
  const confirmed =
    analysis
      ?.confirmed_fields ||
    [];

  const uncertain =
    analysis
      ?.uncertain_fields ||
    [];

  const absent =
    analysis
      ?.absent_fields ||
    [];

  // =====================================================
  // OOSS
  // =====================================================

  if (
    isSocialWorkVisualQuestion(
      question
    )
  ) {
    if (
      analysis
        ?.detected_social_work
    ) {
      return (
        `Puedo identificar con certeza la obra social: ` +
        `${analysis.detected_social_work}.`
      );
    }

    return (
      "No puedo identificar con certeza la obra social en esta receta."
    );
  }

  // =====================================================
  // AFILIADO
  // =====================================================

  if (
    isAffiliateVisualQuestion(
      question
    )
  ) {
    const exact =
      findField(
        confirmed,
        "affiliate_number"
      );

    if (exact) {
      return (
        `Puedo identificar con certeza el número de afiliado/socio: ` +
        `${exact.value}.`
      );
    }

    const doubtful = findField(uncertain, "affiliate_number");
    if (doubtful) {
      return "No puedo confirmar con certeza el número completo de afiliado o socio. Verificalo manualmente en el original.";
    }

    return (
      "No puedo identificar con certeza un número de afiliado o socio."
    );
  }

  // =====================================================
  // GENERAL
  // =====================================================

  const lines =
    [];

  if (
    confirmed.length
  ) {
    lines.push(
      "Puedo confirmar:"
    );

    for (
      const item of
        confirmed
    ) {
      lines.push(
        `✓ ${fieldLabel(
          item.field
        )}: ${item.value}`
      );
    }
  }

  if (
    uncertain.length
  ) {
    if (
      lines.length
    ) {
      lines.push("");
    }

    lines.push(
      "Tengo dudas o no puedo confirmar:"
    );

    for (
      const item of
        uncertain
    ) {
      lines.push(
        `⚠ ${fieldLabel(item.field)}: ${item.reason}`
      );
    }
  }

  if (
    absent.length
  ) {
    if (
      lines.length
    ) {
      lines.push("");
    }

    lines.push(
      "No se observan:"
    );

    for (
      const item of
        absent
    ) {
      lines.push(
        `✗ ${fieldLabel(
          item.field
        )}: ${item.reason}`
      );
    }
  }

  if (
    !lines.length
  ) {
    return (
      "No puedo identificar datos con suficiente certeza en esta imagen."
    );
  }

  return lines.join(
    "\n"
  );
}

// =========================================================
// INFERIR CAMPO VISUAL DESDE EL TEXTO DEL REQUISITO
// =========================================================

function inferRequirementFieldKey(
  requirementText
) {
  const q =
    normalizeText(
      requirementText
    );

  if (!q) {
    return "other";
  }

  // =====================================================
  // REQUISITOS QUE NO SON UN CAMPO VISUAL ÚNICO
  // =====================================================

  if (
    q.includes(
      "receta fisica"
    ) ||
    q.includes(
      "receta física"
    ) ||
    q.includes(
      "receta digital"
    ) ||
    q.includes(
      "receta electronica"
    ) ||
    q.includes(
      "receta electrónica"
    ) ||
    q.includes(
      "tipo de receta"
    )
  ) {
    return "other";
  }

  // =====================================================
  // BENEFICIARIO
  // =====================================================

  if (
    q.includes(
      "apellido"
    ) &&
    q.includes(
      "beneficiario"
    )
  ) {
    return "patient_name";
  }

  if (
    q.includes(
      "nombre del beneficiario"
    ) ||
    q.includes(
      "nombre beneficiario"
    ) ||
    q.includes(
      "nombre del paciente"
    ) ||
    q.includes(
      "apellido y nombre"
    )
  ) {
    return "patient_name";
  }

  // =====================================================
  // AFILIADO / SOCIO
  // =====================================================

  if (
    q.includes(
      "numero de beneficiario"
    ) ||
    q.includes(
      "n de beneficiario"
    ) ||
    q.includes(
      "nº de beneficiario"
    ) ||
    q.includes(
      "numero de afiliado"
    ) ||
    q.includes(
      "numero de socio"
    ) ||
    q.includes(
      "n de afiliado"
    ) ||
    q.includes(
      "nº de afiliado"
    )
  ) {
    return "affiliate_number";
  }

  // =====================================================
  // FECHA
  // =====================================================

  if (
    q.includes(
      "fecha de prescripcion"
    ) ||
    q.includes(
      "fecha de prescripción"
    ) ||
    q ===
      "fecha"
  ) {
    return "prescription_date";
  }

  // =====================================================
  // FIRMA / SELLO
  // =====================================================

  if (
    q.includes(
      "firma"
    )
  ) {
    return "doctor_signature";
  }

  if (
    q.includes(
      "sello"
    )
  ) {
    return "doctor_stamp";
  }

  // =====================================================
  // MÉDICO
  // =====================================================

  if (
    q.includes(
      "matricula"
    ) ||
    q.includes(
      "matrícula"
    )
  ) {
    return "doctor_registration_number";
  }

  if (
    q.includes(
      "nombre del medico"
    ) ||
    q.includes(
      "nombre del médico"
    ) ||
    q.includes(
      "nombre profesional"
    )
  ) {
    return "doctor_name";
  }

  // =====================================================
  // DIAGNÓSTICO
  // =====================================================

  if (
    q.includes(
      "diagnostico"
    ) ||
    q.includes(
      "diagnóstico"
    )
  ) {
    return "diagnosis";
  }

  // =====================================================
  // DROGA / MEDICAMENTO
  // =====================================================

  if (
    q.includes(
      "nombre generico"
    ) ||
    q.includes(
      "nombre genérico"
    ) ||
    q.includes(
      "principio activo"
    ) ||
    q.includes(
      "monodroga"
    )
  ) {
    return "active_ingredient";
  }

  if (
    q.includes(
      "medicamento"
    ) ||
    q.includes(
      "nombre comercial"
    )
  ) {
    return "medication_name";
  }

  // =====================================================
  // POTENCIA / CONCENTRACIÓN
  // =====================================================

  if (
    q.includes(
      "potencia"
    ) ||
    q.includes(
      "concentracion"
    ) ||
    q.includes(
      "concentración"
    )
  ) {
    return "concentration";
  }

  // =====================================================
  // DOSIS
  // =====================================================

  if (
    q.includes(
      "dosis"
    ) ||
    q.includes(
      "dosificacion"
    ) ||
    q.includes(
      "dosificación"
    )
  ) {
    return "dosage";
  }

  // =====================================================
  // CANTIDAD
  // =====================================================

  if (
    q.includes(
      "cantidad"
    )
  ) {
    return "quantity";
  }

  // =====================================================
  // PRESENTACIÓN
  // =====================================================

  if (
    q.includes(
      "presentacion"
    ) ||
    q.includes(
      "presentación"
    )
  ) {
    return "presentation";
  }

  // =====================================================
  // AUTORIZACIÓN
  // =====================================================

  if (
    q.includes(
      "autorizacion"
    ) ||
    q.includes(
      "autorización"
    )
  ) {
    return "authorization_number";
  }

  // =====================================================
  // NÚMERO DE RECETA
  // =====================================================

  if (
    q.includes(
      "numero de receta"
    ) ||
    q.includes(
      "numero recetario"
    ) ||
    q.includes(
      "nº de receta"
    )
  ) {
    return "prescription_number";
  }

  // =====================================================
  // MEMBRETE / ENTIDAD
  // =====================================================

  if (
    q.includes(
      "membrete"
    )
  ) {
    return "letterhead";
  }

  if (
    q.includes(
      "nombre de la entidad"
    ) ||
    q.includes(
      "institucion"
    ) ||
    q.includes(
      "institución"
    )
  ) {
    return "institution_name";
  }

  return "other";
}

// Los convenios pueden variar por Cámara/Colegio: nunca mezclar fuentes.
async function getNormativeCircuitScope(socialWorkId, requestedChannelId = null) {
  const {data, error} = await supabaseAdmin.from("normative_social_works")
    .select("normative_id,billing_channel_id,normatives!inner(is_current)")
    .eq("social_work_id", Number(socialWorkId))
    .eq("normatives.is_current", true);
  if (error) return {ok:false,reason:"No pude verificar el circuito de las normativas."};
  return scopeLinkedNormatives(data || [], requestedChannelId);
}

// =========================================================
// EXTRAER REQUISITOS NORMATIVOS DE RECETA
// =========================================================

async function getPrescriptionRequirements({
  socialWork,
  normativeIds = [],
}) {
  const socialWorkId =
    Number(
      socialWork?.id
    );

  const prompt = `
Necesito exclusivamente los requisitos que deben comprobarse
EN LA RECETA al momento de recibirla o dispensarla para ${socialWork.name}.

NO incluyas:
- facturación posterior
- presentación mensual
- cierre de lote
- auditoría posterior
- ticket fiscal generado por la farmacia
- rendición
- liquidación

Quiero requisitos de ACEPTACIÓN DE LA RECETA.

IMPORTANTE:

Cada requisito debe ser ATÓMICO.

Ejemplo incorrecto:
"Nombre genérico, potencia y presentación"

Debe dividirse en:
- Nombre genérico
- Potencia
- Presentación

Ejemplo incorrecto:
"Firma y sello"

Debe dividirse en:
- Firma
- Sello

field_key permitidos:

letterhead
institution_name
social_work_name
patient_name
affiliate_number
prescription_date
doctor_name
doctor_registration_number
doctor_signature
doctor_stamp
diagnosis
active_ingredient
medication_name
concentration
dosage
quantity
presentation
authorization_number
prescription_number
other

REGLAS:

- Nombre del beneficiario = patient_name
- Número de beneficiario = affiliate_number
- Nombre del médico = doctor_name
- Matrícula = doctor_registration_number
- Firma = doctor_signature
- Sello = doctor_stamp
- Diagnóstico = diagnosis
- Nombre genérico / monodroga = active_ingredient
- Potencia = concentration
- Presentación = presentation
- Fecha = prescription_date
- Membrete = letterhead

MUY IMPORTANTE:

"Receta física o digital"
NO es institution_name.

"Tipo de receta"
NO es institution_name.

El nombre del hospital o institución
NO demuestra que la receta sea física, digital o electrónica.

Si el requisito no puede asociarse a UN único campo visual,
usar:

field_key = "other"

Indicá necesidad:

REQUIRED
OPTIONAL
CONDITIONAL

Respondé únicamente JSON:

{
  "requirements": [
    {
      "requirement": string,
      "field_key": string,
      "necessity": "REQUIRED" | "OPTIONAL" | "CONDITIONAL",
      "condition": string | null
    }
  ]
}
`.trim();

  const response =
    await openai
      .responses
      .create({
        model:
          process.env
            .OPENAI_MODEL ||
          "gpt-4.1-mini",

        store:
          false,

        max_output_tokens:
          1200,

        instructions:
          "Extraé únicamente requisitos respaldados por la normativa recuperada. No inventes. Cada requisito debe representar un solo dato o condición.",

        input:
          prompt,

        tools: [
          {
            type:
              "file_search",

            vector_store_ids: [
              process.env
                .OPENAI_VECTOR_STORE_ID,
            ],

            max_num_results:
              10,

            // Vínculos vigentes aprobados en Supabase: incluye normas generales
            // y extras unificadas (vacunas, insulinas), aunque el vector tenga
            // un ID de obra social heredado diferente.
            filters: normativeIds.length
              ? {type:"and",filters:[
                  {type:"eq",key:"is_current",value:true},
                  {type:"or",filters:normativeIds.map(id=>({type:"eq",key:"normative_id",value:Number(id)}))},
                ]}
              : {type:"and",filters:[
                  {type:"or",filters:[
                    {type:"eq",key:"social_work_id",value:socialWorkId},
                    {type:"eq",key:"secondary_social_work_id",value:socialWorkId},
                  ]},
                  {type:"eq",key:"is_current",value:true},
                ]},
          },
        ],

        include: [
          "file_search_call.results",
        ],
      });

  const searchCall =
    response.output?.find(
      (item) =>
        item.type ===
        "file_search_call"
    );

  const results =
    searchCall
      ?.results ||
    [];

  if (
    !results.length
  ) {
    return {
      found:
        false,

      requirements:
        [],

      usage:
        response.usage ||
        null,

      responseId:
        response.id,
    };
  }

  const parsed =
    parseJsonOutput(
      response.output_text,
      {
        requirements:
          [],
      }
    );

  const rawRequirements =
    Array.isArray(
      parsed
        ?.requirements
    )
      ? parsed.requirements
      : [];

  // =====================================================
  // SEGUNDA CAPA DE SEGURIDAD
  //
  // NO confiamos ciegamente en field_key
  // generado por IA.
  //
  // Lo recalculamos desde el texto real
  // del requisito.
  // =====================================================

  const requirements =
    rawRequirements
      .map(
        (item) => {
          const requirement =
            String(
              item
                ?.requirement ||
              ""
            ).trim();

          if (!requirement) {
            return null;
          }

          const inferredFieldKey =
            inferRequirementFieldKey(
              requirement
            );

          return {
            requirement,

            /*
             * Ignoramos field_key generado
             * cuando no coincide con nuestra
             * clasificación determinística.
             */
            field_key:
              inferredFieldKey,

            necessity:
              String(
                item
                  ?.necessity ||
                "REQUIRED"
              )
                .toUpperCase()
                .trim(),

            condition:
              item
                ?.condition ||
              null,

            original_field_key:
              canonicalFieldName(
                item
                  ?.field_key
              ),
          };
        }
      )
      .filter(Boolean);

  return {
    found:
      true,

    requirements,

    usage:
      response.usage ||
      null,

    responseId:
      response.id,
  };
}

// =========================================================
// EVALUAR UN REQUISITO
// =========================================================

function evaluateRequirement({
  requirement,
  analysis,
}) {
  const fieldKey =
    canonicalFieldName(
      requirement
        ?.field_key
    );

  const necessity =
    String(
      requirement
        ?.necessity ||
      "REQUIRED"
    )
      .toUpperCase()
      .trim();

  const allowedFields =
    REQUIREMENT_FIELD_MAP[
      fieldKey
    ] ||
    [];

  const confirmed =
    analysis
      ?.confirmed_fields ||
    [];

  const uncertain =
    analysis
      ?.uncertain_fields ||
    [];

  const absent =
    analysis
      ?.absent_fields ||
    [];

  // =====================================================
  // REQUISITO NO VERIFICABLE POR UN CAMPO VISUAL
  // =====================================================

  if (
    fieldKey ===
      "other" ||
    !allowedFields.length
  ) {
    return {
      status:
        "UNCERTAIN",

      fieldKey,

      detail:
        "Este requisito no puede validarse automáticamente sólo con un campo visual de la imagen.",
    };
  }

  // =====================================================
  // CAMPO CONFIRMADO
  // =====================================================

  const confirmedField =
    confirmed.find(
      (item) =>
        allowedFields.includes(
          item.field
        )
    );

  if (
    confirmedField
  ) {
    return {
      status:
        "CONFIRMED",

      fieldKey,

      detail:
        `Puedo confirmar: ${confirmedField.value}.`,
    };
  }

  // =====================================================
  // CAMPO INCIERTO
  // =====================================================

  const uncertainField =
    uncertain.find(
      (item) =>
        allowedFields.includes(
          item.field
        )
    );

  if (
    uncertainField
  ) {
    if (
      necessity ===
      "OPTIONAL"
    ) {
      return {
        status:
          "OPTIONAL",

        fieldKey,

        detail:
          "Es opcional según la normativa y no puedo confirmarlo visualmente.",
      };
    }

    return {
      status:
        "UNCERTAIN",

      fieldKey,

      detail:
        `No puedo validarlo: ${uncertainField.reason}`,
    };
  }

  // =====================================================
  // CAMPO INFORMADO COMO AUSENTE POR VISIÓN
  // =====================================================

  const absentField =
    absent.find(
      (item) =>
        allowedFields.includes(
          item.field
        )
    );

  if (
    absentField
  ) {
    if (
      necessity ===
      "OPTIONAL"
    ) {
      return {
        status:
          "OPTIONAL",

        fieldKey,

        detail:
          "Es opcional según la normativa.",
      };
    }

    /*
     * REGLA DE SEGURIDAD:
     *
     * Vision NO puede generar un incumplimiento
     * en campos clínicos/manuscritos/críticos
     * sólo porque no los detectó.
     */
    const safeAbsenceFields =
      new Set([
        "letterhead",
        "institution_name",
      ]);

    if (
      !safeAbsenceFields.has(
        fieldKey
      )
    ) {
      return {
        status:
          "UNCERTAIN",

        fieldKey,

        detail:
          "No puedo confirmar visualmente si este dato realmente está ausente o si no se distingue con suficiente claridad.",
      };
    }

    /*
     * Incluso para membrete/institución
     * necesitamos ausencia visual muy segura.
     */
    const absenceConfidence =
      Number(
        absentField
          ?.confidence ||
        0
      );

    if (
      absenceConfidence <
      0.995
    ) {
      return {
        status:
          "UNCERTAIN",

        fieldKey,

        detail:
          "No puedo confirmar visualmente si este dato realmente está ausente.",
      };
    }

    if (
      necessity ===
      "CONDITIONAL"
    ) {
      return {
        status:
          "UNCERTAIN",

        fieldKey,

        detail:
          `No se observa. Es un requisito condicional: ${
            requirement
              ?.condition ||
            "debe revisarse si corresponde al caso."
          }`,
      };
    }

    /*
     * Solamente acá permitimos NONCOMPLIANT:
     *
     * requisito obligatorio
     * +
     * campo visual seguro
     * +
     * ausencia casi cierta
     */
    return {
      status:
        "NONCOMPLIANT",

      fieldKey,

      detail:
        "La normativa lo exige y puedo confirmar visualmente que no se observa en la receta.",
    };
  }

  // =====================================================
  // NO APARECE EN NINGUNA CATEGORÍA
  // =====================================================

  if (
    necessity ===
    "OPTIONAL"
  ) {
    return {
      status:
        "OPTIONAL",

      fieldKey,

      detail:
        "Es opcional según la normativa.",
    };
  }

  /*
   * NO inferimos ausencia porque no haya
   * aparecido en confirmed_fields.
   */
  return {
    status:
      "UNCERTAIN",

    fieldKey,

    detail:
      "La normativa solicita este dato, pero no puedo confirmar su presencia ni su ausencia en la imagen.",
  };
}

// La ficha estructurada complementa la normativa del documento.
// Solo convertimos a REQUIRED campos explícitamente marcados "Requiere".
// Nunca inferimos obligatoriedad de valores vacíos, RP ni porcentajes.
async function getStructuredFichaRequirements(socialWorkId) {
  const {data, error} = await supabaseAdmin.from("social_works")
    .select("id,name,recipe_type,recipe_validity_days,letterhead,rp,diagnosis,monodrug,commercial_name,substitution,observations")
    .eq("id", socialWorkId).maybeSingle();
  if (error || !data) return {requirements:[],notes:[]};
  const defs = [
    ["letterhead", "letterhead", "Membrete"],
    ["diagnosis", "diagnosis", "Diagnóstico"],
    ["monodrug", "active_ingredient", "Monodroga / principio activo"],
    ["commercial_name", "medication_name", "Nombre comercial del medicamento"],
  ];
  const requirements = defs.flatMap(([column,field_key,label]) => {
    const raw = String(data[column] ?? "").trim().toLowerCase();
    if (!raw) return [];
    const required = /^(requiere|requerido|obligatorio|obligatoria|sí|si)$/i.test(raw);
    const optional = /^(no requiere|no|opcional|no obligatorio|no obligatoria)$/i.test(raw);
    if (!required && !optional) return [];
    return [{requirement:`${label} (Recordá/Ficha)`,field_key,necessity: required ? "REQUIRED":"OPTIONAL",condition:null,source:"SOCIAL_WORK_PROFILE"}];
  });
  const notes=[];
  if (data.recipe_type) notes.push(`Tipos de receta registrados en Recordá/Ficha: ${data.recipe_type}`);
  if (data.recipe_validity_days != null) notes.push(`Vigencia registrada en Recordá/Ficha: ${data.recipe_validity_days} días. Verificar fecha exacta, sin asumir validez.`);
  if (data.rp != null) notes.push(`Límite registrado en Recordá/Ficha: ${data.rp} RP. Revisión manual necesaria.`);
  if (data.observations) notes.push(`Observaciones de Recordá/Ficha: ${data.observations}`);
  return {requirements,notes};
}

// =========================================================
// VERIFICACIÓN COMPLETA
// =========================================================

async function verifyPrescriptionAgainstNormative({
  analysis,
  socialWork,
  billingChannelId = null,
}) {
  const scope = await getNormativeCircuitScope(socialWork.id, billingChannelId);
  if (!scope.ok) return {found:false,answer:scope.reason,requiresCircuit:true};
  const normative =
    await getPrescriptionRequirements({
      socialWork, normativeIds:scope.normativeIds,
    });
  const ficha = await getStructuredFichaRequirements(Number(socialWork.id));

  if (
    !normative.found && !ficha.requirements.length
  ) {
    return {
      found:
        false,

      answer:
        null,

      usage:
        normative.usage,

      responseId:
        normative.responseId,
    };
  }

  const evaluations =
    [];

  // Si ambos orígenes definen el mismo campo con condiciones distintas,
  // detener la verificación automática de ese requisito: conflicto documental.
  const normativeFields = new Map((normative.requirements || []).map(r=>[r.field_key, r]));
  const combined = [...(normative.requirements || [])];
  const sourceConflicts = [];
  for (const req of ficha.requirements) {
    const existing = normativeFields.get(req.field_key);
    if (existing) {
      if (String(existing.necessity).toUpperCase() !== req.necessity) sourceConflicts.push(req.requirement);
    } else combined.push(req);
  }
  for (
    const requirement of combined
  ) {
    const evaluation =
      evaluateRequirement({
        requirement,
        analysis,
      });

    evaluations.push({
      requirement:
        String(
          requirement
            ?.requirement ||
          fieldLabel(
            evaluation
              .fieldKey
          )
        ),

      necessity:
        String(
          requirement
            ?.necessity ||
          "REQUIRED"
        )
          .toUpperCase()
          .trim(),

      condition:
        requirement
          ?.condition ||
        null,

      ...evaluation,
    });
  }

  const confirmed =
    evaluations.filter(
      (item) =>
        item.status ===
        "CONFIRMED"
    );

  const uncertain =
    evaluations.filter(
      (item) =>
        item.status ===
        "UNCERTAIN"
    );

  const noncompliant =
    evaluations.filter(
      (item) =>
        item.status ===
        "NONCOMPLIANT"
    );

  const optional =
    evaluations.filter(
      (item) =>
        item.status ===
        "OPTIONAL"
    );
let result =
  "Sin discrepancias en los controles visuales comprobables; requiere revisión humana";
if (sourceConflicts.length || !normative.found) result = "Requiere revisión";

if (
  noncompliant.length >
  0
) {
  result =
    "Se detectó un incumplimiento visible confirmado";
} else if (
  uncertain.length >
  0
) {
  result =
    "Requiere revisión";
}

  const lines =
    [];

  lines.push(
    `Verificación para ${socialWork.name}:`
  );

  if (
    confirmed.length
  ) {
    lines.push("");
    lines.push(
      "Pude validar:"
    );

    for (
      const item of
        confirmed
    ) {
      lines.push(
        `✓ ${item.requirement}: ${item.detail}`
      );
    }
  }

  if (
    uncertain.length
  ) {
    lines.push("");
    lines.push(
      `No puedo validar estos datos que también pide ${socialWork.name}:`
    );

    for (
      const item of
        uncertain
    ) {
      lines.push(
        `⚠ ${item.requirement}: ${item.detail}`
      );
    }
  }

if (
  noncompliant.length
) {
  lines.push("");
  lines.push(
    "Incumplimientos visibles confirmados:"
  );

    for (
      const item of
        noncompliant
    ) {
      lines.push(
        `✗ ${item.requirement}: ${item.detail}`
      );
    }
  }

  if (
    optional.length
  ) {
    lines.push("");
    lines.push(
      "Datos opcionales:"
    );

    for (
      const item of
        optional
    ) {
      lines.push(
        `• ${item.requirement}: ${item.detail}`
      );
    }
  }

  lines.push("");
  lines.push(
    "Resultado:"
  );
  lines.push(result);
  lines.push("Esta comprobación es visual y no autoriza por sí sola la dispensación.");
  if (!normative.found) lines.push("No se recuperó evidencia suficiente de la normativa documental; se contrastaron únicamente campos explícitos de Recordá/Ficha.");
  if (sourceConflicts.length) lines.push(`⚠ Diferencias entre ficha y normativa en: ${sourceConflicts.join(", ")}. Requiere revisión humana.`);
  if (ficha.notes.length) {
    lines.push("", "Recordá/Ficha de la obra social:", ...ficha.notes.map(n => `• ${n}`));
  }

  if (
    uncertain.length
  ) {
    lines.push("");
    lines.push(
      "Hay datos que una persona puede llegar a interpretar visualmente, pero yo no los puedo confirmar con suficiente certeza. Necesito que los revises antes de recibir o dispensar la receta."
    );
  }

  return {
    found:
      true,

    answer:
      lines.join(
        "\n"
      ),

    result,

    evaluations,

    usage:
      normative.usage,

    responseId:
      normative.responseId,
  };
}

// =========================================================
// NORMATIVA GENÉRICA
// =========================================================

async function answerGenericNormativeQuestion({
  question,
  socialWork,
}) {
  const socialWorkId =
    Number(
      socialWork?.id
    );

  const response =
    await openai
      .responses
      .create({
        model:
          process.env
            .OPENAI_MODEL ||
          "gpt-4.1-mini",

        store:
          false,

        max_output_tokens:
          600,

        instructions: `
Respondé la consulta según la normativa vigente
de ${socialWork.name}.

No inventes.
No uses información de otra obra social.
Sé breve y operativo.
`.trim(),

        input:
          question,

        tools: [
          {
            type:
              "file_search",

            vector_store_ids: [
              process.env
                .OPENAI_VECTOR_STORE_ID,
            ],

            max_num_results:
              5,

            filters: {
              type:
                "and",

              filters: [
                {
                  type:
                    "or",

                  filters: [
                    {
                      type:
                        "eq",

                      key:
                        "social_work_id",

                      value:
                        socialWorkId,
                    },

                    {
                      type:
                        "eq",

                      key:
                        "secondary_social_work_id",

                      value:
                        socialWorkId,
                    },
                  ],
                },

                {
                  type:
                    "eq",

                  key:
                    "is_current",

                  value:
                    true,
                },
              ],
            },
          },
        ],

        include: [
          "file_search_call.results",
        ],
      });

  const searchCall =
    response.output?.find(
      (item) =>
        item.type ===
        "file_search_call"
    );

  const results =
    searchCall
      ?.results ||
    [];

  return {
    found:
      results.length > 0,

    answer:
      response.output_text,

    usage:
      response.usage ||
      null,

    responseId:
      response.id,
  };
}

// =========================================================
// METADATA
// =========================================================

async function saveAnalysisMetadata({
  imageId,
  model,
  analysis,
  responseId,
}) {
  const {
    error,
  } =
    await supabaseAdmin
      .from(
        "conversation_images"
      )
      .update({
        status:
          "ANALYZED",

        analysis: {
          model,

          document_type:
            analysis
              ?.document_type ||
            "unknown",

          detected_social_work:
            analysis
              ?.detected_social_work ||
            null,

          detected_social_work_raw:
            analysis
              ?.detected_social_work_raw ||
            null,

          detected_social_work_confidence:
            Number(
              analysis
                ?.detected_social_work_confidence ||
              0
            ),

          detected_social_work_evidence:
            analysis
              ?.detected_social_work_evidence ||
            "unknown",

          response_id:
            responseId ||
            null,

          analyzed_at:
            new Date()
              .toISOString(),
        },

        analysis_error:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        imageId
      );

  if (error) {
    console.error(
      "saveAnalysisMetadata:",
      error.message
    );
  }
}

// =========================================================
// ERROR
// =========================================================

async function markAnalysisError({
  imageId,
  message,
}) {
  if (!imageId) {
    return;
  }

  await supabaseAdmin
    .from(
      "conversation_images"
    )
    .update({
      status:
        "ERROR",

      analysis_error:
        String(
          message ||
          "Error de análisis"
        ).slice(
          0,
          1000
        ),

      updated_at:
        new Date()
          .toISOString(),
    })
    .eq(
      "id",
      imageId
    );
}

// Registramos una consulta de receta solamente si pertenece a una sesión real
// de Sucursal, a la misma conversación y al mismo branch_id. Jamás clasificamos
// una llamada anónima, administrativa o de batería como tráfico del piloto.
async function logVisionPilotQuestion({request, conversation, activeImage, question, response, elapsedMs}) {
  try {
    if (!response?.ok || !String(response.answer || "").trim()) return;
    const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
    if (!match || !conversation?.user_id || !conversation?.branch_id) return;
    const {data: {user} = {}, error: authError} = await supabaseAdmin.auth.getUser(match[1]);
    if (authError || !user || String(user.id) !== String(conversation.user_id)) return;
    const {data: profile, error: profileError} = await supabaseAdmin.from("profiles")
      .select("id,role,active,branch_id").eq("id",user.id).maybeSingle();
    if (profileError || profile?.active !== true || profile?.role !== "SUCURSAL") return;
    if (Number(profile.branch_id) !== Number(conversation.branch_id)) return;
    if (activeImage?.branch_id != null && Number(activeImage.branch_id) !== Number(conversation.branch_id)) return;

    const normalized = String(question || "").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const {error} = await supabaseAdmin.from("assistant_query_log").insert({
      branch_id: conversation.branch_id,
      device_id: conversation.device_id || null,
      social_work_id: response.context?.social_work_id || response.social_work?.id || conversation.active_social_work_id || null,
      traffic_type: "PILOT",
      question,
      normalized_question: normalized,
      answer: String(response.answer),
      source: response.source || "IMAGE_ANALYSIS",
      route: response.route || "IMAGE_VISION_SAFE",
      found: !["IMAGE_PRESCRIPTION_CHECK_NO_NORMATIVE", "IMAGE_NORMATIVE_NOT_FOUND"].includes(response.route),
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      total_tokens: response.usage?.total_tokens ?? 0,
      elapsed_ms: elapsedMs,
      openai_response_id: response.response_id || null,
    });
    if (error) console.error("No se pudo registrar consulta de receta digital en el piloto:", error.message);
  } catch (error) {
    // El registro estadístico no debe interrumpir una respuesta de receta válida.
    console.error("Registro PILOT de receta digital:", error?.message || error);
  }
}

export async function POST(
  request
) {
  const startedAt = Date.now();
  let activeImage =
    null;

  try {
    const body =
      await request.json();

    const conversationId =
      body?.conversationId
        ? String(
            body
              .conversationId
          ).trim()
        : null;

    const imageId =
      body?.imageId
        ? String(
            body.imageId
          ).trim()
        : null;

    const question =
      String(
        body?.question ||
        ""
      ).trim();

    // =====================================================
    // INPUT
    // =====================================================

    if (!conversationId) {
      return Response.json(
        {
          ok: false,

          error:
            "Falta conversationId",

          code:
            "CONVERSATION_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    if (!question) {
      return Response.json(
        {
          ok: false,

          error:
            "Falta question",

          code:
            "QUESTION_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // CONVERSACIÓN
    // =====================================================

    const conversation =
      await loadConversation(
        conversationId
      );

    if (!conversation) {
      return Response.json(
        {
          ok: false,

          error:
            "Conversación no encontrada",

          code:
            "CONVERSATION_NOT_FOUND",
        },
        {
          status: 404,
        }
      );
    }

    if (
      conversation.closed_at
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La conversación está cerrada",

          code:
            "CONVERSATION_CLOSED",
        },
        {
          status: 400,
        }
      );
    }

    // =====================================================
    // IMAGEN
    // =====================================================

    activeImage =
      await loadActiveImage({
        conversationId,
        imageId,
      });

    if (!activeImage) {
      return Response.json(
        {
          ok: false,

          error:
            "No hay una imagen activa en esta conversación.",

          code:
            "ACTIVE_IMAGE_NOT_FOUND",
        },
        {
          status: 404,
        }
      );
    }

    if (
      String(
        activeImage
          .conversation_id
      ) !==
      conversationId
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "La imagen no pertenece a esta conversación.",

          code:
            "IMAGE_CONVERSATION_MISMATCH",
        },
        {
          status: 403,
        }
      );
    }

    // Único punto de salida para respuestas exitosas del análisis visual.
    // Se espera a guardar el log antes de enviar la respuesta; sin fire-and-forget.
    const respondWithPilotLog = async (payload) => {
      await logVisionPilotQuestion({request, conversation, activeImage, question,
        response: payload, elapsedMs: Date.now() - startedAt});
      return Response.json(payload);
    };

    await supabaseAdmin
      .from(
        "conversation_images"
      )
      .update({
        status:
          "ANALYZING",

        analysis_error:
          null,

        updated_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        activeImage.id
      );

    // =====================================================
    // DICCIONARIO OOSS
    // =====================================================

    const dictionary =
      await loadSocialWorkDictionary();

    const candidates =
      buildSocialWorkCandidates(
        dictionary
      );

    // =====================================================
    // OOSS ACTIVA DE CONVERSACIÓN
    // =====================================================

    let conversationSocialWork =
      null;

    if (
      conversation
        .active_social_work_id
    ) {
      const currentId =
        Number(
          conversation
            .active_social_work_id
        );

      const current =
        dictionary
          .socialWorks
          .find(
            (item) =>
              Number(
                item.id
              ) ===
              currentId
          );

      if (current) {
        conversationSocialWork = {
          id:
            currentId,

          name:
            current.name,
        };
      }
    }

    // =====================================================
    // OOSS EXPLÍCITA EN PREGUNTA
    // =====================================================

    const questionMatches =
      detectSocialWorkInText({
        text:
          question,

        candidates,
      });

    if (
      questionMatches.length >
      1
    ) {
      return Response.json(
        {
          ok: false,

          error:
            "Detecté más de una obra social. Indicame cuál querés consultar.",

          code:
            "MULTIPLE_SOCIAL_WORKS_DETECTED",

          social_works:
            questionMatches,
        },
        {
          status: 400,
        }
      );
    }

    const questionSocialWork =
      questionMatches[0] ||
      null;

    /*
     * Si el usuario escribió una OOSS,
     * tiene máxima prioridad.
     */
    if (
      questionSocialWork &&
      Number(
        conversation
          .active_social_work_id
      ) !==
      Number(
        questionSocialWork.id
      )
    ) {
      await setConversationSocialWork({
        conversationId,

        socialWorkId:
          questionSocialWork.id,
      });
    }

    // =====================================================
    // VISIÓN
    // =====================================================

    // PDF electrónico: enviar el documento ORIGINAL al modelo multimodal.
    // No convertirlo en OCR plano ni perder las páginas / diseño de la receta.
    const isPdf = activeImage.mime_type === "application/pdf";
    let imageUrl = null;
    let pdfBase64 = null;
    if (isPdf) {
      const {data:pdfBlob, error:pdfError} = await supabaseAdmin.storage
        .from("assistant-images").download(activeImage.storage_path);
      if (pdfError || !pdfBlob) throw new Error("No se pudo leer el PDF adjunto del almacenamiento privado.");
      const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());
      if (pdfBuffer.length > 4 * 1024 * 1024 || pdfBuffer.subarray(0,5).toString("ascii") !== "%PDF-") {
        throw new Error("El PDF no es válido o supera el límite de 4 MB.");
      }
      pdfBase64 = pdfBuffer.toString("base64");
    } else {
      imageUrl = await createImageUrl(activeImage.storage_path);
    }

    const vision =
      await analyzeImage({
        imageUrl,
        pdfBase64,
        pdfFilename:activeImage.original_filename || "receta.pdf",
        question,
      });

    const analysis =
      vision.analysis ||
      {};

    // =====================================================
    // OOSS CONFIRMADA EN IMAGEN
    // =====================================================

    let imageSocialWork =
      null;

    if (
      analysis
        ?.detected_social_work
    ) {
      imageSocialWork =
        resolveDetectedSocialWork({
          value:
            analysis
              .detected_social_work,

          candidates,
        });
    }

    // =====================================================
    // GUARDAR METADATA
    // =====================================================

    await saveAnalysisMetadata({
      imageId:
        activeImage.id,

      model:
        vision.model,

      analysis,

      responseId:
        vision.responseId,
    });

    // Si la OOSS escrita por el colaborador difiere de la detectada en
    // el documento, NO seleccionar ninguna ni continuar la verificación.
    if (questionSocialWork && imageSocialWork &&
        Number(questionSocialWork.id) !== Number(imageSocialWork.id)) {
      return await respondWithPilotLog({
        ok:true, question,
        answer:`La obra social indicada es ${questionSocialWork.name}, pero en la imagen parece figurar ${imageSocialWork.name}. No puedo confirmar cuál corresponde a esta receta. Revisá el documento original y volvé a preguntar indicando la obra social correcta. No se verificó la receta.`,
        source:"IMAGE_ANALYSIS", route:"IMAGE_SOCIAL_WORK_CONFLICT",
        context:{conversation_id:conversationId,branch_id:conversation.branch_id,
          device_id:conversation.device_id,social_work_id:null,image_id:activeImage.id},
        usage:vision.usage,ui:null,
      });
    }

    // =====================================================
    // DEFINIR OOSS OBJETIVO
    // =====================================================

    let targetSocialWork =
      null;

    let targetSource =
      null;

    /*
     * PRIORIDAD:
     *
     * 1. Usuario la escribió.
     * 2. Imagen la confirmó.
     * 3. Contexto solamente para preguntas
     *    que NO impliquen aceptar/dispensar
     *    una receta.
     */

    if (
      questionSocialWork
    ) {
      targetSocialWork =
        questionSocialWork;

      targetSource =
        "QUESTION";
    } else if (
      imageSocialWork
    ) {
      // ===================================================
      // CONFLICTO REAL:
      // CONTEXTO != IMAGEN
      // ===================================================

      if (
        conversationSocialWork &&
        Number(
          conversationSocialWork.id
        ) !==
        Number(
          imageSocialWork.id
        )
      ) {
        return Response.json(
          {
            ok: false,

            error:
              `La consulta está actualmente en ${conversationSocialWork.name}, ` +
              `pero la imagen parece corresponder a ${imageSocialWork.name}. ` +
              `Indicame cuál de las dos querés usar para verificar esta receta.`,

            code:
              "SOCIAL_WORK_REQUIRED",

            social_works: [
              conversationSocialWork,
              imageSocialWork,
            ],

            image_context: {
              confirmed_fields:
                analysis
                  ?.confirmed_fields ||
                [],

              uncertain_fields:
                analysis
                  ?.uncertain_fields ||
                [],

              absent_fields:
                analysis
                  ?.absent_fields ||
                [],
            },
          },
          {
            status: 400,
          }
        );
      }

      targetSocialWork =
        imageSocialWork;

      targetSource =
        "IMAGE";

      if (
        Number(
          conversation
            .active_social_work_id
        ) !==
        Number(
          imageSocialWork.id
        )
      ) {
        await setConversationSocialWork({
          conversationId,

          socialWorkId:
            imageSocialWork.id,
        });
      }
    }

    // =====================================================
    // CONSULTA VISUAL PURA
    // =====================================================

    if (
      isVisualOnlyQuestion(
        question
      ) &&
      !isPrescriptionCheckQuestion(
        question
      )
    ) {
      const responseContext = {
        conversation_id:
          conversationId,

        branch_id:
          conversation
            .branch_id,

        device_id:
          conversation
            .device_id,

        social_work_id:
          targetSocialWork
            ?.id ||
          conversationSocialWork
            ?.id ||
          null,

        image_id:
          activeImage.id,
      };

      return await respondWithPilotLog({
        ok: true,

        question,

        answer:
          buildVisualAnswer({
            question,
            analysis,
          }),

        source:
          "IMAGE_ANALYSIS",

        route:
          "IMAGE_VISION_SAFE",

        /*
         * No decimos que la OOSS activa
         * está en la imagen.
         */
        social_work:
          targetSource ===
            "IMAGE"
            ? targetSocialWork
            : null,

        context:
          responseContext,

        image: {
          id:
            activeImage.id,

          document_type:
            analysis
              ?.document_type ||
            "unknown",
        },

        ui:
          null,

        usage:
          vision.usage,
      });
    }

    // =====================================================
    // VALIDACIÓN DE RECETA
    // =====================================================

    if (
      isPrescriptionCheckQuestion(
        question
      )
    ) {
      /*
       * CASO 1:
       *
       * El usuario nombró explícitamente
       * la OOSS.
       *
       * Ejemplo:
       * "¿puedo recibir esta receta para OSDEPYM?"
       */
      if (
        questionSocialWork
      ) {
        targetSocialWork =
          questionSocialWork;

        targetSource =
          "QUESTION";
      }

      /*
       * CASO 2:
       *
       * La imagen confirmó claramente
       * una OOSS.
       */
      else if (
        imageSocialWork
      ) {
        targetSocialWork =
          imageSocialWork;

        targetSource =
          "IMAGE";
      }

      /*
       * CASO 3:
       *
       * Sólo tenemos una OOSS arrastrada
       * de la conversación.
       *
       * ESO NO ALCANZA para decidir si
       * puede recibirse la receta.
       *
       * Ejemplo:
       *
       * contexto: OSDE
       * imagen: no puedo confirmar OOSS
       *
       * NO validamos contra OSDE.
       */
      else if (
        conversationSocialWork
      ) {
        return Response.json(
          {
            ok: false,

            error:
              `La consulta está actualmente en ${conversationSocialWork.name}, ` +
              `pero no puedo confirmar que esta receta corresponda a ${conversationSocialWork.name}. ` +
              `¿Me confirmás la obra social? Si la imagen es ilegible, te mostraré los requisitos de su Recordá/Ficha para que los controles manualmente.`,

            code:
              "SOCIAL_WORK_REQUIRED",

            social_works: [
              conversationSocialWork,
            ],

            image_context: {
              confirmed_fields:
                analysis
                  ?.confirmed_fields ||
                [],

              uncertain_fields:
                analysis
                  ?.uncertain_fields ||
                [],

              absent_fields:
                analysis
                  ?.absent_fields ||
                [],
            },
          },
          {
            status: 400,
          }
        );
      }

      /*
       * CASO 4:
       *
       * No sabemos absolutamente ninguna OOSS.
       */
      else {
        return Response.json(
          {
            ok: false,

            error:
              buildUncertainPrescriptionReply(),

            code:
              "SOCIAL_WORK_REQUIRED",

            image_context: {
              confirmed_fields:
                analysis
                  ?.confirmed_fields ||
                [],

              uncertain_fields:
                analysis
                  ?.uncertain_fields ||
                [],

              absent_fields:
                analysis
                  ?.absent_fields ||
                [],
            },
          },
          {
            status: 400,
          }
        );
      }

      // ===================================================
      // YA TENEMOS OOSS OBJETIVO SEGURA
      // ===================================================

      let chosenChannelId = conversation.active_billing_channel_id || null;
      // Circuito indicado expresamente en el mensaje prevalece sobre el contexto anterior.
      const circuitText = normalizeText(question);
      const mentionsCamara = /\bcamara\b/.test(circuitText);
      const mentionsColegio = /\bcolegio\b/.test(circuitText);
      if (mentionsCamara !== mentionsColegio) {
        const {data:channels} = await supabaseAdmin.from("billing_channels").select("id,code,name");
        const selected = (channels || []).find(c =>
          normalizeText(`${c.code || ""} ${c.name || ""}`).includes(mentionsCamara ? "camara" : "colegio"));
        if (selected) chosenChannelId = selected.id;
      }

      // La modalidad operativa depende de sucursal + OOSS, no de interpretar
      // un circuito en una letra manuscrita. No alteramos billingChannelId:
      // Cámara–Colegio (procedimiento) no es sinónimo de canal documental.
      let circuitAdvice = "";
      if (conversation.branch_id && targetSocialWork?.id) {
        try {
          const operationResult = await resolveOperation({
            branchId:conversation.branch_id,socialWorkId:targetSocialWork.id,
          });
          if (operationResult?.resolved) {
            circuitAdvice = formatCircuitResponse(operationResult, "RECEPTION") || "";
          }
        } catch (circuitError) {
          console.error("assistant prescription circuit resolution:", circuitError?.message);
          circuitAdvice = "No pude consultar el circuito operativo de esta sucursal. Verificalo con Administración.";
        }
      }
      const withCircuitAdvice = (answer) => circuitAdvice
        ? `${answer}\n\n**Circuito de sucursal (independiente de la lectura de la receta):**\n${circuitAdvice}`
        : answer;

      // Si la escritura/imagen deja datos críticos sin verificar, no intentamos
      // aprobarla ni calcular ausencia: ofrecemos Ficha para control HUMANO.
      if (needsManualPrescriptionReview(analysis)) {
        const {data:ficha, error:fichaError} = await supabaseAdmin
          .from("social_works")
          .select("name,recipe_type,recipe_validity_days,letterhead,rp,diagnosis,monodrug,commercial_name,substitution,observations")
          .eq("id", targetSocialWork.id).maybeSingle();
        if (fichaError) console.error("visual manual ficha:", fichaError.message);
        const scope = await getNormativeCircuitScope(targetSocialWork.id, chosenChannelId);
        return await respondWithPilotLog({
          ok:true, question,
          answer:withCircuitAdvice(buildUncertainPrescriptionReply({
            socialWorkName:targetSocialWork.name,
            ficha,
            circuitWarning:scope.ok ? null : scope.reason,
          })),
          source:"SOCIAL_WORK_PROFILE",
          route:"IMAGE_MANUAL_PRESCRIPTION_CHECKLIST",
          found:Boolean(ficha),
          social_work:targetSocialWork,
          context:{conversation_id:conversationId,branch_id:conversation.branch_id,
            device_id:conversation.device_id,social_work_id:targetSocialWork.id,
            image_id:activeImage.id,social_work_source:targetSource},
          image:{id:activeImage.id,document_type:analysis.document_type || "unknown"},
          usage:vision.usage,
          ui:null,
        });
      }

      const verification =
        await verifyPrescriptionAgainstNormative({
          analysis,
          socialWork:targetSocialWork,
          billingChannelId:chosenChannelId,
        });

      const responseContext = {
        conversation_id:
          conversationId,

        branch_id:
          conversation
            .branch_id,

        device_id:
          conversation
            .device_id,

        social_work_id:
          targetSocialWork.id,

        image_id:
          activeImage.id,

        social_work_source:
          targetSource,
      };

      if (
        !verification ||
        !verification.found
      ) {
        return await respondWithPilotLog({
          ok: true,

          question,

          answer:withCircuitAdvice(
            verification?.answer || `Pude analizar la receta, pero no encontré normativa suficiente de ${targetSocialWork.name} para verificarla de forma segura.`),

          source:
            "IMAGE_ANALYSIS",

          route:
            "IMAGE_PRESCRIPTION_CHECK_NO_NORMATIVE",

          social_work:
            targetSocialWork,

          context:
            responseContext,

          ui:
            null,
        });
      }

      return await respondWithPilotLog({
        ok: true,

        question,

        answer:
          withCircuitAdvice(verification.answer),

        source:
          "IMAGE_AND_NORMATIVE",

        route:
          "IMAGE_PRESCRIPTION_CHECK",

        social_work:
          targetSocialWork,

        context:
          responseContext,

        image: {
          id:
            activeImage.id,

          document_type:
            analysis
              ?.document_type ||
            "unknown",
        },

        image_analysis: {
          confirmed_fields:
            analysis
              ?.confirmed_fields ||
            [],

          uncertain_fields:
            analysis
              ?.uncertain_fields ||
            [],

          absent_fields:
            analysis
              ?.absent_fields ||
            [],
        },

        verification: {
          result:
            verification.result,

          evaluations:
            verification.evaluations,
        },

        ui:
          null,

        usage:
          verification.usage,

        response_id:
          verification.responseId,
      });
    }

    // =====================================================
    // OTRAS PREGUNTAS CON IMAGEN ACTIVA
    // =====================================================

    /*
     * Para consultas que NO son:
     *
     * "¿puedo recibir esta receta?"
     *
     * sí podemos reutilizar el contexto activo.
     *
     * Ejemplo:
     * "¿cómo se valida?"
     */
    if (
      !targetSocialWork &&
      conversationSocialWork
    ) {
      targetSocialWork =
        conversationSocialWork;

      targetSource =
        "CONVERSATION";
    }

    const responseContext = {
      conversation_id:
        conversationId,

      branch_id:
        conversation
          .branch_id,

      device_id:
        conversation
          .device_id,

      social_work_id:
        targetSocialWork
          ?.id ||
        null,

      image_id:
        activeImage.id,

      social_work_source:
        targetSource,
    };

    // =====================================================
    // SIN OOSS
    // =====================================================

    if (
      !targetSocialWork
    ) {
      return await respondWithPilotLog({
        ok: true,

        question,

        answer:
          buildVisualAnswer({
            question,
            analysis,
          }),

        source:
          "IMAGE_ANALYSIS",

        route:
          "IMAGE_VISION_SAFE",

        social_work:
          null,

        context:
          responseContext,

        ui:
          null,

        usage:
          vision.usage,
      });
    }

    // =====================================================
    // NORMATIVA GENERAL
    // =====================================================

    const normative =
      await answerGenericNormativeQuestion({
        question,

        socialWork:
          targetSocialWork,
      });

    if (
      !normative ||
      !normative.found
    ) {
      return await respondWithPilotLog({
        ok: true,

        question,

        answer:
          `No encontré normativa suficiente de ${targetSocialWork.name} para responder con seguridad.`,

        source:
          "IMAGE_ANALYSIS",

        route:
          "IMAGE_NORMATIVE_NOT_FOUND",

        social_work:
          targetSocialWork,

        context:
          responseContext,

        ui:
          null,
      });
    }

    return await respondWithPilotLog({
      ok: true,

      question,

      answer:
        normative.answer,

      source:
        "IMAGE_AND_NORMATIVE",

      route:
        "IMAGE_NORMATIVE",

      social_work:
        targetSocialWork,

      context:
        responseContext,

      ui:
        null,

      usage:
        normative.usage,

      response_id:
        normative.responseId,
    });
  } catch (error) {
    console.error(
      "POST analyze-image:",
      error
    );

    if (
      activeImage?.id
    ) {
      await markAnalysisError({
        imageId:
          activeImage.id,

        message:
          error?.message,
      });
    }

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "No se pudo analizar la imagen.",

        code:
          "IMAGE_ANALYSIS_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}