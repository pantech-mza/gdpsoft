import OpenAI from "openai";
import { buildCourtesyAnswer, classifyCourtesy } from "../../../../lib/assistant/courtesy.mjs";

import {
  resolveOperation,
} from "../../../../lib/operations/resolve-operation";
import {
  answerValidatorChallenge, describeBranchValidatorException, formatBranchValidatorNote, formatCircuitResponse,
  resolveDeclaredCircuitPolicy, formatCircuitLine, applyCircuitLine,
} from "../../../../lib/operations/camara-colegio-policy.mjs";

import {
  supabaseAdmin,
} from "../../../../lib/supabase/admin";

import {
  normalizeQuestion,
} from "../../../../lib/assistant/normalize-question";

import {
  buildSocialWorkDictionary,
  detectSocialWorks,
} from "../../../../lib/assistant/socialWorkDetection";

import { resolveInternalProcedure, isImmediateOperationalContingency, isSpecificNormativeQuestion, listApplicableProcedures } from "../../../../lib/assistant/internal-procedures";
import { buildProcedureSelectionInstructions, formatProcedureAnswer, parseProcedureSelection } from "../../../../lib/assistant/procedure-match.mjs";
import { asksForPrescriptionChecklist, buildFichaPrescriptionChecklist, isPrescriptionMissingFieldQuestion, buildMissingFieldNormativeQuestion } from "../../../../lib/assistant/prescription-safety.mjs";
import { resolvePlanVariant } from "../../../../lib/assistant/plan-variant.mjs";
import { getLinkedCurrentNormativeScope, scopeLinkedNormatives, scopeNormativeTopic, isSpecificNormativeTopic } from "../../../../lib/assistant/linked-normatives.mjs";
import { buildRequirementsAnswer, buildSectionedAnswer } from "../../../../lib/assistant/requirements-view.mjs";
import { withCircuitProfile } from "../../../../lib/social-works/circuit-profile.mjs";
import { isAccessInstruction } from "../../../../lib/social-works/legacy-notes.mjs";
import { shouldPreferValidationProfile } from "../../../../lib/assistant/validation-profile-priority.mjs";
import { isGeneralBranchCircuitQuestion, resolveGeneralBranchMembership, formatGeneralBranchMembershipResponse } from "../../../../lib/assistant/branch-circuit-membership.mjs";
import {
  applySuggestion, pickPendingSocialWork, buildBareMentionAnswer, buildPartialAnswerQuestion, isNotFoundAnswer, buildNextState, detectChannelReply, isBareSocialWorkMention, isSuggestionConfirmation,
  isFreshState, loadConversationState, pendingRealQuestion, resolveBranchBillingChannelId, resolveBranchChannelAmongLinked, resolveBranchGroup, buildBranchCircuitPrompt,
  resolveChannelIdForGroup, resolveFollowUp, saveConversationState,
} from "../../../../lib/assistant/conversation-context.mjs";
import { buildSuggestionAnswer, suggestSocialWorks } from "../../../../lib/assistant/social-work-suggestions.mjs";
import {
  buildCredentialAnswer, buildNotesInstructions, extractEmails, formatNotesAnswer, isCredentialQuestion,
  loadApprovedNotes, parseNotesAnswer, findMatchingNotes, distinctiveTokens, dropProductSpecificNotes,
} from "../../../../lib/assistant/approved-notes.mjs";
import { findSemanticApprovedFaq, recordFaqSignal } from "../../../../lib/server/faq-detection.mjs";
import { buildConstraintsPrompt, splitUserConstraints, stripOfferLine } from "../../../../lib/assistant/user-constraints.mjs";
import {
  appendObservation, buildCorrectionsPrompt, findExactCorrection, findExactObservation,
  loadSocialWorkCorrections, loadSocialWorkObservations, restrictCorrectionsToCircuit,
} from "../../../../lib/assistant/admin-corrections.mjs";
import { isOperationalCircuitQuestion } from "../../../../lib/assistant/operational-circuit-intent.mjs";
import { isSocialWorkStatusQuestion, hasExplicitStatusSubject, formatSocialWorkStatus } from "../../../../lib/assistant/social-work-status.mjs";
import { unresolvedExplicitSocialWork } from "../../../../lib/assistant/explicit-social-work-protection.mjs";

import { resolveCommonAuthorizationAmount } from "../../../../lib/assistant/common-authorization-rules.mjs";
const isAuthorizationAmountQuestionForCommonRule = (question) => /(?:autoriz|\btopes?\b|\blimites?\b|\bimportes?\b|\bprecios?\b|\bmontos?\b|\$\s*\d|\b20\s*000\b|\b80\s*000\b)/i.test(String(question || "").normalize("NFD").replace(/[\u0300-\u036f]/g,""));

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  60;



const openai = new OpenAI({

  apiKey: process.env.OPENAI_API_KEY,

});



// =========================================================

// LOG DE CONSULTAS

// =========================================================



// v3.13.57 — FAQ por significado: vectores (256 dim.) para agrupar consultas parecidas.
async function embedFaqTexts(texts) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
    dimensions: 256,
  });
  return response.data.map((item) => item.embedding);
}

async function lookupSemanticFaq({ branchId, socialWorkId, question }) {
  try {
    return await findSemanticApprovedFaq({
      db: supabaseAdmin, embed: embedFaqTexts, socialWorkId, branchId, question,
      branchGroup: await resolveBranchGroup(supabaseAdmin, branchId).catch(() => null),
    });
  } catch (error) {
    console.error("FAQ semantic lookup error:", error?.message);
    return null;
  }
}

async function logAssistantQuery({

  branchId = null,

  socialWorkId,

  question,

  answer = null,

  source = null,

  route = null,

  normativeId = null,

  found = null,

  usage = null,

  elapsedMs = null,

  openaiResponseId = null,
  trafficType = "OTHER",
  deviceId = null,

}) {

  try {

    const normalizedQuestion =

      normalizeQuestion(question);



    const { data: insertedLog, error } =

      await supabaseAdmin

        .from("assistant_query_log")

        .insert({

          branch_id: branchId,
          traffic_type: trafficType,
          device_id: deviceId,



          social_work_id:

            socialWorkId,



          question,



          normalized_question:

            normalizedQuestion,



          answer,



          source,



          route,



          normative_id:

            normativeId,



          found,



          input_tokens:

            usage?.input_tokens ?? 0,



          output_tokens:

            usage?.output_tokens ?? 0,



          total_tokens:

            usage?.total_tokens ?? 0,



          elapsed_ms:

            elapsedMs,



          openai_response_id:

            openaiResponseId,

        })
        .select("id")
        .maybeSingle();
    if (error) {
      console.error("assistant_query_log error:", error.message);
    } else if (trafficType === "PILOT" && found === true) {
      // v3.13.57 — cuenta la consulta en su grupo (por significado, todas las
      // sucursales) y propone la FAQ al admin al llegar al umbral.
      try {
        await Promise.race([
          recordFaqSignal({
            db: supabaseAdmin,
            embed: embedFaqTexts,
            signal: {
              socialWorkId, branchId, deviceId, question, answer, route, found, trafficType,
              sourceType: source, normativeId, queryLogId: insertedLog?.id ?? null,
              branchGroup: await resolveBranchGroup(supabaseAdmin, branchId).catch(() => null),
            },
          }),
          new Promise((resolve) => setTimeout(resolve, 4000)),
        ]);
      } catch (faqError) {
        console.error("FAQ signal error:", faqError?.message);
      }
    }

  } catch (error) {

    /**

 * IMPORTANTE:

 * nunca rompemos el bot porque

 * haya fallado el logging.

 */



    console.error(

      "assistant_query_log exception:",

      error

    );

  }

}



async function getCachedAnswer({

  branchId,

  socialWorkId,

  question,

}) {

  const normalizedQuestion =

    normalizeQuestion(question);



  const { data, error } =

    await supabaseAdmin

      .from("assistant_answer_cache")

      .select(`

        id,

        answer,

        source,

        route,

        normative_id,

        hit_count

      `)

      .eq(

        "branch_id",

        branchId

      )

      .eq(

        "social_work_id",

        socialWorkId

      )

      .eq(

        "normalized_question",

        normalizedQuestion

      )

      .eq(

        "active",

        true

      )
      // v3.13.20 — permite ignorar respuestas cacheadas antes de una fecha
      // (p. ej. tras cambiar los prompts) sin borrar nada.
      .gte("updated_at", process.env.GDP_ANSWER_CACHE_MIN_DATE || "1970-01-01T00:00:00Z")

      .maybeSingle();



  if (error) {

    console.error(

      "assistant_answer_cache lookup error:",

      error.message

    );



    return null;

  }



  if (!data) {

    return null;

  }



  await supabaseAdmin

    .from("assistant_answer_cache")

    .update({

      hit_count:

        (data.hit_count || 0) + 1,



      last_used_at:

        new Date().toISOString(),



      updated_at:

        new Date().toISOString(),

    })

    .eq(

      "id",

      data.id

    );



  return data;

}



async function saveCachedAnswer({

  branchId,

  socialWorkId,

  question,

  answer,

  source,

  route,

  normativeId = null,

  openaiResponseId = null,

  usage = null,

}) {

  if (

    !branchId ||

    !socialWorkId ||

    !question ||

    !answer

  ) {

    return;

  }



  const normalizedQuestion =

    normalizeQuestion(question);



  const { error } =

    await supabaseAdmin

      .from("assistant_answer_cache")

      .upsert(

        {

          branch_id:

            branchId,



          social_work_id:

            socialWorkId,



          normalized_question:

            normalizedQuestion,



          original_question:

            question,



          answer,



          source,



          route,



          normative_id:

            normativeId,



          openai_response_id:

            openaiResponseId,



          input_tokens:

            usage?.input_tokens ?? 0,



          output_tokens:

            usage?.output_tokens ?? 0,



          total_tokens:

            usage?.total_tokens ?? 0,



          active:

            true,



          updated_at:

            new Date().toISOString(),

        },

        {

          onConflict:

            "branch_id,social_work_id,normalized_question",

        }

      );



  if (error) {

    console.error(

      "assistant_answer_cache save error:",

      error.message

    );

  }

}



async function maybeSuggestFaq({

  branchId,

  socialWorkId,

  question,

  answer,

  normativeId = null,

  sourceType = null,

}) {
  // v3.13.57: reemplazado por la detección por significado (lib/server/faq-detection.mjs).
  return;

  /**

 * Para sugerir FAQ necesitamos:

 * - sucursal

 * - obra social

 * - pregunta

 * - respuesta válida

 */



  if (

    !branchId ||

    !socialWorkId ||

    !question ||

    !answer

  ) {

    return;

  }



  try {

    const normalizedQuestion =

      normalizeQuestion(question);



    /**

 * Ventana de análisis:

 * últimos 7 días.

 */



    const since =

      new Date(

        Date.now() -

          7 * 24 * 60 * 60 * 1000

      ).toISOString();



    /**

 * Contamos cuántas veces se hizo

 * esta misma pregunta en la misma

 * sucursal y OOSS.

 */



    const {

      count,

      error: countError,

    } =

      await supabaseAdmin

        .from("assistant_query_log")

        .select(

          "id",

          {

            count: "exact",

            head: true,

          }

        )

        .eq(

          "branch_id",

          branchId

        )

        .eq(

          "social_work_id",

          socialWorkId

        )

        .eq(

          "normalized_question",

          normalizedQuestion

        )

        .eq(

          "found",

          true

        )

        .gte(

          "created_at",

          since

        );



    if (countError) {

      console.error(

        "FAQ detection count error:",

        countError.message

      );



      return;

    }



    /**

 * Por ahora el umbral es 3.



 * Después lo podremos llevar

 * a configuración del sistema.

 */



    const FAQ_THRESHOLD = 3;



    if (

      !count ||

      count < FAQ_THRESHOLD

    ) {

      return;

    }



    /**

 * Revisamos si ya existe

 * una sugerencia / FAQ para

 * esta misma combinación.

 */



    const {

      data: existingFaq,

      error: existingError,

    } =

      await supabaseAdmin

        .from("social_work_faqs")

        .select(`

          id,

          status,

          detected_count

        `)

        .eq(

          "social_work_id",

          socialWorkId

        )

        .eq(

          "branch_id",

          branchId

        )

        .eq(

          "normalized_question",

          normalizedQuestion

        )

        .neq(

          "status",

          "ARCHIVED"

        )

        .order(

          "id",

          {

            ascending: false,

          }

        )

        .limit(1)

        .maybeSingle();



    if (existingError) {

      console.error(

        "FAQ detection lookup error:",

        existingError.message

      );



      return;

    }



    /**

 * Si ya existe, actualizamos

 * la cantidad detectada.



 * No modificamos automáticamente

 * una respuesta APPROVED.

 */



    if (existingFaq) {

      const updateData = {

        detected_count:

          count,



        last_detected_at:

          new Date().toISOString(),



        updated_at:

          new Date().toISOString(),

      };



      /**

 * Si sigue siendo una sugerencia,

 * podemos refrescar la respuesta

 * sugerida.



 * Si ya fue aprobada, no.

 */



      if (

        existingFaq.status ===

        "SUGGESTED"

      ) {

        updateData.answer =

          answer;



        updateData.source_type =

          sourceType;



        updateData.source_normative_id =

          normativeId;

      }



      const { error } =

        await supabaseAdmin

          .from("social_work_faqs")

          .update(

            updateData

          )

          .eq(

            "id",

            existingFaq.id

          );



      if (error) {

        console.error(

          "FAQ detection update error:",

          error.message

        );

      }



      return;

    }



    /**

 * Si todavía no existe,

 * creamos la sugerencia.

 */



    const { error } =

      await supabaseAdmin

        .from("social_work_faqs")

        .insert({

          social_work_id:

            socialWorkId,



          branch_id:

            branchId,



          question,



          normalized_question:

            normalizedQuestion,



          answer,



          status:

            "SUGGESTED",



          source_type:

            sourceType,



          source_normative_id:

            normativeId,



          detected_count:

            count,



          first_detected_at:

            new Date().toISOString(),



          last_detected_at:

            new Date().toISOString(),



          active:

            true,

        });



    if (error) {

      console.error(

        "FAQ detection insert error:",

        error.message

      );

    }

  } catch (error) {

    /**

 * Igual que el log:

 * nunca romper el bot porque

 * falle el sistema de sugerencias.

 */



    console.error(

      "FAQ detection exception:",

      error

    );

  }

}



async function getApprovedFaq({

  branchId,

  socialWorkId,

  question,

}) {

  const normalizedQuestion =

    normalizeQuestion(question);



  try {

    /**

 * 1. Primero buscamos una FAQ

 * específica para la sucursal.

 */



    if (branchId) {

      const {

        data: branchFaq,

        error: branchError,

      } =

        await supabaseAdmin

          .from("social_work_faqs")

      .select(`

  id,

  social_work_id,

  branch_id,

  question,

  answer,

  source_type,

  source_normative_id,

  detected_count,

  usage_count

`)

          .eq(

            "social_work_id",

            socialWorkId

          )

          .eq(

            "branch_id",

            branchId

          )

          .eq(

            "normalized_question",

            normalizedQuestion

          )

          .eq(

            "status",

            "APPROVED"

          )

          .eq(

            "active",

            true

          )

          .order(

            "id",

            {

              ascending: false,

            }

          )

          .limit(1)

          .maybeSingle();



      if (branchError) {

        console.error(

          "FAQ branch lookup error:",

          branchError.message

        );

      }



      if (branchFaq) {

        return {

          ...branchFaq,

          scope: "BRANCH",

        };

      }

    }



    /**

 * 2. Si no hay FAQ específica,

 * buscamos una FAQ GLOBAL

 * para esa obra social.

 */



    const {

      data: globalFaq,

      error: globalError,

    } =

      await supabaseAdmin

        .from("social_work_faqs")

      .select(`

  id,

  social_work_id,

  branch_id,

  question,

  answer,

  source_type,

  source_normative_id,

  detected_count,

  usage_count

`)

        .eq(

          "social_work_id",

          socialWorkId

        )

        .is(

          "branch_id",

          null

        )

        .eq(

          "normalized_question",

          normalizedQuestion

        )

        .eq(

          "status",

          "APPROVED"

        )

        .eq(

          "active",

          true

        )

        .order(

          "id",

          {

            ascending: false,

          }

        )

        .limit(1)

        .maybeSingle();



    if (globalError) {

      console.error(

        "FAQ global lookup error:",

        globalError.message

      );



      return null;

    }



    if (globalFaq) {

      return {

        ...globalFaq,

        scope: "GLOBAL",

      };

    }



    return null;

  } catch (error) {

    console.error(

      "FAQ lookup exception:",

      error

    );



    return null;

  }

}

// =========================================================

// UTILIDADES

// =========================================================



function normalize(value = "") {

  return String(value)

    .normalize("NFD")

    .replace(

      /[\u0300-\u036f]/g,

      ""

    )

    .toLowerCase()

    .replace(

      /\s+/g,

      " "

    )

    .trim();

}



function containsAny(

  text,

  values

) {

  return values.some(

    (value) =>

      text.includes(value)

  );

}



function wantsDetailedAnswer(

  question

) {

  const q =

    normalize(question);



  return containsAny(

    q,

    [

      "requisitos",

      "requisito",

      "detalle",

      "detalles",

      "explica",

      "explicame",

      "completo",

      "completa",

      "todos",

      "todas",

      "paso a paso",

      "que necesito",

      "que debe tener",

    ]

  );

}



// =========================================================

// FORMATEAR RESPUESTA OPERATIVA

// =========================================================



function formatOperationAnswer(

  result,

  operationType

) {
  // Toda respuesta operativa debe incluir circuito y límites de la evidencia.
  // Nunca equivaler "circuito directo" a "receta válida".
  const safeAnswer = formatCircuitResponse(result, operationType);
  if (safeAnswer) return safeAnswer;

  const operation =

    result.operation;



  if (!operation) {

    return null;

  }



  // =====================================================

  // RECEPCIÓN

  // =====================================================



  if (

    operationType ===

    "RECEPTION"

  ) {

    if (

      operation.canReceive ===

      false

    ) {

      return "No, esta sucursal no puede recibirla.";

    }



    if (

      operation.reception

        ?.allDay === true

    ) {

      return "Sí. Esta sucursal puede recibirla durante todo el día.";

    }



    if (

      operation.reception

        ?.until

    ) {

      const time =

        operation.reception.until.slice(

          0,

          5

        );



      return `Sí. Esta sucursal puede recibirla hasta las ${time}.`;

    }



    if (

      operation.canReceive ===

      true

    ) {

      return "Sí. Esta sucursal puede recibirla.";

    }

  }



  // =====================================================

  // VALIDACIÓN

  // =====================================================



  if (

    operationType ===

    "VALIDATION"

  ) {

    if (

      operation.mode ===

        "EXTERNAL_VALIDATOR" &&

      operation.validation

        ?.validatorBranch?.name

    ) {

      return `Validá directamente con el validador de ${operation.validation.validatorBranch.name}.`;

    }



    if (

      operation.mode ===

      "CAMARA_COLEGIO"

    ) {

      if (

        operation.validation

          ?.branchType

      ) {

        return `Requiere circuito Cámara-Colegio hacia una sucursal ${operation.validation.branchType}.`;

      }



      return "Requiere circuito Cámara-Colegio.";

    }



if (

  operation.mode ===

  "DIRECT"

) {

  if (

    operation.validation?.instructions

  ) {

    return operation.validation.instructions;

  }



  if (

    operation.summary &&

    operation.instructions

  ) {

    return `${operation.summary} ${operation.instructions}`;

  }



  return (

    operation.summary ||

    operation.instructions ||

    "Se opera de forma directa."

  );

}

    return (

      operation.validation

        ?.instructions ||

      operation.summary

    );

  }



  // =====================================================

  // PRESENTACIÓN

  // =====================================================



  if (

    operationType ===

    "PRESENTATION"

  ) {

    if (

      operation.presentation

        ?.branch?.name

    ) {

      return `La presentación debe realizarse en ${operation.presentation.branch.name}.`;

    }



    if (

      operation.presentation

        ?.branchType

    ) {

      return `La presentación debe canalizarse por una sucursal ${operation.presentation.branchType}.`;

    }



    if (

      operation.mode ===

      "CAMARA_COLEGIO"

    ) {

      return "La presentación se realiza mediante el circuito Cámara-Colegio.";

    }



    return (

      operation.presentation

        ?.instructions ||

      operation.summary

    );

  }



  // =====================================================

  // CIRCUITO

  // =====================================================



  if (

    operationType ===

    "CIRCUIT"

  ) {

    if (

      operation.mode ===

      "CAMARA_COLEGIO"

    ) {

      return "Sí. Esta sucursal debe utilizar el circuito Cámara-Colegio.";

    }



    if (

      operation.mode ===

        "EXTERNAL_VALIDATOR" &&

      operation.validation

        ?.validatorBranch?.name

    ) {

      return `No. Se opera directamente utilizando el validador de ${operation.validation.validatorBranch.name}.`;

    }



    if (

      operation.mode ===

      "DIRECT"

    ) {

      return "No. Esta sucursal la opera de forma directa.";

    }



    return operation.summary;

  }



  return (

    operation.summary ||

    operation.instructions

  );

}



// =========================================================

// OPERACIÓN POR SUCURSAL

// =========================================================



function detectOperationIntent(

  question

) {

  const q =

    normalize(question);



  // -------------------------------------------------------

  // RECEPCIÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "la recibimos",

        "lo recibimos",

        "se recibe",

        "puedo recibir",

        "podemos recibir",

        "recibimos aca",

        "recibir aca",

        "hasta que hora",

        "hasta qué hora",

        "todo el dia",

        "todo el día",

        "horario de recepcion",

        "horario de recepción",

      ]

    )

  ) {

    return {

      domain:

        "OPERATION",



      operationType:

        "RECEPTION",

    };

  }



  // -------------------------------------------------------

  // PRESENTACIÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "donde presento",

        "dónde presento",

        "por donde presento",

        "por dónde presento",

        "donde se presenta",

        "dónde se presenta",

        "donde mando",

        "dónde mando",

        "a donde mando",

        "a dónde mando",

        "donde envio",

        "dónde envío",

      ]

    )

  ) {

    return {

      domain:

        "OPERATION",



      operationType:

        "PRESENTATION",

    };

  }



  // -------------------------------------------------------

  // CÁMARA / COLEGIO / CIRCUITO

  // -------------------------------------------------------



  if (
    isOperationalCircuitQuestion(question) ||
    containsAny(

      q,

      [

        "camara colegio",

        "camara-colegio",

        "camara – colegio",

        "cámara colegio",

        "cámara-colegio",

        "circuito",

        "va por camara",

        "va por cámara",

        "va por colegio",

        "es directa",

        "es directo",

        "recibe directa",

        "recibe directo",



        "como opera",

        "cómo opera",

        "como funciona",

        "cómo funciona",

        "como se maneja",

        "cómo se maneja",

        "como se trabaja",

        "cómo se trabaja",

        "cual es el circuito",

        "cuál es el circuito",

      ]

    )

  ) {

    return {

      domain:

        "OPERATION",



      operationType:

        "CIRCUIT",

    };

  }



  // -------------------------------------------------------

  // VALIDACIÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "como valido",

        "cómo valido",

        "donde valido",

        "dónde valido",

        "por donde valido",

        "por dónde valido",

        "que validador",

        "qué validador",

        "cual validador",

        "cuál validador",

        "donde se valida",

        "dónde se valida",

      ]

    )

  ) {

    return {

      domain:

        "OPERATION",



      operationType:

        "VALIDATION",

    };

  }



  return null;

}



// =========================================================

// CONTACTOS

// =========================================================



function detectContactIntent(

  question

) {

  const q =

    normalize(question);



  const hasContactCue =

    containsAny(

      q,

      [

        "telefono",

        "telefonos",

        "tel ",

        // "numero" por sí solo NO implica contacto:
        // puede ser número de afiliado, receta, autorización, matrícula, etc.
        "contacto",



        "llamar",

        "llamo",

        "llame",

        "llamada",



        "donde llamo",

        "a donde llamo",

        "a quien llamo",



        "comunicar",

        "comunicarme",



        "mesa de ayuda",

        "central de autorizaciones",



        "farmalink",

        "imed",

        "cue",

      ]

    );



  // -------------------------------------------------------

  // ATENCIÓN AL AFILIADO

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "atencion al afiliado",

        "atencion afiliado",

        "telefono del afiliado",

        "telefono para afiliados",

        "contacto del afiliado",

        "contacto para afiliados",

      ]

    )

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        "AFFILIATE_SERVICE",

    };

  }



  // -------------------------------------------------------

  // FUERA DE HORARIO

  // -------------------------------------------------------



  if (

    hasContactCue &&

    containsAny(

      q,

      [

        "fuera de horario",

        "fuera del horario",

        "fuera de hora",

        "activo o pasivo",

        "cue",

        "urgencias y emergencias",

      ]

    )

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        "OUT_OF_HOURS_VALIDATION",

    };

  }



  // -------------------------------------------------------

  // PROBLEMAS DE VALIDACIÓN

  // -------------------------------------------------------



  const hasValidationProblem =

    containsAny(

      q,

      [

        "problema para validar",

        "problemas para validar",



        "problema al validar",

        "problemas al validar",



        "problema con la validacion",

        "problemas con la validacion",



        "inconveniente con la validacion",

        "inconvenientes con la validacion",



        "no puedo validar",

        "no podemos validar",



        "no me deja validar",

        "no nos deja validar",



        "error de validacion",

        "error al validar",



        "falla la validacion",

        "falla al validar",



        "no funciona la validacion",

      ]

    );



  const mentionsValidation =

    containsAny(

      q,

      [

        "validacion",

        "validar",

        "imed",

        "mesa de ayuda",

      ]

    );



  if (

    hasValidationProblem ||

    (

      hasContactCue &&

      mentionsValidation

    )

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        "VALIDATION_SUPPORT",

    };

  }



  // -------------------------------------------------------

  // SOPORTE DE NORMATIVA

  // -------------------------------------------------------



  if (

    hasContactCue &&

    containsAny(

      q,

      [

        "normativa",

        "norma operativa",

        "consulta normativa",

        "consultas normativa",

        "farmalink",

      ]

    )

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        "NORMATIVE_SUPPORT",

    };

  }



  // -------------------------------------------------------

  // AUTORIZACIONES

  // -------------------------------------------------------



  if (

    hasContactCue &&

    containsAny(

      q,

      [

        "autorizacion",

        "autorizaciones",

        "autorizar",

        "codigo de autorizacion",

        "codigos de autorizacion",

        "cat",

        "fuera de padron",

      ]

    )

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        "AUTHORIZATION",

    };

  }



  // -------------------------------------------------------

  // CONTACTO GENÉRICO

  // -------------------------------------------------------



  if (

    hasContactCue

  ) {

    return {

      domain:

        "CONTACT",



      contactType:

        null,

    };

  }



  return null;

}

// =========================================================
// ACLARACIONES DE ALCANCE
// =========================================================

function detectScopeClarificationIntent(
  question
) {
  const q =
    normalize(question);

  // Consultas demasiado amplias:
  // no conviene responder "no encuentro";
  // pedimos el dato que falta.

  const asksGenericCoverage =
    containsAny(
      q,
      [
        "que cobertura tiene",
        "qué cobertura tiene",
        "cobertura general",
        "porcentaje de cobertura",
        "porcentajes de cobertura",
      ]
    ) &&
    !containsAny(
      q,
      [
        "cronico",
        "crónico",
        "cronicos",
        "crónicos",
        "pmi",
        "materno infantil",
        "discapacidad",
        "anticoncept",
        "diabetes",
        "vacuna",
      ]
    );

  if (
    asksGenericCoverage
  ) {
    return {
      domain:
        "CLARIFICATION",

      clarificationType:
        "COVERAGE",

      answer:
        "La cobertura depende del plan o la prestación. ¿Qué plan o prestación querés consultar?",
    };
  }

  const asksGenericPlans =
    containsAny(
      q,
      [
        "que planes y porcentajes",
        "qué planes y porcentajes",
        "planes y porcentajes",
        "que planes tiene",
        "qué planes tiene",
        "cuales son los planes",
        "cuáles son los planes",
      ]
    );

  if (
    asksGenericPlans
  ) {
    return {
      domain:
        "CLARIFICATION",

      clarificationType:
        "PLANS",

      answer:
        "Hay distintos planes y coberturas. ¿Qué plan o prestación querés consultar?",
    };
  }

  return null;
}


// =========================================================
// REQUISITOS DE RECETA QUE NO ESTÁN EN LA FICHA ESTRUCTURADA
// =========================================================

function detectNormativeRequirementIntent(
  question
) {
  const q =
    normalize(question);

  if (
    containsAny(
      q,
      [
        "numero de matricula",
        "número de matrícula",
        "matricula del profesional",
        "matrícula del profesional",
        "matricula medica",
        "matrícula médica",
        "requiere matricula",
        "requiere matrícula",
      ]
    )
  ) {
    return {
      key:
        "DOCTOR_REGISTRATION_NUMBER",
    };
  }

  if (
    containsAny(
      q,
      [
        "fecha de prescripcion",
        "fecha de prescripción",
        "exige fecha",
        "requiere fecha",
        "fecha en la receta",
      ]
    )
  ) {
    return {
      key:
        "PRESCRIPTION_DATE",
    };
  }

  return null;
}


function buildNormativeRequirementFallbackQuestion({
  intent,
  socialWorkName,
}) {
  const name =
    socialWorkName ||
    "la obra social";

  switch (
    intent?.key
  ) {
    case "DOCTOR_REGISTRATION_NUMBER":
      return (
        `En los requisitos que debe contener una receta de ${name}, ` +
        `¿debe figurar el número de matrícula del profesional? ` +
        `Buscá específicamente los requisitos de firma, sello, aclaración y matrícula. ` +
        `Respondé únicamente ese requisito.`
      );

    case "PRESCRIPTION_DATE":
      return (
        `En los requisitos que debe contener una receta de ${name}, ` +
        `¿debe figurar la fecha de prescripción? ` +
        `Buscá específicamente el apartado de datos obligatorios de la receta. ` +
        `Respondé únicamente ese requisito.`
      );

    default:
      return null;
  }
}


// v3.13.36 — apoyo con observaciones operativas APROBADAS cuando la normativa no responde.
async function answerFromApprovedNotes({ question, socialWorkId, variant = resolvePlanVariant({ question, state: null, socialWorkId }) }) {
  try {
    const notes = dropProductSpecificNotes(await loadApprovedNotes(supabaseAdmin, socialWorkId, variant), question);
    if (!notes.length) return null;
    const socialWorkName = await getSocialWorkName(socialWorkId);
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: buildNotesInstructions(socialWorkName, notes),
      input: question,
      temperature: 0,
      max_output_tokens: 500,
    });
    const answer = parseNotesAnswer(response.output_text);
    return answer ? { answer: formatNotesAnswer(answer), usage: response.usage || null } : null;
  } catch (notesError) {
    console.warn("observaciones de apoyo no disponibles:", notesError?.message);
    return null;
  }
}

// v3.13.42 — protocolo interno aprobado elegido por significado (no solo por palabras clave).
async function answerFromProceduresByMeaning({ question, socialWorkId, billingChannelId }) {
  try {
    const procedures = await listApplicableProcedures({ socialWorkId, billingChannelId, variant: resolvePlanVariant({ question, state: null, socialWorkId }) });
    if (!procedures.length) return null;
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions: buildProcedureSelectionInstructions(procedures),
      input: question,
      temperature: 0,
      max_output_tokens: 30,
    });
    const procedure = parseProcedureSelection(response.output_text, procedures);
    if (process.env.GDP_DEBUG_RETRIEVAL === "1") {
      console.log("[GDP_DEBUG_PROCEDURES]", JSON.stringify({ candidates: procedures.map((p) => p.code), model_output: response.output_text, picked: procedure?.code || null }));
    }
    return procedure
      ? { answer: formatProcedureAnswer(procedure), code: procedure.code, procedure_id: procedure.id, usage: response.usage || null }
      : null;
  } catch (procedureError) {
    console.warn("protocolos por significado no disponibles:", procedureError?.message);
    return null;
  }
}

// v3.13.22 — excepción de validador por sucursal (p. ej. OSECAC en DP1).
async function getBranchValidatorException({ branchId, branchCode, socialWorkId }) {
  try {
    if (!(branchId || branchCode) || !socialWorkId) return null;
    const base = supabaseAdmin.from("branches").select("id,name,code");
    const { data: branchRow } = await (branchId ? base.eq("id", branchId) : base.eq("code", branchCode)).maybeSingle();
    const socialWorkName = await getSocialWorkName(socialWorkId);
    if (!branchRow || !socialWorkName) return null;
    return describeBranchValidatorException({
      branchName: branchRow.name, branchCode: branchRow.code, socialWorkName,
    });
  } catch {
    return null;
  }
}

async function getSocialWorkName(
  socialWorkId
) {
  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(
        "social_works"
      )
      .select(
        "id,name"
      )
      .eq(
        "id",
        socialWorkId
      )
      .maybeSingle();

  if (
    error
  ) {
    console.error(
      "social work name lookup:",
      error.message
    );

    return null;
  }

  return (
    data?.name ||
    null
  );
}


// =========================================================
// RECORDÁ / FICHA
// =========================================================

function detectSocialWorkProfileIntent(
  question
) {
  const q =
    normalize(question);

  // La clase de validación (TYS / POR FUERA) no es el código TYS.
  // Se conserva la obra social seleccionada en el chat para repreguntas breves.
  const asksTysCode = containsAny(q, ["codigo tys", "código tys", "codigo de tys", "código de tys"]);
  // Preguntas por el NOMBRE del validador: Recordá/Ficha, no File Search.
  // La validación de circuitos y las contingencias mantienen su propio enrutamiento.
  const asksValidatorName = !asksTysCode && /\bvalidador(?:es)?\b/.test(q) &&
    /\b(?:como se llama|nombre del validador|nombre de validador|cual es el validador|cual validador|que validador|validador (?:usa|utiliza|tiene|de|para))\b/.test(q) &&
    !/\b(?:se cayo|no funciona|no anda|sin servicio|caido|caida|falla|error|rechaza|rechazo|circuito|camara|colegio)\b/.test(q);
  // GDPSoft v3.13.17: prioridades fijas de Ficha para nombre y medio de validación.
  // Sólo el nombre del validador y su medio (TYS, etc.) vienen de social_works.
  // "por dónde valida" y "por dónde valido" son consultas sobre la Ficha,
  // no direcciones físicas, documentación normativa ni circuitos de sucursal.
  const asksWhere = /\b(?:por donde (?:valido|valida|validamos|validan|validar|se valida)|donde (?:valido|valida|validamos|validan|validar|se valida)|en que (?:sistema|plataforma|medio) (?:se )?valida|tipo de validacion|medio de validacion|(?:se )?autoriza(?:n|mos)? (?:por|con|en|mediante) (?:gms|tys|que|donde|cual)|donde (?:se )?autoriza(?:n|mos)?)\b/.test(q);
  const isValidationProblem = /\b(?:se cayo|caido|caida|no funciona|no anda|falla|fallando|error|rechazo|rechaza|fuera de servicio|sin servicio|no puedo validar|no valida|no me valida)\b/.test(q);
  if (asksValidatorName && !asksWhere) {
    return { field: "validator_name", key: "VALIDATOR_NAME" };
  }
  // Sin dato cargado en Ficha: informar que falta, NUNCA ir a File Search.
  if (!asksTysCode && !isValidationProblem && (asksWhere || /\b(?:tys|gms)\b/.test(q) || containsAny(q, ["que validador", "qué validador"]))) {
    return { field: "validator_type", key: "VALIDATION_METHOD" };
  }

  // =====================================================
  // VIGENCIA DE RECETA
  // =====================================================

  const asksValidity =
    containsAny(
      q,
      [
        "vigencia",
        "validez",
        "vence",
        "vencimiento",
        "cuantos dias",
        "cuánto dura",
        "cuanto dura",
        "hasta cuando",
        "hasta cuándo",
      ]
    );

  const asksHistoricalValidity =
    containsAny(
      q,
      [
        "vigencia de la normativa",
        "vigencia normativa",
        "desde cuando esta vigente",
        "desde cuándo está vigente",
        "normativa vigente desde",
        "vigencia del convenio",
        "convenio vigente desde",
        "fecha de vigencia de la normativa",
      ]
    );

  if (
    asksValidity &&
    !asksHistoricalValidity
  ) {
    return {
      field:
        "recipe_validity_days",

      key:
        "RECIPE_VALIDITY_DAYS",
    };
  }

  // =====================================================
  // TIPO DE RECETA
  // =====================================================

  if (
    containsAny(
      q,
      [
        "tipo de receta",
        "que receta acepta",
        "qué receta acepta",
        "receta electronica",
        "receta electrónica",
        "receta digital",
        "receta manuscrita",
      ]
    )
  ) {
    return {
      field:
        "recipe_type",

      key:
        "RECIPE_TYPE",
    };
  }

  // =====================================================
  // MEMBRETE
  // =====================================================

  if (
    containsAny(
      q,
      [
        "membrete",
        "con membrete",
        "sin membrete",
        "necesita membrete",
        "requiere membrete",
      ]
    )
  ) {
    return {
      field:
        "letterhead",

      key:
        "LETTERHEAD",
    };
  }

  // =====================================================
  // RP
  // =====================================================

  if (
    /(^|\s)rp(\s|$)/.test(q) ||
    containsAny(
      q,
      [
        "cuantos rp",
        "cuántos rp",
        "cantidad de rp",
        "rp permite",
        "rp por receta",
        "maximo de rp",
        "máximo de rp",
      ]
    )
  ) {
    return {
      field: "rp",
      key: "RP",
    };
  }

  // =====================================================
  // DIAGNÓSTICO
  // =====================================================

  if (
    containsAny(
      q,
      [
        "diagnostico",
        "diagnóstico",
        "requiere diagnostico",
        "requiere diagnóstico",
        "necesita diagnostico",
        "necesita diagnóstico",
      ]
    )
  ) {
    return {
      field:
        "diagnosis",

      key:
        "DIAGNOSIS",
    };
  }

  // =====================================================
  // MONODROGA
  // =====================================================

  if (
    containsAny(
      q,
      [
        "monodroga",
        "nombre generico",
        "nombre genérico",
        "droga generica",
        "droga genérica",
      ]
    )
  ) {
    return {
      field:
        "monodrug",

      key:
        "MONODRUG",
    };
  }

  // =====================================================
  // NOMBRE COMERCIAL
  // =====================================================

  if (
    containsAny(
      q,
      [
        "nombre comercial",
        "marca comercial",
        "puede llevar marca",
        "puede poner marca",
        "marca del medicamento",
      ]
    )
  ) {
    return {
      field:
        "commercial_name",

      key:
        "COMMERCIAL_NAME",
    };
  }

  // =====================================================
  // SUSTITUCIÓN
  // =====================================================

  if (
    containsAny(
      q,
      [
        "sustitucion",
        "sustitución",
        "sustituir",
        "se puede sustituir",
        "puedo sustituir",
        "cambiar medicamento",
        "cambiar marca",
      ]
    )
  ) {
    return {
      field:
        "substitution",

      key:
        "SUBSTITUTION",
    };
  }

  // =====================================================
  // TYS
  // =====================================================

  if (
    containsAny(
      q,
      [
        "codigo tys",
        "código tys",
        "codigo de tys",
        "código de tys",
      ]
    )
  ) {
    return {
      field:
        "tys_code",

      key:
        "TYS_CODE",
    };
  }

  // =====================================================
  // OBSERVACIONES
  // =====================================================

  if (
    containsAny(
      q,
      [
        "observaciones",
        "alguna observacion",
        "alguna observación",
        "que tengo que recordar",
        "qué tengo que recordar",
      ]
    )
  ) {
    return {
      field:
        "observations",

      key:
        "OBSERVATIONS",
    };
  }

  return null;
}

// =========================================================
// FALLBACK DE FICHA HACIA NORMATIVA
// =========================================================

function buildProfileFallbackQuestion({
  intent,
  socialWorkName,
}) {
  const name =
    socialWorkName ||
    "la obra social";

  switch (intent?.key) {
    case "RECIPE_VALIDITY_DAYS":
      return (
        `¿Cuál es la vigencia de las recetas de ${name}? ` +
        `Responder el plazo contado desde la fecha de prescripción. ` +
        `No informar la fecha histórica de entrada en vigencia de la normativa o convenio.`
      );

    case "RECIPE_TYPE":
      return (
        `¿Qué tipos de receta acepta ${name}? ` +
        `Responder únicamente los tipos de receta admitidos.`
      );

    case "LETTERHEAD":
      return (
        `¿${name} exige membrete en la receta? ` +
        `Responder únicamente el requisito de membrete.`
      );

    case "RP":
      return (
        `¿Cuántos RP permite ${name} por receta? ` +
        `Responder únicamente la cantidad de RP permitida.`
      );

    case "DIAGNOSIS":
      return (
        `¿${name} exige diagnóstico en la receta? ` +
        `Responder únicamente si lo requiere, no lo requiere o es condicional.`
      );

    case "MONODRUG":
      return (
        `¿${name} exige monodroga o nombre genérico en la receta? ` +
        `Responder únicamente ese requisito.`
      );

    case "COMMERCIAL_NAME":
      return (
        `¿Qué exige ${name} respecto del nombre o marca comercial en la receta? ` +
        `Responder únicamente ese requisito.`
      );

    case "SUBSTITUTION":
      return (
        `¿Qué indica ${name} sobre sustitución o cambio de medicamento/marca? ` +
        `Responder únicamente esa regla.`
      );

    case "TYS_CODE":
      return (
        `¿Cuál es el código TYS de ${name}? ` +
        `Si la normativa no contiene ese dato, indicarlo.`
      );

    case "OBSERVATIONS":
      return (
        `¿Qué observaciones operativas importantes hay que recordar de ${name}?`
      );

    default:
      return null;
  }
}

async function querySocialWorkProfile({
  socialWorkId,
  intent,
  circuitGroup = null,
}) {
  const { data: baseData, error } = await supabaseAdmin
    .from("social_works")
    .select(`
      id,
      name,
      tys_code,
      validator_name,
      validator_type,
      recipe_type,
      recipe_validity_days,
      letterhead,
      rp,
      diagnosis,
      monodrug,
      commercial_name,
      substitution,
      observations,
      active
    `)
    .eq("id", socialWorkId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  // v3.13.76 — Ficha del circuito de la sucursal (Cámara / Colegio) sobre la base.
  const data = baseData
    ? (await withCircuitProfile(supabaseAdmin, baseData, circuitGroup)).data
    : baseData;

  if (!data) {
    return {
      found: false,
      answer: null,
      data: null,
    };
  }

  const value = data[intent.field];
  const hasValidator = Boolean(String(data.validator_name ?? "").trim());
  const hasMethod = Boolean(String(data.validator_type ?? "").trim());
  // Campos de validador: la Ficha es autoritativa aun cuando no esté completo el dato.
  // Una ausencia jamás habilita una búsqueda normativa como sustituto.
  const hasValidationInfo = ["VALIDATION_METHOD", "VALIDATOR_NAME"].includes(intent.key);

  if (
    !hasValidationInfo && (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
    )
  ) {
    return {
      found: false,
      answer: null,
      data,
    };
  }

  let answer = null;
  
const cleanValue =
  typeof value === "string"
    ? value.trim().replace(/\.+$/, "")
    : value;

  switch (intent.key) {
    case "RECIPE_VALIDITY_DAYS":
      answer = `La receta tiene una vigencia de ${value} días.`;
      break;

   case "RECIPE_TYPE":
  answer =
    `Tipo de receta: ${String(value).trim().replace(/\.+$/, "")}.`;
  break;

    case "LETTERHEAD":
      answer = `Membrete: ${value}.`;
      break;

    case "RP":
      answer = `Permite ${value} RP por receta.`;
      break;

    case "DIAGNOSIS":
      answer = `Diagnóstico: ${value}.`;
      break;

    case "MONODRUG":
      answer = `Monodroga: ${value}.`;
      break;

    case "COMMERCIAL_NAME":
      answer = `Nombre comercial: ${value}.`;
      break;

    case "SUBSTITUTION":
      answer = `Sustitución: ${value}.`;
      break;

    case "VALIDATOR_NAME":
      answer = hasValidator
        ? "El validador de " + data.name + " es " + String(data.validator_name).trim() + "." + (hasMethod ? "\nPor dónde valida: " + String(data.validator_type).trim() + "." : "")
        : "No hay un nombre de validador confirmado en Recordá/Ficha de " + data.name + ".";
      break;

    case "VALIDATION_METHOD": {
      // v3.13.76 — si la Ficha tiene validador (ej. IMED) pero no «por dónde valida», se responde con
      // el validador y las aclaraciones de validación/recepción de la propia Ficha (ej. «SOLO RECIBE SAN FRANCISCO»).
      const fichaNotes = hasValidator && !hasMethod && typeof data.observations === "string" && !isAccessInstruction(data.observations)
        ? data.observations.split(/(?<=[.!?])\s+/).map((x) => x.trim())
            .filter((x) => x && /\b(?:solo recibe|unica(?:mente)? recibe|valid\w*|credencial|circuito|factur\w*)\b/i.test(x.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
            .slice(0, 3)
        : [];
      answer = [
        hasMethod ? `Por dónde valida: ${String(data.validator_type).trim()}.` : (hasValidator ? null : "Por dónde valida: sin dato confirmado en Recordá/Ficha."),
        hasValidator ? `Validador: ${String(data.validator_name).trim()}.` : "Validador: sin dato confirmado en Ficha.",
        fichaNotes.length ? `Según la Ficha: ${fichaNotes.join(" ")}` : null,
        "Corroborá el plan y el circuito operativo de tu sucursal antes de realizar la validación. La ficha no autoriza por sí sola una receta."
      ].filter(Boolean).join("\n");
      break;
    }

    case "TYS_CODE":
      answer = `Código TYS: ${value}.`;
      break;

    case "OBSERVATIONS":
      answer = String(value).trim();
      break;

    default:
      return {
        found: false,
        answer: null,
        data,
      };
  }

  // Identificar la fuente exacta del dato estructurado frente a las contingencias internas.
  answer = `${answer}\n\nFuente: Recordá/Ficha de ${data.name}.`;
  // v3.13.49 — si la Ficha no tiene el dato de validación, se consulta la normativa antes de
  // responder «sin dato confirmado»; esa respuesta queda como último recurso.
  const incomplete =
    (intent.key === "VALIDATION_METHOD" && !hasMethod && !hasValidator) ||
    (intent.key === "VALIDATOR_NAME" && !hasValidator);
  return {
    found: true,
    incomplete,
    answer,
    data: {
      social_work_id: data.id,
      social_work_name: data.name,
      field: intent.field,
      key: intent.key,
      value,
    },
  };
}

function detectRuleIntent(

  question

) {

  const q =

    normalize(question);



  // -------------------------------------------------------

  // CRÓNICOS

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "cronicos",

        "cronico",

      ]

    ) &&

    containsAny(

      q,

      [

        "cubre",

        "cobertura",

        "porcentaje",

        "cuanto",

        "%",

        "descuento",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "COVERAGE_CHRONIC",

    };

  }



  // -------------------------------------------------------

  // PMI

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "pmi",

        "materno infantil",

        "plan maternal",

        "plan infantil",

      ]

    ) &&

    containsAny(

      q,

      [

        "cubre",

        "cobertura",

        "porcentaje",

        "cuanto",

        "%",

        "descuento",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "COVERAGE_PMI",

    };

  }



  // -------------------------------------------------------

  // CANTIDAD DE MEDICAMENTOS

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "medicamentos por receta",

        "medicamento por receta",

        "cuantos medicamentos",

        "cantidad de medicamentos",

        "maximo de medicamentos",

        "maximo medicamentos",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "MAX_MEDICATIONS_NORMAL",

    };

  }



  // -------------------------------------------------------

  // ENVASES POR RENGLÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "envases por renglon",

        "envase por renglon",

        "cuantos envases",

        "cantidad de envases",

        "maximo de envases",

        "maximo envases",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "MAX_PACKAGES_PER_LINE_NORMAL",

    };

  }



  // -------------------------------------------------------

  // REFACTURACIÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "refacturacion",

        "refacturar",

        "refacturo",

      ]

    ) &&

    containsAny(

      q,

      [

        "dias",

        "vigencia",

        "plazo",

        "cuanto",

        "tiempo",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "REINVOICE_VALIDITY",

    };

  }



  // -------------------------------------------------------

  // PRESENTACIÓN

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "presentacion",

        "presentar",

        "liquidacion",

      ]

    ) &&

    containsAny(

      q,

      [

        "dias",

        "vigencia",

        "plazo",

        "cuanto",

        "tiempo",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "PRESENTATION_VALIDITY",

    };

  }



  // -------------------------------------------------------

  // VIGENCIA DE RECETA

  // -------------------------------------------------------



  if (

    containsAny(

      q,

      [

        "vigencia",

        "vence",

        "vencimiento",

        "cuantos dias",

        "cuanto dura",

        "hasta cuando",

        "validez",

      ]

    ) &&

    containsAny(

      q,

      [

        "receta",

        "venta",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "RECIPE_VALIDITY_SALE",

    };

  }



  // -------------------------------------------------------

  // VALIDACIÓN ONLINE

  // -------------------------------------------------------



  /**

 * Importante:



 * "¿Cómo valido una receta?"

 * NO entra acá.



 * Eso es procedimiento y puede

 * necesitar normativa / RAG.



 * Sí entra:



 * "¿Hay que validar online?"

 * "¿La receta se valida online?"

 */



  if (

    containsAny(

      q,

      [

        "hay que validar online",

        "debe validar online",

        "debe validarse online",

        "se valida online",

        "validacion online obligatoria",

        "es obligatoria la validacion online",

        "validar online obligatorio",

      ]

    )

  ) {

    return {

      domain:

        "RULE",



      ruleKey:

        "ONLINE_VALIDATION",

    };

  }



  return null;

}



// =========================================================

// CONSULTAR CONTACTOS

// =========================================================



async function queryContacts({

  socialWorkId,

  contactType,

}) {

  let query =

    supabaseAdmin

      .from(

        "social_work_contacts"

      )

      .select(`

        id,

        contact_code,

        contact_type,

        label,

        phone,

        hours,

        purpose,

        notes,

        source_page,

        normative_id

      `)

      .eq(

        "social_work_id",

        socialWorkId

      )

      .eq(

        "is_current",

        true

      );



  if (

    contactType

  ) {

    query =

      query.eq(

        "contact_type",

        contactType

      );

  }



  const {

    data,

    error,

  } =

    await query.order(

      "label",

      {

        ascending: true,

      }

    );



  if (error) {

    throw new Error(

      error.message

    );

  }



  // -------------------------------------------------------

  // ATENCIÓN AL AFILIADO

  // -------------------------------------------------------



  if (

    contactType ===

      "AFFILIATE_SERVICE" &&

    (

      !data ||

      data.length === 0

    )

  ) {

    return {

      answer:

        "No encuentro un teléfono identificado específicamente como atención al afiliado.",



      data: [],



      found: false,

    };

  }



  if (

    !data ||

    data.length === 0

  ) {

    // Si la consulta de contacto es genérica, no respondemos
    // "no encuentro": primero pedimos qué circuito necesita.
    if (
      !contactType
    ) {
      return {
        answer:
          "¿Buscás un contacto para autorizaciones, validación o consultas de normativa?",

        data: [],

        found: true,

      };
    }

    return {

      answer:
        "No encuentro un contacto con esa función en la normativa vigente.",

      data: [],

      found: false,

    };

  }



  // -------------------------------------------------------

  // CONTACTO GENÉRICO

  // -------------------------------------------------------



  if (

    !contactType

  ) {

    return {

      answer:

        "Hay varios teléfonos con funciones distintas. ¿Necesitás autorizaciones, validación o consultas de normativa?",



      data,



      found: true,

    };

  }



  // -------------------------------------------------------

  // UNA COINCIDENCIA

  // -------------------------------------------------------



  if (

    data.length === 1

  ) {

    const contact =

      data[0];



    let answer =

      `${contact.label}: ${contact.phone}.`;



    if (

      contact.hours

    ) {

      answer +=

        ` ${contact.hours}.`;

    }



    return {

      answer,



      data,



      found: true,

    };

  }



  // -------------------------------------------------------

  // VARIAS COINCIDENCIAS

  // -------------------------------------------------------



  const lines =

    data.map(

      (contact) =>

        `- ${contact.label}: ${contact.phone}`

    );



  return {

    answer:

      lines.join("\n"),



    data,



    found: true,

  };

}



// =========================================================

// CONSULTAR REGLA

// =========================================================



async function queryRule({

  socialWorkId,

  ruleKey,

}) {

  const {

    data,

    error,

  } =

    await supabaseAdmin

      .from(

        "rules"

      )

      .select(`

        id,

        rule_key,

        category,

        content,

        value_text,

        value_json,

        answer_short,

        source_page,

        normative_id,

        billing_channel_id,

        approved,

        is_current,

        priority

      `)

      .eq(

        "social_work_id",

        socialWorkId

      )

      .eq(

        "rule_key",

        ruleKey

      )

      .eq(

        "approved",

        true

      )

      .eq(

        "is_current",

        true

      )

      .eq(

        "needs_review",

        false

      )

      .order(

        "priority",

        {

          ascending: true,

        }

      )

      .limit(1)

      .maybeSingle();



  if (error) {

    throw new Error(

      error.message

    );

  }



  if (!data) {

    return {

      found: false,

      answer: null,

      data: null,

    };

  }



  return {

    found: true,



    answer:

      data.answer_short ||

      data.content,



    data,

  };

}



function isInsufficientAnswer(answer = "") {
  const text = normalize(answer);

  if (!text) {
    return true;
  }

  const patterns = [
    "no encuentro informacion",
    "no encontre informacion",
    "no se encuentra informacion",
    "no aparece informacion",
    "no figura informacion",
    "no encuentro un dato",
    "no encontre un dato",
    "no encuentro ese dato",
    "no encontre ese dato",
    "no esta especificado",
    "no esta indicado",
    "no se especifica",
    "no se indica",
    "no consta",
    "no puedo determinar",
    "no puedo confirmar",
  ];

  // v3.13.42 — «No encuentro esa información en la normativa vigente» (y variantes)
  // también es una respuesta sin respaldo: habilita observaciones y protocolos.
  if (/\bno (?:encuentro|encontre|hallo|figura|aparece)\s+(?:esa|esta|la|dicha|ninguna|mas|ese|este|el)?\s*(?:informacion|normativa|dato|referencia|indicacion)/.test(text)) {
    return true;
  }

  return patterns.some((pattern) => text.includes(pattern));
}

// =========================================================

// OPENAI FILE SEARCH

// =========================================================



async function queryFileSearch({

  question,

  socialWorkId,

  normativeIds = null,

  maxResults = null,

  maxOutputTokens = null,
  forceDetailed = false,
  adminCorrections = "",
  userConstraints = "",
  branchCircuit = "",
}) {

  if (

    !process.env

      .OPENAI_VECTOR_STORE_ID

  ) {

    throw new Error(

      "Falta OPENAI_VECTOR_STORE_ID"

    );

  }



  const detailed = forceDetailed || Boolean(userConstraints) || wantsDetailedAnswer(question);

  const normalizedQuestionForPrecision =
    normalize(question);

  const precisionRequirement =
    containsAny(
      normalizedQuestionForPrecision,
      [
        "firma",
        "sello",
        "matricula",
        "membrete",
        "diagnostico",
        "monodroga",
        "nombre comercial",
        "sustitucion",
        "afiliado",
        "beneficiario",
      ]
    );



const baseInstructions =
  detailed
    ? `
Sos el asistente interno de normativas de Farmacias del Plata.

Respondé exclusivamente usando la normativa recuperada.
Para vacunas, insulinas, crónicos y otros planes especiales, considerá la normativa general y toda norma adicional vigente vinculada a ESTA obra social. Priorizá la norma específica del tema; si difieren, explicá el conflicto en vez de inventar.

El usuario pidió detalle, pero eso NO significa explicar todos los temas relacionados.

OBJETIVO:

Respondé exactamente sobre el tema solicitado.

REGLAS OBLIGATORIAS:

- No inventes información.
- No cambies el significado de los datos.
- Conservá exactamente porcentajes, cantidades, plazos y excepciones.
- No agregues información que no esté respaldada por la normativa.
- Evitá introducciones innecesarias.
- Usá listas cuando ayuden a leer requisitos.
- No mezcles temas diferentes aunque aparezcan juntos en el mismo documento.
- No vuelvas a explicar información que ya pertenece claramente a otro apartado.

REQUISITOS DE RECETA:

- Si pregunta "requisitos receta", respondé solamente qué debe contener o cumplir la receta.
- No agregues vigencia, cobertura, topes, presentación, validación, facturación, cierre o auditoría.
- La vigencia es un tema separado y sólo debe mencionarse si pregunta por vigencia, validez, duración o vencimiento.

PRESENTACIÓN DE RECETAS:

- Si pregunta por presentación, respondé únicamente cómo debe prepararse, ordenarse, adherirse o enviarse la documentación.
- No vuelvas a enumerar los requisitos generales que debe contener la receta.
- No agregues nuevamente nombre, afiliado, diagnóstico, fecha, firma, sello, etc., salvo que sean indispensables para una regla específica de presentación.

RECETAS ELECTRÓNICAS:

- Si pregunta específicamente por recetas electrónicas, respondé solamente el circuito y los requisitos específicos para recetas electrónicas.
- No repitas los requisitos generales de una receta.
- Explicá únicamente lo que la normativa indique sobre impresión, tickets, troqueles, documentación, cierre, envío, auditoría o validación de recetas electrónicas.
- Si la normativa indica que recetas electrónicas y manuscritas comparten un circuito, podés mencionarlo solamente cuando sea necesario.

VALIDACIÓN:

- Si pregunta cómo validar, respondé solamente sobre validación.
- No agregues presentación, facturación o auditoría salvo que sean indispensables para entender la validación.
- Si pregunta cómo se valida, respondé en este orden: (1) cómo se realiza (modalidades y pasos concretos) y (2) los requisitos para validar (datos que se cargan, documentación y condiciones que la normativa exige).

DATOS ESPECÍFICOS QUE NO FIGURAN (aplica a toda respuesta):

- Si el usuario pide un dato concreto (porcentaje, monto, plazo, lista de productos, nombre de un programa o producto) y el texto recuperado no lo indica, decí exactamente cuál no figura, por ejemplo «La normativa no indica el porcentaje de descuento ni qué productos entran».

- Si el usuario nombra un programa, producto o término que no aparece en el texto recuperado, decí que no aparece. No lo asocies con el programa que sí aparece.

- Nunca reemplaces el dato pedido por una descripción general ni lo deduzcas («los productos son los que indica la receta» no es un dato de la normativa salvo que el texto lo diga así). Después podés resumir en una oración lo que el texto sí indica sobre el tema.

ESTILO CONCRETO (aplica a toda respuesta):

- Cada paso es una acción: qué hacer, con qué dato y dónde. Sin explicaciones de ventajas.

- No incluyas descripciones evidentes ni promocionales («es un sistema sencillo e intuitivo», «requiere conexión a Internet», «es fácil de usar»). Mencioná un requisito técnico solo si distingue una modalidad de otra (por ejemplo «para quienes no tienen conexión»).

- No repitas la misma idea en pasos distintos.

COBERTURA Y TOPES:

- Si pregunta cobertura, respondé solamente la cobertura solicitada.
- Si pregunta topes, respondé solamente cantidades, renglones, envases o límites aplicables.
- No mezcles cobertura con requisitos generales salvo que sea estrictamente necesario.

AMPLIACIONES OPCIONALES:

Si existe otro tema útil relacionado, podés ofrecerlo al final con UNA sola pregunta corta.

Ejemplos:

"¿Querés que te muestre también los requisitos para la presentación de las recetas?"

"¿Querés que te detalle cómo se realiza la validación?"

"¿Querés que te muestre los controles de auditoría de las recetas electrónicas?"

"¿Querés que te muestre los topes y excepciones?"

REGLAS PARA LAS AMPLIACIONES:

- La ampliación debe ser sobre información nueva.
- No vuelvas a ofrecer el tema que acabás de explicar.
- No vuelvas a ofrecer el tema inmediatamente anterior.
- No generes ciclos entre temas.
- Si acabás de explicar presentación, no vuelvas a ofrecer presentación.
- Si acabás de explicar recetas electrónicas, no vuelvas a ofrecer requisitos generales de receta.
- Si acabás de explicar recetas electrónicas después de presentación, no vuelvas a ofrecer presentación.
- Elegí únicamente una ampliación que avance hacia información nueva.
- Si no existe una ampliación claramente útil, terminá la respuesta sin preguntar nada.

SI NO ENCONTRÁS LA RESPUESTA:

Respondé únicamente:

"No encuentro esa información en la normativa vigente."

No agregues preguntas opcionales en ese caso.
`
    : `
Sos el asistente interno de normativas de Farmacias del Plata.

Respondé exclusivamente usando la normativa recuperada.
Para vacunas, insulinas, crónicos y otros planes especiales, considerá la normativa general y toda norma adicional vigente vinculada a ESTA obra social. Priorizá la norma específica del tema; si difieren, explicá el conflicto en vez de inventar.

MODO RESPUESTA CORTA.

REGLAS OBLIGATORIAS:

- Respondé primero y únicamente lo que preguntó el usuario.
- Máximo 25 palabras para la respuesta principal, salvo preguntas sobre requisitos puntuales (firma, sello, matrícula, membrete, diagnóstico, monodroga, nombre comercial, sustitución, afiliado o beneficiario): en esos casos podés usar hasta 45 palabras si hace falta para conservar una distinción importante.
- Preferí una sola oración.
- Si la normativa distingue receta física/manuscrita de digital/electrónica para el requisito preguntado, DEBÉS conservar esa diferencia en la respuesta.
- No agregues requisitos distintos del que preguntó el usuario.
- No enumeres requisitos salvo que el usuario los haya pedido.
- No agregues datos relacionados si no fueron preguntados.
- No expliques el procedimiento completo.
- No repitas la pregunta.
- No uses introducciones como "Para validar..." o "Según la normativa...".
- No mezcles temas distintos.
- RESTRICCIONES CRÍTICAS: si la normativa establece que, para lo preguntado, algo NO se valida, NO se acepta, carece de validez, vence, o que solo es válido un documento o procedimiento específico, incluí esa condición aunque supere el límite de palabras (hasta 60 palabras en total). No la omitas por brevedad.

SEPARACIÓN DE TEMAS:

- Requisitos de receta, vigencia, presentación, validación, cobertura, topes, facturación, auditoría y recetas electrónicas son temas diferentes.
- Respondé solamente el tema solicitado.
- No agregues información de otro tema sólo porque aparece cerca en la normativa.

RECETAS ELECTRÓNICAS:

- Si pregunta específicamente por recetas electrónicas, no repitas requisitos generales de receta.
- Respondé solamente las reglas específicas de recetas electrónicas presentes en la normativa.

INFORMACIÓN RELACIONADA:

Si existe información adicional útil y diferente de lo preguntado, podés agregar UNA sola segunda línea ofreciendo mostrarla.

La pregunta debe ser específica.

Ejemplos:

"¿Querés que te muestre los requisitos?"

"¿Querés que te detalle la presentación?"

"¿Querés que te muestre las excepciones?"

REGLAS DE AMPLIACIÓN:

- No vuelvas a ofrecer el mismo tema que acabás de responder.
- No generes ciclos entre temas.
- La oferta debe avanzar hacia información nueva.
- Si no hay algo claramente útil para ampliar, no preguntes nada.

SEGURIDAD:

- No inventes información.
- No cambies el significado de los datos.
- Conservá exactamente porcentajes, cantidades, plazos y excepciones.
- Si el dato no aparece en la normativa, indicá que no lo encontrás.
- Si NO encontrás la respuesta solicitada, respondé únicamente:
  "No encuentro esa información en la normativa vigente."
- En ese caso NO hagas preguntas adicionales.
`;
  // v3.13.20 — repreguntas: la respuesta se amplía sobre el mismo tema.
  const followUpAddendum = `

REPREGUNTA SOBRE EL MISMO TEMA (esta sección tiene prioridad sobre las reglas de brevedad y sobre "respondé únicamente No encuentro"):

- La consulta incluye "Contexto de la consulta anterior". Usalo solo para saber de qué tema se trata.
- Respondé la repregunta ampliando lo que la normativa recuperada indique sobre ese tema: condiciones, restricciones, excepciones y pasos.
- Si la normativa no agrega nada sobre lo repreguntado, decilo en una oración y resumí brevemente lo que sí indica sobre el tema. No respondas solo "No encuentro esa información".
- No uses información de otra obra social ni de otro tema.
- No afirmes que algo se registra, valida o presenta en un sistema o lugar si el texto recuperado no lo dice. Si la normativa indica que algo NO se valida, NO se registra o NO se acepta, decilo de forma explícita.
`;
  const instructions =
    (forceDetailed ? baseInstructions + followUpAddendum : baseInstructions) +
    (adminCorrections || "") +
    (branchCircuit || "") +
    (userConstraints || "");



  const response =

    await openai.responses.create({

      model:

        process.env

          .OPENAI_MODEL ||

        "gpt-4.1-mini",



      store: false,



      max_output_tokens:

        maxOutputTokens || (detailed

          ? 600

          : precisionRequirement

            ? 180

            : 160),



      instructions,



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

            maxResults || (detailed ? 8 : 6),



          filters: Array.isArray(normativeIds) && normativeIds.length
          ? {type:"and", filters:[
              {type:"eq",key:"is_current",value:true},
              {type:"or", filters:normativeIds.map(id=>({type:"eq",key:"normative_id",value:Number(id)}))},
            ]}
          : {type:"and", filters:[
              {type:"or", filters:[
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

  // v3.13.20 — diagnóstico opcional: qué fragmentos recuperó File Search.
  // Se activa con GDP_DEBUG_RETRIEVAL=1; no cambia ninguna respuesta.
  if (process.env.GDP_DEBUG_RETRIEVAL === "1") {
    try {
      console.log("[GDP_DEBUG_RETRIEVAL]", JSON.stringify({
        question, socialWorkId, normativeIds, forceDetailed,
        results: (searchCall?.results || []).map((r) => ({
          file: r.filename,
          normative_id: r.attributes?.normative_id ?? null,
          score: r.score,
          text: String(r.text || "").replace(/\s+/g, " ").slice(0, 400),
        })),
      }, null, 2));
    } catch {
      // el diagnóstico nunca debe romper una consulta
    }
  }



  return {

    answer:

      userConstraints ? stripOfferLine(response.output_text) : response.output_text,



    usage:

      response.usage ||

      null,



    detailed,



    search: {

      queries:

        searchCall

          ?.queries ||

        [],



      results:

        (

          searchCall

            ?.results ||

          []

        ).map(

          (result) => ({

            file_id:

              result.file_id,



            filename:

              result.filename,



            score:

              result.score,



            text:

              result.text,



            attributes:

              result.attributes,

          })

        ),

    },



    response_id:

      response.id,

  };

}

// =========================================================
// DETECCIÓN AUTOMÁTICA DE OBRA SOCIAL EN LA PREGUNTA
// =========================================================


function containsWholePhrase(text, phrase) {
  if (!text || !phrase) {
    return false;
  }

  const paddedText = ` ${text} `;
  const paddedPhrase = ` ${phrase} `;

  return paddedText.includes(paddedPhrase);
}

// =========================================================
// DETECCIÓN AUTOMÁTICA DE OBRA SOCIAL
// =========================================================

async function detectSocialWorkFromQuestion(
  question
) {
  const cleanQuestion =
    String(
      question || ""
    ).trim();

  if (!cleanQuestion) {
    return {
      found:
        false,

      multiple:
        false,

      socialWork:
        null,

      matches:
        [],
    };
  }

  // =====================================================
  // OOSS ACTIVAS
  // =====================================================

  const {
    data:
      socialWorks,

    error:
      socialWorksError,
  } =
    await supabaseAdmin
      .from(
        "social_works"
      )
      .select(`
        id,
        name,
        active
      `)
      .eq(
        "active",
        true
      );

  if (
    socialWorksError
  ) {
    throw new Error(
      socialWorksError
        .message
    );
  }

  // =====================================================
  // ALIASES
  // =====================================================

  const {
    data:
      aliases,

    error:
      aliasesError,
  } =
    await supabaseAdmin
      .from(
        "social_work_aliases"
      )
      .select("*");

  if (
    aliasesError
  ) {
    console.error(
      "assistant query aliases:",
      aliasesError.message
    );
  }

  // =====================================================
  // DICCIONARIO CENTRALIZADO
  // =====================================================

  const dictionary =
    buildSocialWorkDictionary({
      socialWorks:
        socialWorks ||
        [],

      aliases:
        aliases ||
        [],
    });

  const matches =
    detectSocialWorks({
      text:
        cleanQuestion,

      dictionary,
    });
  const unresolvedName = unresolvedExplicitSocialWork({question:cleanQuestion,dictionary,matches});

  // =====================================================
  // SIN OOSS DETECTADA
  // =====================================================

  if (
    matches.length === 0
  ) {
    return {
      found:
        false,

      multiple:
        false,

      socialWork:
        null,

      matches:
        [],
      unresolvedName,
    };
  }

  // =====================================================
  // MÁS DE UNA OOSS
  // =====================================================

  if (
    matches.length > 1
  ) {
    return {
      found:
        false,

      multiple:
        true,

      socialWork:
        null,

      matches,
    };
  }

  // =====================================================
  // UNA OOSS
  // =====================================================

  return {
    found:
      true,

    multiple:
      false,

    socialWork:
      matches[0],

    matches,
    unresolvedName,
  };
}
// =========================================================

// ENDPOINT PRINCIPAL

// =========================================================



// v3.13.20 — envoltorio: carga el estado conversacional, delega en el motor
// existente y persiste el estado a partir de la respuesta final (cubre todas las rutas).
// Si la columna conversation_state no existe, todo se comporta como antes.
async function appendAdminObservation(json) {
  if (!json || json.ok !== true || json.found !== true || !json.answer) return null;
  if (json.route === "ADMIN_CORRECTION" || /\n\nObservación: /.test(json.answer)) return null;
  const socialWorkId = json.context?.social_work_id;
  if (!socialWorkId) return null;
  const observations = await loadSocialWorkObservations(supabaseAdmin, socialWorkId);
  const observationWorkName = observations.length ? await getSocialWorkName(socialWorkId) : "";
  const observation = findExactObservation(observations, normalizeQuestion(json.question), observationWorkName || "");
  return observation ? { ...json, answer: appendObservation(json.answer, observation) } : null;
}

const NOTE_SKIP_ROUTES = new Set([
  "BRANCH_VALIDATOR_EXCEPTION", "BRANCH_VALIDATION_GUIDE", "UNKNOWN_EXPLICIT_SOCIAL_WORK", "CLARIFICATION_NEEDED",
  "CHANNEL_CONFIRMED", "ADMIN_CORRECTION", "NORMATIVE_SCOPE_UNVERIFIED",
]);
async function appendBranchValidatorNote(json, rawQuestion) {
  if (!json || json.ok !== true || json.found !== true || !json.answer) return null;
  if (NOTE_SKIP_ROUTES.has(json.route) || /SUC:/.test(json.answer)) return null;
  if (!/\b(?:tramit\w*|valid\w*|gestion\w*)\b/i.test(String(rawQuestion || ""))) return null;
  const ctx = json.context || {};
  const exception = await getBranchValidatorException({
    branchId: ctx.branch_id, branchCode: null, socialWorkId: ctx.social_work_id,
  });
  const note = formatBranchValidatorNote(exception);
  return note ? { ...json, answer: `${json.answer}\n\n${note}` } : null;
}

// v3.13.79 — observación aprobada que coincide con la consulta: se agrega textual, sin resumir.
async function appendMatchingNotes(json, rawQuestion) {
  if (!json || json.ok !== true || json.found !== true || !json.answer) return null;
  if (/NOTES|ADMIN_CORRECTION/.test(`${json.source || ""} ${json.route || ""}`) || /Observación operativa aprobada/.test(json.answer)) return null;
  const socialWorkId = json.context?.social_work_id;
  if (!socialWorkId) return null;
  const variant = resolvePlanVariant({ question: rawQuestion, state: null, socialWorkId });
  const notes = await loadApprovedNotes(supabaseAdmin, socialWorkId, variant);
  if (!notes.length) return null;
  const matches = findMatchingNotes(notes, rawQuestion, await getSocialWorkName(socialWorkId));
  if (!matches.length) return null;
  const text = matches.map((n) => n.trim()).join("\n\n");
  // Si la respuesta de la normativa/protocolo no nombra el tema pedido (ej. Ozempic), la observación va sola.
  const answerFold = String(json.answer).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const relevant = distinctiveTokens(rawQuestion, await getSocialWorkName(socialWorkId))
    .some((w) => answerFold.includes(w.slice(0, Math.max(4, w.length - 2))));
  const header = "Observación operativa aprobada por Administración:";
  return { ...json, answer: relevant ? `${json.answer}\n\n${header}\n${text}` : `${header}\n${text}` };
}

export async function POST(request) {
  let conversationState = null;
  let rawQuestion = "";
  let wrapperConversationId = null;
  try {
    const peek = await request.clone().json();
    wrapperConversationId = peek?.conversationId ? String(peek.conversationId).trim() : null;
    rawQuestion = String(peek?.question || "").trim();
    conversationState = await loadConversationState(supabaseAdmin, wrapperConversationId);
  } catch {
    // El motor valida el cuerpo y devuelve el error correspondiente.
  }
  let response = await handleAssistantQuery(request, { conversationState });
  // v3.13.22 — consultas de trámite/validación: si la sucursal tiene una excepción
  // de validador para esa obra social, se aclara aunque la respuesta venga de la normativa.
  try {
    const original = await response.clone().json();
    const noted = await appendBranchValidatorNote(original, rawQuestion);
    if (noted) response = Response.json(noted, { status: response.status });
    // v3.13.28 — observación del administrador sobre una respuesta Correcta:
    // se agrega debajo, sin modificar la respuesta del bot.
    const withObservation = await appendAdminObservation(noted || original);
    if (withObservation) response = Response.json(withObservation, { status: response.status });
    const withNotes = await appendMatchingNotes(withObservation || noted || original, rawQuestion);
    if (withNotes) response = Response.json(withNotes, { status: response.status });
  } catch {
    // la aclaración es opcional: nunca debe romper la respuesta
  }
  if (wrapperConversationId) {
    try {
      const json = await response.clone().json();
      const next = buildNextState({ prev: conversationState, rawQuestion, json });
      if (next) await saveConversationState(supabaseAdmin, wrapperConversationId, next);
    } catch (stateError) {
      console.warn("conversation_state no persistido:", stateError?.message);
    }
  }
  // v3.13.69 — mismo diseño (pestañas) para toda respuesta larga de la normativa.
  // Va después de guardar el estado: la conversación sigue usando el texto original.
  // v3.13.71 — toda respuesta con obra social incluye su nombre (el chip del chat no muestra «Obra Social 130»).
  try {
    const finalJson = await response.clone().json();
    if (finalJson?.ok === true) {
      const swId = Number(finalJson.context?.social_work_id);
      let swName = finalJson.social_work?.name || null;
      if (!swName && Number.isInteger(swId) && swId > 0) {
        const { data: sw } = await supabaseAdmin.from("social_works").select("name").eq("id", swId).maybeSingle();
        swName = sw?.name || null;
      }
      let next = finalJson;
      if (swName && !finalJson.social_work?.name) next = { ...next, social_work: { ...(finalJson.social_work || {}), id: swId, name: swName } };
      if (finalJson.found === true && typeof finalJson.answer === "string" &&
          /FILE_SEARCH|NORMATIVE|ADMIN_CORRECTION/.test(String(finalJson.source || ""))) {
        const branch = Number(finalJson.context?.branch_id);
        const group = Number.isInteger(branch) && branch > 0 ? await resolveBranchGroup(supabaseAdmin, branch) : null;
        const sectioned = buildSectionedAnswer({
          answer: finalJson.answer, title: swName,
          circuitLabel: group === "CAMARA" ? "Cámara" : group === "COLEGIO" ? "Colegio" : null,
        });
        if (sectioned) next = { ...next, answer: sectioned, answer_plain: finalJson.answer };
      }
      if (next !== finalJson) response = Response.json(next, { status: response.status });
    }
  } catch {
    // el formato y el nombre son solo de presentación: nunca deben romper la respuesta
  }
  return response;
}

async function handleAssistantQuery(request, { conversationState = null } = {}) {
  const startedAt = Date.now();
  try {
    const body = await request.json();

    // Solo una sesión real de Sucursal puede marcar tráfico PILOT.
    // Las baterías técnicas sin token de sucursal no ingresan a la cola Admin.
    let verifiedPilotBranch = null;
    // v3.13.21 — las consultas del administrador se registran como ADMIN
    // (visibles en Validación de respuestas, fuera de las métricas del piloto).
    let verifiedAdmin = false;
    try {
      const auth = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
      if (auth) {
        const session = await supabaseAdmin.auth.getUser(auth[1]);
        if (session?.data?.user?.id) {
          const profileResult = await supabaseAdmin.from("profiles")
            .select("role,branch_id,active,is_super_admin").eq("id", session.data.user.id).maybeSingle();
          const profile = profileResult.data;
          if (!profileResult.error && profile?.active === true && profile?.role === "SUCURSAL") {
            verifiedPilotBranch = Number(profile.branch_id) || null;
          } else if (!profileResult.error && profile?.active === true &&
            (profile?.is_super_admin === true ||
              ["ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(String(profile?.role || "").toUpperCase()))) {
            verifiedAdmin = true;
          }
        }
      }
    } catch (err) {
      console.warn("No se pudo clasificar tráfico de sucursal:", err?.message);
    }
    const logCurrentQuery = (payload) => logAssistantQuery({
      ...payload,
      deviceId: verifiedPilotBranch && Number(payload.branchId) === verifiedPilotBranch ? deviceId : null,
      trafficType: verifiedPilotBranch && Number(payload.branchId) === verifiedPilotBranch
        ? "PILOT"
        : verifiedAdmin ? "ADMIN" : "OTHER",
    });

    // v3.13.59 — circuito (Cámara/Colegio) de la sucursal que consulta: se resuelve
    // una vez por consulta y se usa en normativa, protocolos y prompt.
    const branchCircuitMemo = new Map();
    const getBranchCircuit = async () => {
      const key = `${Number(branchId) || 0}:${Number(socialWorkId) || 0}`;
      if (!Number(branchId)) return { group: null, channelId: null };
      if (!branchCircuitMemo.has(key)) {
        let value = { group: null, channelId: null };
        try {
          const group = await resolveBranchGroup(supabaseAdmin, Number(branchId));
          const channelId = group
            ? ((await resolveBranchBillingChannelId(supabaseAdmin, Number(branchId))) ||
               (await resolveBranchChannelAmongLinked(supabaseAdmin, Number(branchId), socialWorkId)))
            : null;
          value = { group, channelId };
        } catch {
          value = { group: null, channelId: null };
        }
        branchCircuitMemo.set(key, value);
      }
      return branchCircuitMemo.get(key);
    };



    // =====================================================

    // INPUT

    // =====================================================



    let question = String(body.question || "").trim();



    const conversationId = body.conversationId

      ? String(body.conversationId).trim()

      : null;



    /**

 * * Compatibilidad temporal.

 * *

 * * Mientras conectamos FloatingAssistant,

 * * seguimos aceptando socialWorkId,

 * * branchId y branchCode directamente.

 * *

 * * Si viene conversationId,

 * * la conversación tiene prioridad absoluta.

 */

    let socialWorkId =

      body.socialWorkId != null

        ? Number(body.socialWorkId)

        : null;



    let branchId =

      body.branchId != null

        ? Number(body.branchId)

        : null;



    let branchCode = body.branchCode

      ? String(body.branchCode).trim()

      : null;



    let deviceId = null;



    let activeBillingChannelId = null;



    let conversationUserId = null;



    // =====================================================

    // VALIDAR PREGUNTA

    // =====================================================



    if (!question) {

      return Response.json(

        {

          ok: false,

          error: "Falta question",

          code: "QUESTION_REQUIRED",

        },

        {

          status: 400,

        }

      );

    }



    // =====================================================

    // CONTEXTO DE CONVERSACIÓN

    // =====================================================



    if (conversationId) {

      const {

        data: conversation,

        error: conversationError,

      } = await supabaseAdmin

        .from("conversations")

        .select(`

          id,

          user_id,

          branch_id,

          device_id,

          active_social_work_id,

          active_billing_channel_id,

          created_at,

          updated_at,

          closed_at

        `)

        .eq("id", conversationId)

        .maybeSingle();



      if (conversationError) {

        console.error(

          "assistant conversation lookup error:",

          conversationError.message

        );



        return Response.json(

          {

            ok: false,

            error:

              "No se pudo cargar la conversación",

            code:

              "CONVERSATION_LOOKUP_ERROR",

          },

          {

            status: 500,

          }

        );

      }



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



      if (conversation.closed_at) {

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



      /**

 * * IMPORTANTE:

 * *

 * * A partir de acá NO confiamos en

 * * branchId/socialWorkId enviados por frontend.

 * *

 * * El contexto real sale de conversations.

 */

      conversationUserId =

        conversation.user_id;



      branchId =

        conversation.branch_id;



      deviceId =

        conversation.device_id;



      socialWorkId =

        conversation.active_social_work_id;



      activeBillingChannelId =

        conversation.active_billing_channel_id;

      // v3.13.30 — «Sí» / «OSTES» tras «¿Quizás quisiste consultar por OSTES?»:
      // se continúa la consulta original con la obra social corregida.
      if (isSuggestionConfirmation(question, conversationState)) {
        question = applySuggestion(conversationState.pending);
      }
      // v3.13.60 — elección entre varias obras sociales con el mismo nombre parcial.
      const chosenSocialWork = pickPendingSocialWork(question, conversationState);
      if (chosenSocialWork) {
        question = applySuggestion({
          question: conversationState.pending.question,
          unresolved: conversationState.pending.unresolved,
          name: chosenSocialWork,
        });
      }

      // v3.13.20 — respuesta a «¿Cámara o Colegio?»: continúa la pregunta original.
      const channelReply =
        conversationState?.pending?.kind === "NEEDS_CHANNEL" && isFreshState(conversationState)
          ? detectChannelReply(question)
          : null;
      if (channelReply) {
        const channelId = await resolveChannelIdForGroup(supabaseAdmin, channelReply);
        if (channelId) {
          const { error: channelUpdateError } = await supabaseAdmin
            .from("conversations")
            .update({ active_billing_channel_id: channelId, updated_at: new Date().toISOString() })
            .eq("id", conversationId);
          if (!channelUpdateError) {
            activeBillingChannelId = channelId;
            const pendingQuestion = pendingRealQuestion(conversationState);
            if (pendingQuestion) {
              question = pendingQuestion;
            } else {
              const answer = `Perfecto, tomo la normativa de ${channelReply === "CAMARA" ? "Cámara" : "Colegio"}. ¿Qué necesitás saber? Por ejemplo: requisitos de receta, validación, autorizaciones o facturación.`;
              const elapsedMs = Date.now() - startedAt;
              const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
              await logCurrentQuery({ branchId, socialWorkId, question, answer,
                source: "GDP_CONVERSATION", route: "CHANNEL_CONFIRMED", found: true, elapsedMs, usage });
              return Response.json({ ok: true, question, answer, source: "GDP_CONVERSATION",
                route: "CHANNEL_CONFIRMED", found: true,
                context: { conversation_id: conversationId, branch_id: branchId,
                  device_id: deviceId, social_work_id: socialWorkId },
                elapsed_ms: elapsedMs, usage });
            }
          }
        }
      }



      branchCode = null;



      /**

 * * Marcamos actividad.

 * *

 * * Si falla este UPDATE no frenamos

 * * una consulta válida.

 */

      const {

        error: touchConversationError,

      } = await supabaseAdmin

        .from("conversations")

        .update({

          updated_at:

            new Date().toISOString(),

        })

        .eq(

          "id",

          conversationId

        );



      if (touchConversationError) {

        console.error(

          "assistant conversation touch error:",

          touchConversationError.message

        );

      }

    }

// =====================================================
// DETECTAR OOSS NOMBRADA EN LA PREGUNTA
// =====================================================

if (conversationId) {
  const detectedSocialWork =
    await detectSocialWorkFromQuestion(
      question
    );

  // Si hay sigla explícita desconocida, bloquear el fallback a la OOSS previa.
  if (detectedSocialWork.unresolvedName && !isSocialWorkStatusQuestion(question)) {
    const name = detectedSocialWork.unresolvedName;
    // v3.13.30 — «¿Quisiste decir…?»: se ofrece la obra social más parecida.
    let suggestions = [];
    try {
      const { data: activeWorks } = await supabaseAdmin.from("social_works").select("name").eq("active", true);
      suggestions = suggestSocialWorks(name, (activeWorks || []).map((w) => w.name));
    } catch {
      suggestions = [];
    }
    const answer = buildSuggestionAnswer(name, suggestions) ||
      `No pude identificar ${name} en las obras sociales activas de GDPSoft. Confirmá cómo figura en el listado; no voy a utilizar la Ficha de otra obra social.`;
    const elapsedMs = Date.now()-startedAt;
    await logCurrentQuery({branchId,socialWorkId,question,answer,source:"SOCIAL_WORK_IDENTITY",route:"UNKNOWN_EXPLICIT_SOCIAL_WORK",found:false,elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
    return Response.json({ok:true,question,answer,source:"SOCIAL_WORK_IDENTITY",route:"UNKNOWN_EXPLICIT_SOCIAL_WORK",found:false,
      ...(suggestions.length ? { suggestion: { unresolved: name, name: suggestions[0], options: suggestions } } : {}),
      elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
  }
  // ---------------------------------------------------
  // MÁS DE UNA OOSS EN LA MISMA CONSULTA
  // ---------------------------------------------------

  if (
    detectedSocialWork.multiple
  ) {
    const ambiguousOnly = detectedSocialWork.matches.every((item) => item.source === "AMBIGUOUS_TOKEN");
    // v3.13.65 — si la obra social activa es una de las posibles y las otras solo coinciden
    // por una palabra suelta (no por su nombre completo), se mantiene sin preguntar.
    const activeAmongMatches = detectedSocialWork.matches.some((item) => Number(item.id) === Number(socialWorkId)) &&
      !detectedSocialWork.matches.some((item) => Number(item.id) !== Number(socialWorkId) && item.source === "NAME");
    // Si la obra social activa es una de las posibles, se mantiene (sin preguntar).
    if (!activeAmongMatches) {
      const options = detectedSocialWork.matches.map((item) => item.name).slice(0, 5);
      const unresolvedWord = ambiguousOnly ? (detectedSocialWork.matches[0].match || "").toUpperCase() : "";
      const answer = `Encontré más de una obra social que coincide${unresolvedWord ? ` con «${unresolvedWord}»` : ""}: ${options.join(", ")}. ¿A cuál te referís? Indicame el nombre y sigo con tu consulta.`;
      const elapsedMs = Date.now() - startedAt;
      const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      await logCurrentQuery({ branchId, socialWorkId, question, answer,
        source: "SOCIAL_WORK_IDENTITY", route: "AMBIGUOUS_SOCIAL_WORK", found: false, elapsedMs, usage });
      return Response.json({ ok: true, question, answer, source: "SOCIAL_WORK_IDENTITY",
        route: "AMBIGUOUS_SOCIAL_WORK", found: false,
        suggestion: { unresolved: unresolvedWord, options },
        context: { conversation_id: conversationId, branch_id: branchId, device_id: deviceId, social_work_id: socialWorkId },
        elapsed_ms: elapsedMs, usage });
    }
  }

  // ---------------------------------------------------
  // CAMBIAR OOSS ACTIVA
  // ---------------------------------------------------

  if (
    detectedSocialWork.found &&
    detectedSocialWork.socialWork
  ) {
    const detectedId =
      Number(
        detectedSocialWork.socialWork.id
      );

    /*
     * Sólo actualizamos si realmente cambió.
     */
    if (
      detectedId !==
      Number(socialWorkId)
    ) {
      const {
        error:
          updateSocialWorkError,
      } = await supabaseAdmin
        .from("conversations")
        .update({
          active_social_work_id:
            detectedId,

          /*
           * Al cambiar de OOSS,
           * limpiamos canal de facturación
           * para evitar arrastrar contexto.
           */
          active_billing_channel_id:
            null,

          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          conversationId
        );

      if (
        updateSocialWorkError
      ) {
        console.error(
          "assistant auto social work update error:",
          updateSocialWorkError.message
        );

        return Response.json(
          {
            ok: false,

            error:
              "No se pudo cambiar la obra social activa",

            code:
              "SOCIAL_WORK_CONTEXT_UPDATE_ERROR",
          },
          {
            status: 500,
          }
        );
      }
    }

    socialWorkId =
      detectedId;

    activeBillingChannelId =
      null;
  }
}

    // =====================================================

    // VALIDAR OOSS ACTIVA

    // =====================================================



    if (

      !isGeneralBranchCircuitQuestion(question) && (
        !isSocialWorkStatusQuestion(question) && (
          !Number.isInteger(socialWorkId) || socialWorkId <= 0
        )
      )

    ) {

      return Response.json(

        {

          ok: false,



          error:

            conversationId
            ? "Indicame la obra social que querés consultar."
            : "socialWorkId inválido",



          code:

            conversationId

              ? "SOCIAL_WORK_REQUIRED"

              : "INVALID_SOCIAL_WORK",

        },

        {

          status: 400,

        }

      );

    }



    // =====================================================

    // CONTEXTO DE RESPUESTA

    // =====================================================



    /**

 * * Lo incluimos por ahora para depuración.

 * *

 * * Después podemos ocultarlo en producción

 * * si no queremos devolver contexto interno.

 */

    const responseContext = {

      conversation_id:

        conversationId,



      branch_id:

        branchId,



      device_id:

        deviceId,



      social_work_id:

        socialWorkId,



      billing_channel_id:

        activeBillingChannelId,



      user_id:

        conversationUserId,

    };

    // v3.13.52 — gracias / saludos / despedidas: se responde cortesía sin
    // consultar normativas ni arrastrar la respuesta anterior.
    {
      const courtesyKind = classifyCourtesy(question);
      if (courtesyKind) {
        const answer = buildCourtesyAnswer(courtesyKind);
        const elapsedMs = Date.now() - startedAt;
        const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        await logCurrentQuery({ branchId, socialWorkId, question, answer,
          source: "GDP_CONVERSATION", route: "COURTESY", found: true, elapsedMs, usage });
        return Response.json({ ok: true, question, answer, source: "GDP_CONVERSATION",
          route: "COURTESY", found: true, context: responseContext,
          elapsed_ms: elapsedMs, usage });
      }
    }

    // v3.13.20 — mensaje que solo nombra la obra social: preguntar qué necesita
    // en lugar de buscar el nombre en las normativas.
    if (conversationId && Number.isInteger(socialWorkId) && socialWorkId > 0 &&
        !resolveFollowUp({ question, state: conversationState, socialWorkId }).isFollowUp) {
      const activeSocialWorkName = await getSocialWorkName(socialWorkId);
      if (activeSocialWorkName && isBareSocialWorkMention(question, activeSocialWorkName)) {
        const answer = buildBareMentionAnswer(activeSocialWorkName);
        const elapsedMs = Date.now() - startedAt;
        const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        await logCurrentQuery({ branchId, socialWorkId, question, answer,
          source: "GDP_CONVERSATION", route: "CLARIFICATION_NEEDED", found: false, elapsedMs, usage });
        return Response.json({ ok: true, question, answer, source: "GDP_CONVERSATION",
          route: "CLARIFICATION_NEEDED", found: false, context: responseContext,
          elapsed_ms: elapsedMs, usage });
      }
    }

    // v3.13.21 — correcciones aprobadas por el administrador (Validación de
    // respuestas). Misma obra social + misma pregunta => se responde con el
    // texto aprobado. Si no coincide exacto, se pasan al prompt como contexto.
    let adminCorrections = [];
    if (Number.isInteger(socialWorkId) && socialWorkId > 0) {
      adminCorrections = await loadSocialWorkCorrections(supabaseAdmin, socialWorkId);
      // v3.13.77 — las correcciones de una sucursal de Cámara no se aplican a Colegio (obras sociales con dos circuitos).
      adminCorrections = await restrictCorrectionsToCircuit(supabaseAdmin, adminCorrections, socialWorkId, (await getBranchCircuit()).group);
      const correctionWorkName = adminCorrections.length ? await getSocialWorkName(socialWorkId) : "";
      const exactCorrection = findExactCorrection(adminCorrections, normalizeQuestion(question), correctionWorkName || "");
      if (exactCorrection) {
        const answer = exactCorrection.suggested;
        const elapsedMs = Date.now() - startedAt;
        const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        await logCurrentQuery({ branchId, socialWorkId, question, answer,
          source: "ADMIN_CORRECTION", route: "ADMIN_CORRECTION", found: true, elapsedMs, usage });
        return Response.json({ ok: true, question, answer, source: "ADMIN_CORRECTION",
          route: "ADMIN_CORRECTION", found: true, context: responseContext,
          elapsed_ms: elapsedMs, usage });
      }
    }

    // v3.13.37 — usuarios y claves: están cifrados, el bot no los ve ni los dice.
    // Los correos registrados en observaciones aprobadas sí se informan.
    if (Number.isInteger(socialWorkId) && socialWorkId > 0 && isCredentialQuestion(question)) {
      const credentialWorkName = await getSocialWorkName(socialWorkId);
      const { count: accessCount } = await supabaseAdmin.from("social_work_notes")
        .select("id", { count: "exact", head: true })
        .eq("social_work_id", socialWorkId).eq("kind", "ACCESS");
      const credentialEmails = extractEmails(await loadApprovedNotes(supabaseAdmin, socialWorkId));
      const credentialAnswer = buildCredentialAnswer({
        socialWorkName: credentialWorkName, hasAccessNotes: (accessCount || 0) > 0, emails: credentialEmails,
      });
      const elapsedMs = Date.now() - startedAt;
      const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      await logCurrentQuery({ branchId, socialWorkId, question, answer: credentialAnswer,
        source: "SOCIAL_WORK_NOTES", route: "CREDENTIALS_PROTECTED", found: true, elapsedMs, usage });
      return Response.json({ ok: true, question, answer: credentialAnswer, source: "SOCIAL_WORK_NOTES",
        route: "CREDENTIALS_PROTECTED", found: true, context: responseContext, elapsed_ms: elapsedMs, usage });
    }

    // v3.13.22 — validador externo por sucursal (p. ej. OSECAC en DP1 → San Francisco).
    // La sucursal que consulta (autenticada) manda: se responde primero con su circuito.
    if ((branchId || branchCode) && !isSocialWorkStatusQuestion(question)) {
      const questionWords = String(question).trim().split(/\s+/).length;
      const candidateIds = [];
      // «¿Por San Francisco?» puede confundirse con otra obra social: se prueba primero
      // la obra social de la conversación en curso.
      if (questionWords <= 6 && isFreshState(conversationState) && conversationState.social_work_id) {
        candidateIds.push(Number(conversationState.social_work_id));
      }
      if (Number.isInteger(socialWorkId) && socialWorkId > 0) candidateIds.push(Number(socialWorkId));
      for (const candidateId of [...new Set(candidateIds)]) {
        const validatorException = await getBranchValidatorException({ branchId, branchCode, socialWorkId: candidateId });
        if (!validatorException) continue;
        let routeName = null;
        let exceptionAnswer = null;
        if (questionWords <= 8) {
          exceptionAnswer = answerValidatorChallenge(validatorException, question);
          if (exceptionAnswer) routeName = "BRANCH_VALIDATOR_EXCEPTION";
        }
        if (!exceptionAnswer && questionWords <= 12 &&
            /\b(?:valid\w*|tramit\w*|gestion\w*)\b/i.test(question) &&
            !/\b(?:requisit\w*|paso\w*|vencid\w*|plazo\w*|formulario\w*|autoriz\w*|cobertura|descuento\w*|factur\w*|dias)\b/i.test(question) &&
            candidateId === Number(socialWorkId)) {
          const ficha = await querySocialWorkProfile({
            socialWorkId: candidateId,
            intent: { field: "validator_type", key: "VALIDATION_METHOD" },
            circuitGroup: (await getBranchCircuit()).group,
          });
          exceptionAnswer = [
            formatBranchValidatorNote(validatorException),
            ficha?.found ? ficha.answer : null,
            "¿Querés que te muestre los pasos para validar o los requisitos?",
          ].filter(Boolean).join("\n\n");
          routeName = "BRANCH_VALIDATION_GUIDE";
        }
        if (!exceptionAnswer) continue;
        const elapsedMs = Date.now() - startedAt;
        const usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
        await logCurrentQuery({ branchId, socialWorkId: candidateId, question, answer: exceptionAnswer,
          source: "GDP_OPERATION_PROCEDURE", route: routeName, found: true, elapsedMs, usage });
        return Response.json({ ok: true, question, answer: exceptionAnswer,
          source: "GDP_OPERATION_PROCEDURE", route: routeName, found: true,
          context: { ...responseContext, social_work_id: candidateId },
          elapsed_ms: elapsedMs, usage });
      }
    }

    // El chip «Activa» del listado y Recordá/Ficha usan social_works.active.
    // Resolver consultas de estado directamente desde Supabase y SIN OpenAI.
    // No modificar la OOSS activa del chat cuando se consulta otra por nombre.
    if (isSocialWorkStatusQuestion(question)) {
      const {data: statusWorks, error: statusError} = await supabaseAdmin
        .from("social_works").select("id,name,active");
      if (statusError) throw new Error(statusError.message);
      const {data: statusAliases, error: statusAliasesError} = await supabaseAdmin
        .from("social_work_aliases").select("*");
      if (statusAliasesError) console.error("social work status aliases:", statusAliasesError.message);
      const dictionary = buildSocialWorkDictionary({
        socialWorks: statusWorks || [], aliases: statusAliasesError ? [] : (statusAliases || []),
      });
      const matches = detectSocialWorks({text:question, dictionary});
      const namedWork = matches.length === 1
        ? (statusWorks || []).find(item => Number(item.id) === Number(matches[0].id))
        : null;
      const contextWork = !matches.length && !hasExplicitStatusSubject(question)
        ? (statusWorks || []).find(item => Number(item.id) === Number(socialWorkId))
        : null;
      const targetWork = namedWork || contextWork || null;
      const answer = matches.length > 1
        ? "Hay más de una obra social posible. Indicame su nombre completo para verificar el estado."
        : targetWork ? formatSocialWorkStatus(targetWork)
        : hasExplicitStatusSubject(question)
          ? "No encontré una obra social con ese nombre en GDPSoft. Confirmá cómo figura en el listado."
          : "Indicame de qué obra social querés consultar el estado.";
      const found = Boolean(targetWork && typeof targetWork.active === "boolean");
      const elapsedMs = Date.now() - startedAt;
      await logCurrentQuery({branchId, socialWorkId: targetWork?.id || socialWorkId, question, answer,
        source:"SOCIAL_WORK_PROFILE", route:"STRUCTURED_SOCIAL_WORK_STATUS",
        found, elapsedMs, usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
      return Response.json({ok:true,question,answer,found,source:"SOCIAL_WORK_PROFILE",
        route:"STRUCTURED_SOCIAL_WORK_STATUS",context:responseContext,elapsed_ms:elapsedMs,
        structured_data:targetWork ? {social_work_id:targetWork.id,active:targetWork.active} : null,
        usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
    }

    // =====================================================

    // PROCEDIMIENTO INTERNO APROBADO (PRIORITARIO ANTES DE FAQ Y CACHE)
    // 4.5 PROCEDIMIENTOS INTERNOS GDP (solo aprobados y vigentes)
    // Fallos operativos: OOSS, circuito y autorizaciones explícitas.
    const internalProcedure = isImmediateOperationalContingency(question)
      ? await resolveInternalProcedure({ question, socialWorkId, billingChannelId: activeBillingChannelId || (await getBranchCircuit()).channelId })
      : null;
    if (internalProcedure) {
      const elapsedMs = Date.now() - startedAt;
      await logCurrentQuery({
        branchId, socialWorkId, question,
        answer: internalProcedure.answer,
        source: "GDP_INTERNAL_PROCEDURE",
        route: "APPROVED_INTERNAL_PROCEDURE",
        found: true, elapsedMs,
        usage: {input_tokens:0,output_tokens:0,total_tokens:0},
      });
      return Response.json({
        ok: true, question, answer: internalProcedure.answer,
        source: "GDP_INTERNAL_PROCEDURE",
        route: "APPROVED_INTERNAL_PROCEDURE",
        procedure_id: internalProcedure.procedure_id,
        procedure_code: internalProcedure.code,
        source_reference: internalProcedure.source,
        found: true, context: responseContext, elapsed_ms: elapsedMs,
        usage: {input_tokens:0,output_tokens:0,total_tokens:0},
      });
    }



    // =====================================================

    // 1. OPERACIÓN POR SUCURSAL

    // =====================================================



    // Una pregunta informativa sobre TYS/validador se responde desde
    // Recordá/Ficha, aunque incluya «por dónde valido».
    // Las preguntas por recepción, circuito o sucursal concreta mantienen
    // prioridad operativa y sus controles de seguridad.
    // Pregunta general por pertenencia de la sucursal a Cámara/Colegio.
    // No debe absorber la obra social activa ni requerir una regla particular
    // de OSDEPYM, OMINT, etc. Una pregunta específica sigue en resolveOperation.
    if (isGeneralBranchCircuitQuestion(question)) {
      let currentBranch = null;
      if (branchId || branchCode) {
        const baseQuery = supabaseAdmin
          .from("branches")
          .select("id,name,code,branch_type,active")
          .eq("active", true);
        const { data, error } = await (branchId
          ? baseQuery.eq("id", branchId)
          : baseQuery.eq("code", branchCode)).maybeSingle();
        if (error) {
          console.error("GDP branch membership lookup:", error.message);
        } else {
          currentBranch = data;
        }
      }
      const membership = currentBranch
        ? resolveGeneralBranchMembership({
            branchName: currentBranch.name,
            branchCode: currentBranch.code,
            branchType: currentBranch.branch_type,
          })
        : null;
      const answer = formatGeneralBranchMembershipResponse({
        branch: currentBranch, result: membership,
      });
      const found = membership?.status === "CONFIRMED";
      const elapsedMs = Date.now() - startedAt;
      await logCurrentQuery({branchId, socialWorkId, question, answer,
        source:"GDP_BRANCH_MEMBERSHIP", route:"GENERAL_BRANCH_CIRCUIT",
        found, elapsedMs,
        usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
      return Response.json({ok:true,question,answer,
        source:"GDP_BRANCH_MEMBERSHIP",route:"GENERAL_BRANCH_CIRCUIT",
        found,branch:currentBranch ? {
          id:currentBranch.id,code:currentBranch.code,name:currentBranch.name,
        } : null,
        context:responseContext,elapsed_ms:elapsedMs,
        usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
    }

// v3.13.19: reglas documentales comunes de autorización por importes (TODAS las sucursales).
    // Separar autorizaciones POR IMPORTE de circuitos Cámara/Colegio.
    // La regla es común a ambas normativas y a todas las sucursales.
    if (isAuthorizationAmountQuestionForCommonRule(question)) {
      const ruleWorkName = await getSocialWorkName(socialWorkId);
      const commonAuthorization = resolveCommonAuthorizationAmount({question, socialWorkName: ruleWorkName});
      if (commonAuthorization) {
        const answer = commonAuthorization.answer;
        const elapsedMs = Date.now() - startedAt;
        await logCurrentQuery({branchId, socialWorkId, question, answer,
          source: "DOCUMENTED_COMMON_NORMATIVE", route: "COMMON_AUTHORIZATION_LIMITS", found:true,
          elapsedMs, usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
        return Response.json({ok:true,question,answer,source:"DOCUMENTED_COMMON_NORMATIVE",
          route:"COMMON_AUTHORIZATION_LIMITS",found:true,rule_id:commonAuthorization.ruleId,
          context:responseContext,elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
      }
    }

    const detectedOperationIntent = detectOperationIntent(question);
    const validationProfileIntent = detectSocialWorkProfileIntent(question);
    const prescriptionMissingField = isPrescriptionMissingFieldQuestion(question);
    // Receta incompleta -> requisito normativo, NO recepción por circuito.
    const operationIntent = shouldPreferValidationProfile({
      operationType: detectedOperationIntent?.operationType,
      profileKey: validationProfileIntent?.key,
      question,
    }) || prescriptionMissingField ? null : detectedOperationIntent;



    if (

      operationIntent?.domain ===

      "OPERATION"

    ) {

      /**

 * * Para responder reglas específicas

 * * necesitamos conocer la sucursal.

 */

      if (

        branchId ||

        branchCode

      ) {

        const operationResult =

          await resolveOperation({

            branchId,

            branchCode,

            socialWorkId,

          });



        if (

          operationResult.ok &&

          operationResult.resolved

        ) {

          let answer =

            formatOperationAnswer(

              operationResult,

              operationIntent.operationType

            );

          // El circuito es específico de sucursal; la ficha agrega tipo/validador,
          // pero nunca reemplaza una excepción operativa ni una regla en revisión.
          if (operationIntent.operationType === "VALIDATION" &&
              operationResult.source !== "POLICY_REVIEW_REQUIRED") {
            const fichaValidation = await querySocialWorkProfile({
              socialWorkId,
              intent: { field: "validator_type", key: "VALIDATION_METHOD" },
              circuitGroup: (await getBranchCircuit()).group,
            });
            if (fichaValidation.found && answer) {
              answer += `\n\n${fichaValidation.answer}\nSi el circuito indicado anteriormente difiere de la ficha, consultá con Administración antes de validar.`;
            }
          }



          const elapsedMs =

            Date.now() -

            startedAt;
          const operationSource = operationResult.source === "POLICY_REVIEW_REQUIRED"
            ? "GDP_OPERATION_REVIEW"
            : operationResult.source?.startsWith("DECLARED_")
              ? "GDP_OPERATION_PROCEDURE" : "SUPABASE_OPERATION_RULE";
          const operationFound = operationResult.source !== "POLICY_REVIEW_REQUIRED";



          await logCurrentQuery({

            branchId,

            socialWorkId,

            question,

            answer,



            source:

              operationSource,



            route:

              "STRUCTURED_OPERATION",



            found: operationFound,



            elapsedMs,



            usage: {

              input_tokens: 0,

              output_tokens: 0,

              total_tokens: 0,

            },

          });



          return Response.json({

            ok: true,



            question,

            answer,



            source:

              operationSource,



            route:

              "STRUCTURED_OPERATION",



            intent: {

              domain:

                "OPERATION",



              operation_type:

                operationIntent.operationType,

            },



            branch:

              operationResult.branch,



            social_work:

              operationResult.socialWork,



            operation:

              operationResult.operation,



            rule:

              operationResult.rule,



            resolution_source:

              operationResult.source,



            context:

              responseContext,



            elapsed_ms:

              elapsedMs,



            usage: {

              input_tokens: 0,

              output_tokens: 0,

              total_tokens: 0,

            },

          });

        }



        // Si no existe una regla, impedir una respuesta de aprobación inventada.
        const answer = !socialWorkId
          ? "Indicame a qué obra social te referís para consultar el circuito habilitado para tu sucursal."
          : "No encontré una regla operativa confirmada para esta combinación de sucursal y obra social. No puedo asegurar si se recibe ni por qué circuito. Consultá con Administración antes de recibir la receta.";
        const elapsedMs = Date.now() - startedAt;
        await logCurrentQuery({branchId,socialWorkId,question,answer,
          source:"GDP_OPERATION_SAFETY",route:"OPERATION_NOT_CONFIRMED",found:false,
          elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
        return Response.json({ok:true,question,answer,source:"GDP_OPERATION_SAFETY",
          route:"OPERATION_NOT_CONFIRMED",found:false,context:responseContext,
          elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
      }

      // Sin sucursal tampoco se puede decidir Cámara/Colegio de forma segura.
      const answer = "Necesito identificar la sucursal para verificar si puede recibir esta obra social y por qué circuito. No puedo confirmarlo sin ese dato.";
      const elapsedMs = Date.now() - startedAt;
      await logCurrentQuery({branchId,socialWorkId,question,answer,
        source:"GDP_OPERATION_SAFETY",route:"OPERATION_BRANCH_REQUIRED",found:false,
        elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
      return Response.json({ok:true,question,answer,source:"GDP_OPERATION_SAFETY",
        route:"OPERATION_BRANCH_REQUIRED",found:false,context:responseContext,
        elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});

    }



// =====================================================
// 1.5 ACLARACIÓN DE ALCANCE
// =====================================================

const scopeClarificationIntent =
  detectScopeClarificationIntent(
    question
  );

if (
  scopeClarificationIntent?.domain ===
    "CLARIFICATION"
) {
  const elapsedMs =
    Date.now() -
    startedAt;

  await logCurrentQuery({
    branchId,
    socialWorkId,
    question,

    answer:
      scopeClarificationIntent.answer,

    source:
      "GDP_ROUTER",

    route:
      "STRUCTURED_CLARIFICATION",

    found:
      true,

    elapsedMs,

    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  });

  return Response.json({
    ok: true,
    question,

    answer:
      scopeClarificationIntent.answer,

    source:
      "GDP_ROUTER",

    route:
      "STRUCTURED_CLARIFICATION",

    intent: {
      domain:
        "CLARIFICATION",

      clarification_type:
        scopeClarificationIntent.clarificationType,
    },

    found:
      true,

    context:
      responseContext,

    elapsed_ms:
      elapsedMs,

    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  });
}


// =====================================================

// 2. CONTACTOS

// =====================================================



const contactIntent =

  detectContactIntent(

    question

  );



if (

  contactIntent?.domain ===

  "CONTACT"

) {

  const result =

    await queryContacts({

      socialWorkId,



      contactType:

        contactIntent.contactType,

    });



  /**

 * * Solamente respondemos inmediatamente

 * * cuando encontramos información

 * * estructurada.

 * *

 * * Si no existe contacto en Supabase,

 * * dejamos continuar el router:

 * *

 * * RULE

 * * FAQ

 * * CACHE

 * * FILE SEARCH

 */

  if (result.found) {

    const elapsedMs =

      Date.now() -

      startedAt;



    await logCurrentQuery({

      branchId,

      socialWorkId,

      question,



      answer:

        result.answer,



      source:

        "SUPABASE",



      route:

        "STRUCTURED_CONTACT",



      found:

        true,



      elapsedMs,



      usage: {

        input_tokens: 0,

        output_tokens: 0,

        total_tokens: 0,

      },

    });



    return Response.json({

      ok: true,



      question,



      answer:

        result.answer,



      source:

        "SUPABASE",



      route:

        "STRUCTURED_CONTACT",



      intent: {

        domain:

          "CONTACT",



        contact_type:

          contactIntent.contactType,

      },



      structured_data:

        result.data,



      found:

        true,



      context:

        responseContext,



      elapsed_ms:

        elapsedMs,



      usage: {

        input_tokens: 0,

        output_tokens: 0,

        total_tokens: 0,

      },

    });

  }

}



   // =====================================================
// 2.9 LISTA COMPLETA DE REQUISITOS DE RECETA
// Una pregunta amplia NO se responde con un único campo de Ficha.
// =====================================================
if (asksForPrescriptionChecklist(question)) {
  const {data:fichaBase, error:fichaError} = await supabaseAdmin.from("social_works")
    .select("id,name,recipe_type,recipe_validity_days,letterhead,rp,diagnosis,monodrug,commercial_name,substitution,observations")
    .eq("id", socialWorkId).maybeSingle();
  // v3.13.76 — Ficha del circuito de la sucursal sobre la base.
  const ficha = fichaBase ? (await withCircuitProfile(supabaseAdmin, fichaBase, (await getBranchCircuit()).group)).data : fichaBase;
  if (fichaError) console.error("ficha checklist:", fichaError.message);

  // Los requisitos de Cámara y Colegio no se pueden mezclar.
  const planVariant = resolvePlanVariant({ question, state: conversationState, socialWorkId });
  let {data:relations, error:relationsError} = await supabaseAdmin
    .from("normative_social_works")
    .select("normative_id,billing_channel_id,plan_variant,normatives!inner(is_current,title)")
    .eq("social_work_id", Number(socialWorkId))
    .eq("normatives.is_current", true);
  if (relationsError) ({data:relations, error:relationsError} = await supabaseAdmin
    .from("normative_social_works")
    .select("normative_id,billing_channel_id,normatives!inner(is_current,title)")
    .eq("social_work_id", Number(socialWorkId))
    .eq("normatives.is_current", true));
  if (relationsError) console.error("checklist scope:", relationsError.message);
  const scope = relationsError
    ? {ok:false, reason:"No pude verificar las normativas vinculadas."}
    : scopeNormativeTopic(scopeLinkedNormatives(relations || [], activeBillingChannelId || (await getBranchCircuit()).channelId, 32, planVariant), relations || [], question);
  let answer;
  let source = "SOCIAL_WORK_PROFILE";
  let route = "PRESCRIPTION_CHECKLIST_SAFE";
  let usage = {input_tokens:0, output_tokens:0, total_tokens:0};
  const fichaLines = buildFichaPrescriptionChecklist(ficha);
  if (!scope.ok) {
    answer = scope.reason;
    route = "PRESCRIPTION_CHECKLIST_CIRCUIT_CLARIFICATION";
  } else {
    const ids = scope.normativeIds;
    const normative = ids.length
      ? await queryFileSearch({
          question: `Detallá exclusivamente todos los requisitos para aceptar una receta de ${ficha?.name || "esta obra social"}, diferenciando tipo de receta cuando la normativa lo indique. No inventes ni uses protocolos internos. Enumerá sólo requisitos respaldados por documentos recuperados; si no hay evidencia, decilo.`,
          socialWorkId,
          normativeIds: ids,
          maxResults: isSpecificNormativeTopic(question) ? 12 : 8,
          maxOutputTokens: 1200,
        }) : null;
    const hasDocument = Boolean(normative?.search?.results?.length && normative.answer && !isInsufficientAnswer(normative.answer));
    const sections = [`Revisión de receta para ${ficha?.name || "esta obra social"}:`];
    if (fichaLines.length) sections.push("Recordá/Ficha (datos registrados):", ...fichaLines);
    else sections.push("No hay campos de receta disponibles en Recordá/Ficha.");
    if (hasDocument) {
      const documentNames = [...new Set((normative.search.results || [])
        .map((r) => String(r.filename || "").trim()).filter(Boolean))].slice(0, 8);
      sections.push("", "Normativa vigente (requisitos encontrados, lista no necesariamente exhaustiva):", normative.answer);
      if (documentNames.length) sections.push("Documentos recuperados: " + documentNames.join("; "));
      source = "SOCIAL_WORK_PROFILE_AND_NORMATIVE";
      route = "PRESCRIPTION_CHECKLIST_FICHA_NORMATIVE";
      usage = normative.usage || usage;
    } else {
      sections.push("", "No pude recuperar un listado completo respaldado por la normativa vigente.");
    }
    sections.push("", "Comprobá el plan y circuito y revisá los campos directamente en la receta. Este resumen no autoriza por sí solo su recepción ni dispensación.");
    answer = sections.join("\n");
    // v3.13.68 — formato corto con pestañas; si no se puede ordenar con seguridad, queda el listado anterior.
    if (hasDocument) {
      const branchGroup = (await getBranchCircuit()).group;
      const compact = buildRequirementsAnswer({
        socialWorkName: ficha?.name,
        circuitLabel: branchGroup === "CAMARA" ? "Cámara" : branchGroup === "COLEGIO" ? "Colegio" : null,
        fichaLines,
        normativeAnswer: normative.answer,
        documentNames: (normative.search.results || []).map((r) => String(r.filename || "").replace(/\.[a-z0-9]{2,4}$/i, "").trim()),
      });
      if (compact) answer = compact;
    }
  }
  const elapsedMs = Date.now() - startedAt;
  await logCurrentQuery({branchId, socialWorkId, question, answer, source, route,
    found: true, elapsedMs, usage});
  return Response.json({ok:true, question, answer, source, route, found:true,
    context:responseContext, elapsed_ms:elapsedMs, usage});
}

   // =====================================================
// 3. RECORDÁ / FICHA
// =====================================================

let fileSearchQuestion =
  question;

let skipAnswerCache =
  false;

// v3.13.20 — repregunta sobre el mismo tema: se busca con el contexto de la
// consulta anterior y la respuesta se amplía (no se vuelve a resumir).
const followUp = resolveFollowUp({ question, state: conversationState, socialWorkId });
if (followUp.isFollowUp) {
  fileSearchQuestion = followUp.searchQuestion;
  skipAnswerCache = true;
}
// v3.13.26 — condiciones del usuario («únicamente…», «no agregues…»): se busca solo
// el tema y las condiciones se le exigen al modelo, para cualquier obra social.
const userConstraintSplit = splitUserConstraints(question);
if (userConstraintSplit.hasConstraints && !followUp.isFollowUp) {
  fileSearchQuestion = userConstraintSplit.topic;
}

const profileIntent =
  detectSocialWorkProfileIntent(
    question
  );
let profileFallback = null;
const respondProfileFallback = async () => {
  const fallbackElapsedMs = Date.now() - startedAt;
  const fallbackUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  await logCurrentQuery({ branchId, socialWorkId, question, answer: profileFallback.answer,
    source: "SOCIAL_WORK_PROFILE", route: "STRUCTURED_PROFILE", found: true,
    elapsedMs: fallbackElapsedMs, usage: fallbackUsage });
  return Response.json({ ok: true, question, answer: profileFallback.answer,
    source: "SOCIAL_WORK_PROFILE", route: "STRUCTURED_PROFILE", structured_data: profileFallback.data,
    found: true, context: responseContext, elapsed_ms: fallbackElapsedMs, usage: fallbackUsage });
};
if (
  profileIntent
) {
  const result =
    await querySocialWorkProfile({
      socialWorkId,

      intent:
        profileIntent,
      circuitGroup: (await getBranchCircuit()).group,
    });

  // v3.13.22 — la ficha de validación no debe contradecir la excepción de la sucursal.
  if (result.found && ["VALIDATION_METHOD", "VALIDATOR_NAME"].includes(profileIntent.key)) {
    const validatorException = await getBranchValidatorException({ branchId, branchCode, socialWorkId });
    const validatorNote = formatBranchValidatorNote(validatorException);
    if (validatorNote) result.answer = `${result.answer}\n\n${validatorNote}`;
    // v3.13.77 — dice directamente cómo se tramita en la sucursal (en lugar de «corroborá el circuito»).
    try {
      const baseBranch = supabaseAdmin.from("branches").select("name,code");
      const { data: branchRow } = await (branchId ? baseBranch.eq("id", branchId) : baseBranch.eq("code", branchCode)).maybeSingle();
      const workName = result.data?.social_work_name || (await getSocialWorkName(socialWorkId));
      if (branchRow && workName && !validatorNote) {
        const policy = resolveDeclaredCircuitPolicy({ branchName: branchRow.name, branchCode: branchRow.code, socialWorkName: workName });
        const circuitLine = formatCircuitLine(policy, { branchLabel: branchRow.name || branchRow.code, workName });
        result.answer = applyCircuitLine(result.answer, circuitLine);
      }
    } catch {
      // opcional: nunca debe romper la respuesta
    }
  }
  // =====================================================
  // DATO ESTRUCTURADO DISPONIBLE
  // =====================================================
  if (result.found && result.incomplete) profileFallback = result;
  if (
    result.found && !result.incomplete
  ) {
    const elapsedMs =
      Date.now() -
      startedAt;

    await logCurrentQuery({
      branchId,
      socialWorkId,
      question,

      answer:
        result.answer,

      source:
        "SOCIAL_WORK_PROFILE",

      route:
        "STRUCTURED_PROFILE",

      found:
        true,

      elapsedMs,

      usage: {
        input_tokens:
          0,

        output_tokens:
          0,

        total_tokens:
          0,
      },
    });

    return Response.json({
      ok:
        true,

      question,

      answer:
        result.answer,

      source:
        "SOCIAL_WORK_PROFILE",

      route:
        "STRUCTURED_PROFILE",

      intent: {
        domain:
          "SOCIAL_WORK_PROFILE",

        key:
          profileIntent.key,

        field:
          profileIntent.field,
      },

      structured_data:
        result.data,

      found:
        true,

      context:
        responseContext,

      elapsed_ms:
        elapsedMs,

      usage: {
        input_tokens:
          0,

        output_tokens:
          0,

        total_tokens:
          0,
      },
    });
  }

  // =====================================================
  // NO EXISTE DATO ESTRUCTURADO
  //
  // Reformulamos la pregunta para evitar:
  //
  // "avalian vigencia"
  //
  // -> "vigente desde 2020"
  //
  // En cambio se busca:
  //
  // "vigencia de las recetas de AVALIAN"
  // =====================================================

  const {
    data:
      socialWorkData,

    error:
      socialWorkDataError,
  } =
    await supabaseAdmin
      .from(
        "social_works"
      )
      .select(`
        id,
        name
      `)
      .eq(
        "id",
        socialWorkId
      )
      .maybeSingle();

  if (
    socialWorkDataError
  ) {
    console.error(
      "social work fallback lookup:",
      socialWorkDataError.message
    );
  }

  const fallbackQuestion =
    buildProfileFallbackQuestion({
      intent:
        profileIntent,

      socialWorkName:
        socialWorkData
          ?.name ||
        null,
    });

  if (
    fallbackQuestion
  ) {
    fileSearchQuestion =
      fallbackQuestion;

    /*
     * No usar una respuesta vieja
     * guardada con interpretación
     * incorrecta.
     */
    skipAnswerCache =
      true;
  }
}
// =====================================================
// 3.5 REQUISITOS NORMATIVOS ESPECÍFICOS
// =====================================================

const normativeRequirementIntent =
  detectNormativeRequirementIntent(
    question
  );

if (
  normativeRequirementIntent
) {
  const socialWorkName =
    await getSocialWorkName(
      socialWorkId
    );

  const requirementFallbackQuestion =
    buildNormativeRequirementFallbackQuestion({
      intent:
        normativeRequirementIntent,

      socialWorkName,
    });

  if (
    requirementFallbackQuestion
  ) {
    fileSearchQuestion =
      requirementFallbackQuestion;

    // Evitamos respuestas viejas como:
    // "No encuentro esa información..."
    skipAnswerCache =
      true;
  }
}

// Si pregunta por un dato faltante, mantener la OOSS activa y consultar
// sus requisitos (sin reusar una respuesta genérica de circuitos).
if (prescriptionMissingField) {
  const socialWorkName = await getSocialWorkName(socialWorkId);
  const specificQuestion = buildMissingFieldNormativeQuestion({ question, socialWorkName });
  if (specificQuestion) fileSearchQuestion = specificQuestion;
  skipAnswerCache = true;
}

    // =====================================================
    // 4. REGLAS ESTRUCTURADAS
    // =====================================================



    const ruleIntent =

      detectRuleIntent(

        question

      );



    if (

      ruleIntent?.domain ===

      "RULE"

    ) {

      const result =

        await queryRule({

          socialWorkId,



          ruleKey:

            ruleIntent.ruleKey,

        });



      /**

 * * Solamente respondemos acá

 * * si encontramos una regla aprobada.

 * *

 * * Si no existe, hacemos fallback

 * * hacia FAQ / cache / OpenAI.

 */

      if (result.found) {

        const elapsedMs =

          Date.now() -

          startedAt;



        await logCurrentQuery({

          branchId,

          socialWorkId,

          question,



          answer:

            result.answer,



          source:

            "SUPABASE",



          route:

            "STRUCTURED_RULE",



          normativeId:

            result.data

              ?.normative_id ??

            null,



          found:

            true,



          elapsedMs,



          usage: {

            input_tokens: 0,

            output_tokens: 0,

            total_tokens: 0,

          },

        });



        return Response.json({

          ok: true,



          question,



          answer:

            result.answer,



          source:

            "SUPABASE",



          route:

            "STRUCTURED_RULE",



          intent: {

            domain:

              "RULE",



            rule_key:

              ruleIntent.ruleKey,

          },



          structured_data:

            result.data,



          found:

            true,



          context:

            responseContext,



          elapsed_ms:

            elapsedMs,



          usage: {

            input_tokens: 0,

            output_tokens: 0,

            total_tokens: 0,

          },

        });

      }

    }



    // =====================================================
    // 5. FAQ APROBADA

    // =====================================================



    const approvedFaq =
      // Una pregunta sobre un dato faltante y los anexos específicos nunca
      // deben recibir una FAQ genérica posiblemente obsoleta.
      (prescriptionMissingField || isSpecificNormativeTopic(question))
        ? null : (await getApprovedFaq({ branchId, socialWorkId, question })) ||
          (await lookupSemanticFaq({ branchId, socialWorkId, question }));



    if (approvedFaq) {

      const elapsedMs =

        Date.now() -

        startedAt;



      /**

 * * Actualizamos uso.

 * *

 * * Si falla, no rompemos la respuesta.

 */

      const {

        error:

          faqUsageError,

      } =

        await supabaseAdmin

          .from(

            "social_work_faqs"

          )

          .update({

            usage_count:

              (approvedFaq.usage_count ||

                0) + 1,



            last_used_at:

              new Date().toISOString(),



            updated_at:

              new Date().toISOString(),

          })

          .eq(

            "id",

            approvedFaq.id

          );



      if (faqUsageError) {

        console.error(

          "FAQ usage update error:",

          faqUsageError.message

        );

      }



      await logCurrentQuery({

        branchId,

        socialWorkId,

        question,



        answer:

          approvedFaq.answer,



        source:

          "FAQ",



        route:

          "APPROVED_FAQ",



        normativeId:

          approvedFaq

            .source_normative_id,



        found:

          true,



        elapsedMs,



        usage: {

          input_tokens: 0,

          output_tokens: 0,

          total_tokens: 0,

        },

      });



      return Response.json({

        ok: true,



        question,



        answer:

          approvedFaq.answer,



        source:

          "FAQ",



        route:

          "APPROVED_FAQ",



        found:

          true,



        faq: {

          id:

            approvedFaq.id,



          scope:

            approvedFaq.scope,



          detected_count:

            approvedFaq.detected_count,

        },



        normative_id:

          approvedFaq

            .source_normative_id,



        context:

          responseContext,



        elapsed_ms:

          elapsedMs,



        usage: {

          input_tokens: 0,

          output_tokens: 0,

          total_tokens: 0,

        },

      });

    }



    // =====================================================

    // =====================================================

    // 6. CACHE

    // =====================================================



    /**

 * * La cache requiere sucursal porque

 * * su clave actual es:

 * *

 * * branchId

 * * + socialWorkId

 * * + normalizedQuestion

 */



  const cachedAnswer =
  (
    branchId &&
    !skipAnswerCache && !isSpecificNormativeTopic(question)
  )
    ? await getCachedAnswer({
        branchId,
        socialWorkId,
        question,
      })
    : null;



    if (cachedAnswer) {

      const elapsedMs =

        Date.now() -

        startedAt;



      await logCurrentQuery({

        branchId,

        socialWorkId,

        question,



        answer:

          cachedAnswer.answer,



        source:

          "CACHE",



        route:

          "CACHE",



        normativeId:

          cachedAnswer.normative_id,



        found:

          true,



        elapsedMs,



        usage: {

          input_tokens: 0,

          output_tokens: 0,

          total_tokens: 0,

        },

      });



      await maybeSuggestFaq({

        branchId,

        socialWorkId,

        question,



        answer:

          cachedAnswer.answer,



        normativeId:

          cachedAnswer.normative_id,



        sourceType:

          "CACHE",

      });



      return Response.json({

        ok: true,



        question,



        answer:

          cachedAnswer.answer,



        source:

          "CACHE",



        route:

          "CACHE",



        found:

          true,



        normative_id:

          cachedAnswer.normative_id,



        cache: {

          hit: true,



          cache_id:

            cachedAnswer.id,

        },



        context:

          responseContext,



        elapsed_ms:

          elapsedMs,



        usage: {

          input_tokens: 0,

          output_tokens: 0,

          total_tokens: 0,

        },

      });

    }



    // =====================================================

    // 7. OPENAI FILE SEARCH

    // =====================================================



// Selección de documentos a partir de vínculos actuales en Supabase.
// Incluye normas generales y anexos (vacunas, insulinas, etc.) del MISMO app_id.
// Ante circuitos diferentes no se combinan normativas sin confirmar Cámara/Colegio.
// v3.13.20 — la sucursal autenticada ya identifica su grupo (Cámara/Colegio):
// no se le pide al usuario. Solo se usa si resuelve el alcance; si no, se
// conserva el comportamiento anterior. Desactivable con GDP_AUTO_BRANCH_CHANNEL=0.
const generalPlanVariant = resolvePlanVariant({ question, state: conversationState, socialWorkId });
const channelBeforeBranchResolution = activeBillingChannelId;
if (!activeBillingChannelId) {
  const scopeProbe = await getLinkedCurrentNormativeScope(
    supabaseAdmin, socialWorkId, null, fileSearchQuestion, generalPlanVariant,
  );
  if (!scopeProbe.ok && scopeProbe.ambiguous) {
    const branchChannelId = (await getBranchCircuit()).channelId;
    if (branchChannelId) {
      const scopedByBranch = await getLinkedCurrentNormativeScope(
        supabaseAdmin, socialWorkId, branchChannelId, fileSearchQuestion, generalPlanVariant,
      );
      if (scopedByBranch.ok) activeBillingChannelId = branchChannelId;
    }
  }
}
const normativeScope = await getLinkedCurrentNormativeScope(
  supabaseAdmin, socialWorkId, activeBillingChannelId, fileSearchQuestion, generalPlanVariant,
);
activeBillingChannelId = channelBeforeBranchResolution;
if (!normativeScope.ok) {
  // v3.13.36 — sin normativas vinculadas: se intenta con observaciones aprobadas.
  if (!normativeScope.ambiguous) {
    const notesSupport = await answerFromApprovedNotes({ question: fileSearchQuestion, socialWorkId, variant: generalPlanVariant });
    if (notesSupport) {
      const notesElapsedMs = Date.now() - startedAt;
      await logCurrentQuery({ branchId, socialWorkId, question, answer: notesSupport.answer,
        source: "SOCIAL_WORK_NOTES", route: "APPROVED_NOTES_FALLBACK", found: true,
        elapsedMs: notesElapsedMs, usage: notesSupport.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });
      return Response.json({ ok: true, question, answer: notesSupport.answer, source: "SOCIAL_WORK_NOTES",
        route: "APPROVED_NOTES_FALLBACK", found: true, context: responseContext,
        elapsed_ms: notesElapsedMs, usage: notesSupport.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });
    }
    const meaningProcedure = await answerFromProceduresByMeaning({ question: fileSearchQuestion, socialWorkId, billingChannelId: activeBillingChannelId || (await getBranchCircuit()).channelId });
    if (meaningProcedure) {
      const meaningElapsedMs = Date.now() - startedAt;
      const meaningUsage = meaningProcedure.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      await logCurrentQuery({ branchId, socialWorkId, question, answer: meaningProcedure.answer,
        source: "GDP_INTERNAL_PROCEDURE", route: "INTERNAL_PROCEDURE_BY_MEANING", found: true,
        elapsedMs: meaningElapsedMs, usage: meaningUsage });
      return Response.json({ ok: true, question, answer: meaningProcedure.answer, source: "GDP_INTERNAL_PROCEDURE",
        route: "INTERNAL_PROCEDURE_BY_MEANING", procedure_id: meaningProcedure.procedure_id, procedure_code: meaningProcedure.code,
        found: true, context: responseContext, elapsed_ms: meaningElapsedMs, usage: meaningUsage });
    }
  }
  if (profileFallback) return respondProfileFallback();
  const answer = normativeScope.reason;
  const elapsedMs = Date.now() - startedAt;
  await logCurrentQuery({branchId,socialWorkId,question,answer,
    source:"GDP_NORMATIVE_SCOPE",route:"NORMATIVE_SCOPE_UNVERIFIED",found:false,
    elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
  return Response.json({ok:true,question,answer,source:"GDP_NORMATIVE_SCOPE",
    route:"NORMATIVE_SCOPE_UNVERIFIED",found:false,context:responseContext,
    elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});
}
const specialNormativeTopic = isSpecificNormativeTopic(fileSearchQuestion);
let result = await queryFileSearch({
  question: specialNormativeTopic
    ? `${fileSearchQuestion} Revisá también los anexos o normativas específicas del tema, además de la normativa general, sin mezclar planes o circuitos.`
    : fileSearchQuestion,
  socialWorkId,
  normativeIds: normativeScope.normativeIds,
  maxResults: specialNormativeTopic ? 12 : 8,
  maxOutputTokens: specialNormativeTopic ? 650 : null,
  forceDetailed: followUp.isFollowUp,
  adminCorrections: buildCorrectionsPrompt(adminCorrections),
  branchCircuit: buildBranchCircuitPrompt((await getBranchCircuit()).group),
  userConstraints: buildConstraintsPrompt(userConstraintSplit),
});
// v3.13.32 — repregunta sin respuesta literal («No encuentro»): se reintenta pidiendo
// lo que la normativa sí indica sobre el tema y qué parte de lo preguntado no figura.
if (followUp.isFollowUp && isNotFoundAnswer(result?.answer)) {
  try {
    const partial = await queryFileSearch({
      question: buildPartialAnswerQuestion(question, conversationState),
      socialWorkId,
      normativeIds: normativeScope.normativeIds,
      maxResults: 5,
      forceDetailed: true,
    });
    if (partial?.answer && !isNotFoundAnswer(partial.answer)) result = partial;
  } catch (partialError) {
    console.warn("reintento parcial no disponible:", partialError?.message);
  }
}



    const elapsedMs =

      Date.now() -

      startedAt;



    /**

 * * Tomamos el primer resultado

 * * como normativa principal.

 */

    const topResult =

      result.search

        ?.results?.[0] ??

      null;



    const retrievedNormativeId =

      topResult

        ?.attributes

        ?.normative_id ??

      null;



    const hasSearchResults =

      Boolean(

        result.search

          ?.results

          ?.length > 0

      );



    const insufficientAnswer =

      isInsufficientAnswer(

        result.answer

      );



    const found =

      Boolean(

        result.answer &&

        hasSearchResults &&

        !insufficientAnswer

      );



    const normativeId =

      found

        ? retrievedNormativeId

        : null;



    // =====================================================

    // RESPUESTA SEGURA SI NO HAY EVIDENCIA

    // =====================================================



    /**

 * * No queremos devolver una respuesta

 * * aparentemente válida si File Search

 * * no recuperó documentación.

 */

    // Protocolo interno SOLO como último recurso si no hay evidencia de ficha/normativa.
    // No se usa para completar vigencia, RP, cobertura ni otros requisitos específicos.
    // v3.13.36 — la normativa no respondió: se intenta con observaciones aprobadas.
    if (!found) {
      const notesSupport = await answerFromApprovedNotes({ question: fileSearchQuestion, socialWorkId, variant: generalPlanVariant });
      if (notesSupport) {
        const notesElapsedMs = Date.now() - startedAt;
        await logCurrentQuery({ branchId, socialWorkId, question, answer: notesSupport.answer,
          source: "SOCIAL_WORK_NOTES", route: "APPROVED_NOTES_FALLBACK", found: true,
          elapsedMs: notesElapsedMs, usage: notesSupport.usage || result.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });
        return Response.json({ ok: true, question, answer: notesSupport.answer, source: "SOCIAL_WORK_NOTES",
          route: "APPROVED_NOTES_FALLBACK", found: true, context: responseContext,
          elapsed_ms: notesElapsedMs, usage: notesSupport.usage || result.usage || { input_tokens: 0, output_tokens: 0, total_tokens: 0 } });
      }
    }
    if ((!found && !isSpecificNormativeQuestion(question)) || (!found && prescriptionMissingField)) {
      const lastResortProcedure = await resolveInternalProcedure({
        question, socialWorkId, billingChannelId: activeBillingChannelId || (await getBranchCircuit()).channelId,
      }) || await answerFromProceduresByMeaning({
        // Con dato en un campo, fileSearchQuestion lleva instrucciones de búsqueda: se clasifica la consulta original.
        question: prescriptionMissingField ? question : fileSearchQuestion,
        socialWorkId, billingChannelId: activeBillingChannelId || (await getBranchCircuit()).channelId,
      });
      if (lastResortProcedure) {
        const procedureElapsedMs = Date.now() - startedAt;
        await logCurrentQuery({
          branchId, socialWorkId, question,
          answer: lastResortProcedure.answer,
          source: "GDP_INTERNAL_PROCEDURE",
          route: "INTERNAL_PROCEDURE_FALLBACK",
          found: true,
          elapsedMs: procedureElapsedMs,
          usage: result.usage || {input_tokens:0,output_tokens:0,total_tokens:0},
        });
        return Response.json({
          ok:true, question, answer:lastResortProcedure.answer,
          source:"GDP_INTERNAL_PROCEDURE", route:"INTERNAL_PROCEDURE_FALLBACK",
          procedure_id:lastResortProcedure.procedure_id,
          procedure_code:lastResortProcedure.code,
          source_reference:lastResortProcedure.source,
          found:true, context:responseContext, elapsed_ms:procedureElapsedMs,
          usage:result.usage || {input_tokens:0,output_tokens:0,total_tokens:0},
        });
      }
    }

    if (!found && profileFallback) return respondProfileFallback();
    const finalAnswer =
      found

        ? result.answer

        : "No encontré información suficiente en las normativas vigentes para responder con seguridad.";



    // =====================================================

    // GUARDAR RESPUESTA EN CACHE

    // =====================================================



    /**

 * * Nunca cacheamos respuestas

 * * sin respaldo documental.

 */

    if (

      found &&

       branchId && !followUp.isFollowUp
    ) {

      await saveCachedAnswer({

        branchId,

        socialWorkId,

        question,



        answer:

          finalAnswer,



        source:

          "OPENAI_FILE_SEARCH",



        route:

          "SEMANTIC",



        normativeId,



        openaiResponseId:

          result.response_id,



        usage:

          result.usage,

      });

    }



    // =====================================================

    // LOG OPENAI

    // =====================================================



    await logCurrentQuery({

      branchId,

      socialWorkId,

      question,



      answer:

        finalAnswer,



      source:

        "OPENAI_FILE_SEARCH",



      route:

        "SEMANTIC",



      normativeId,



      found,



      elapsedMs,



      usage:

        result.usage,



      openaiResponseId:

        result.response_id,

    });



    // =====================================================

    // SUGERENCIA FAQ

    // =====================================================



    /**

 * * Solo generamos candidatos FAQ

 * * cuando encontramos evidencia real.

 */

    if (found) {

      await maybeSuggestFaq({

        branchId,

        socialWorkId,

        question,



        answer:

          finalAnswer,



        normativeId,



        sourceType:

          "OPENAI_FILE_SEARCH",

      });

    }



    // =====================================================

    // RESPUESTA FINAL

    // =====================================================



    return Response.json({

      ok: true,



      question,



      answer:

        finalAnswer,



      source:

        "OPENAI_FILE_SEARCH",



      route:

        "SEMANTIC",



      response_mode:

        result.detailed

          ? "DETAILED"

          : "SHORT",



      found,



      normative_id:

        normativeId,



      cache: {

        hit: false,

      },



      context:

        responseContext,



      elapsed_ms:

        elapsedMs,



      usage:

        result.usage,



      search:

        result.search,



      response_id:

        result.response_id,

    });

  } catch (error) {

    console.error(

      "GDP query router error:",

      error

    );



    /**

 * * No exponemos el stack al frontend.

 * *

 * * Durante desarrollo dejamos el mensaje

 * * para diagnosticar rápidamente.

 */

    return Response.json(

      {

        ok: false,



        error:

          process.env.NODE_ENV ===

          "development"

            ? error?.message ||

              "Error desconocido"

            : "No se pudo procesar la consulta.",



        code:

          "ASSISTANT_QUERY_ERROR",

      },

      {

        status: 500,

      }

    );

  }

}
