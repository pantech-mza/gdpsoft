import {
  supabaseAdmin,
} from "../../../../lib/supabase/admin";
import { isGeneralBranchCircuitQuestion } from "../../../../lib/assistant/branch-circuit-membership.mjs";
import { isSocialWorkStatusQuestion } from "../../../../lib/assistant/social-work-status.mjs";
import { unresolvedExplicitSocialWork } from "../../../../lib/assistant/explicit-social-work-protection.mjs";

import {
  buildTopicQuestion,
} from "../../../../lib/assistant/topics";

import {
  buildSocialWorkDictionary,
  detectSocialWorks,
} from "../../../../lib/assistant/socialWorkDetection";

import {
  shouldConfirmNewPrescriptionContext,
  buildConfirmedMissingFieldQuestion,
} from "../../../../lib/assistant/recipe-context-clarification.mjs";

export const runtime = "nodejs";

export const dynamic =
  "force-dynamic";

// =========================================================
// NORMALIZAR
// =========================================================

function normalizeText(
  value = ""
) {
  return String(value)
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
  if (!text || !phrase) {
    return false;
  }

  return ` ${text} `.includes(
    ` ${phrase} `
  );
}

// =========================================================
// DETECTAR OOSS
// =========================================================

// =========================================================
// DETECTAR OBRA SOCIAL
// =========================================================

async function detectSocialWork(
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
  // OOSS
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
      "assistant chat aliases:",
      aliasesError.message
    );
  }

  // =====================================================
  // DETECTOR CENTRAL
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
      unresolvedName,
    };
  }

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
// CARGAR CONVERSACIÓN
// =========================================================

async function loadConversation(
  conversationId
) {
  const {
    data,
    error,
  } = await supabaseAdmin
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
// CARGAR NOMBRE OOSS
// =========================================================

async function loadSocialWork(
  socialWorkId
) {
  if (!socialWorkId) {
    return null;
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("social_works")
    .select(`
      id,
      name
    `)
    .eq(
      "id",
      socialWorkId
    )
    .maybeSingle();

  if (error) {
    console.error(
      "assistant chat social work:",
      error.message
    );

    return null;
  }

  return data;
}

// =========================================================
// CAMBIAR OOSS EN CONVERSACIÓN
// =========================================================

async function setConversationSocialWork({
  conversationId,
  socialWorkId,
}) {
  const {
    error,
  } = await supabaseAdmin
    .from(
      "conversations"
    )
    .update({
      active_social_work_id:
        socialWorkId,

      active_billing_channel_id:
        null,

      updated_at:
        new Date().toISOString(),
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
// PLANES DE OOSS
// =========================================================

async function loadPlans(
  socialWorkId
) {
  if (!socialWorkId) {
    return [];
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      "social_work_plans"
    )
    .select("*")
    .eq(
      "social_work_id",
      socialWorkId
    );

  if (error) {
    /*
     * No rompemos el bot si una OOSS
     * todavía no tiene planes cargados.
     */
    console.error(
      "assistant chat plans:",
      error.message
    );

    return [];
  }

  return (
    data || []
  )
    .filter(
      (item) =>
        item?.active !==
        false
    )
    .map(
      (item) => {
        const label =
          item?.name ||
          item?.plan_name ||
          item?.label ||
          item?.description ||
          item?.code ||
          null;

        if (!label) {
          return null;
        }

        return {
          id:
            item?.id != null
              ? String(
                  item.id
                )
              : String(
                  item.code ||
                    label
                ),

          code:
            item?.code ||
            null,

          label:
            String(
              label
            ).trim(),
        };
      }
    )
    .filter(Boolean);
}

// =========================================================
// CONSULTA DEMASIADO GENERAL
// =========================================================

function isBroadRequirementsQuestion(
  question
) {
  const q =
    normalizeText(
      question
    );

  if (
    !q.includes(
      "requisito"
    )
  ) {
    return false;
  }

  /*
   * Si ya indicó exactamente
   * qué requisitos necesita,
   * no pedimos plan.
   */
  const specificTerms = [
    "receta",
    "recetario",
    "presentacion",
    "electronica",
    "electronico",
    "validacion",
    "validar",
    "autorizacion",
    "cobertura",
    "descuento",
    "tope",
    "limite",
    "facturacion",
    "auditoria",
    "diagnostico",
    "membrete",
    "rp",
    "vigencia",
    "validez",
  ];

  return !specificTerms.some(
    (term) =>
      q.includes(term)
  );
}

// =========================================================
// ¿YA NOMBRÓ UN PLAN?
// =========================================================

function findPlanInQuestion(
  question,
  plans
) {
  const q =
    normalizeText(
      question
    );

  for (
    const plan of
      plans || []
  ) {
    const label =
      normalizeText(
        plan.label
      );

    const code =
      normalizeText(
        plan.code
      );

    if (
      (
        label &&
        containsWholePhrase(
          q,
          label
        )
      ) ||
      (
        code &&
        containsWholePhrase(
          q,
          code
        )
      )
    ) {
      return plan;
    }
  }

  return null;
}

// =========================================================
// FOLLOW-UP DEL MODELO
// =========================================================

function extractFollowUp(
  answer = ""
) {
  const text =
    String(answer).trim();

  if (!text) {
    return null;
  }

  const matches =
    text.match(
      /¿[^¿?]+\?/g
    );

  if (
    !matches ||
    matches.length === 0
  ) {
    return null;
  }

  const candidate =
    matches[
      matches.length - 1
    ].trim();

  const q =
    normalizeText(
      candidate
    );

  if (
    !q.includes(
      "queres"
    ) &&
    !q.includes(
      "te muestre"
    ) &&
    !q.includes(
      "te detalle"
    )
  ) {
    return null;
  }

  return candidate;
}

// =========================================================
// CLASIFICAR FOLLOW-UP
// =========================================================

function classifyFollowUpTopic(
  value = ""
) {
  const q =
    normalizeText(
      value
    );

  if (
    q.includes(
      "presentacion"
    )
  ) {
    return "PRESENTATION_REQUIREMENTS";
  }

  if (
    q.includes(
      "electronica"
    )
  ) {
    return "ELECTRONIC_PRESCRIPTIONS";
  }

  if (
    q.includes(
      "auditoria"
    )
  ) {
    return "AUDIT";
  }

  if (
    q.includes(
      "validacion"
    ) ||
    q.includes(
      "validar"
    )
  ) {
    return "VALIDATION";
  }

  if (
    q.includes(
      "autorizacion"
    )
  ) {
    return "AUTHORIZATION";
  }

  if (
    q.includes("tope") ||
    q.includes("limite")
  ) {
    return "LIMITS";
  }

  if (
    q.includes(
      "cobertura"
    ) ||
    q.includes(
      "descuento"
    )
  ) {
    return "COVERAGE";
  }

  if (
    q.includes(
      "facturacion"
    )
  ) {
    return "BILLING";
  }

  if (
    q.includes(
      "excepcion"
    )
  ) {
    return "EXCEPTIONS";
  }

  if (
    q.includes(
      "requisito"
    )
  ) {
    return "RECIPE_REQUIREMENTS";
  }

  return null;
}

// =========================================================
// QUITAR FOLLOW-UP DEL TEXTO
// =========================================================

function stripFollowUp(
  answer,
  followUp
) {
  if (
    !answer ||
    !followUp
  ) {
    return answer;
  }

  const index =
    answer.lastIndexOf(
      followUp
    );

  if (
    index === -1
  ) {
    return answer;
  }

  return answer
    .slice(
      0,
      index
    )
    .trim();
}

// =========================================================
// LLAMAR AL ROUTER ACTUAL
// =========================================================

async function callAssistantQuery({
  request,
  conversationId,
  question,
}) {
  const targetUrl =
    new URL(
      "/api/assistant/query",
      request.url
    );

  const headers = {
    "Content-Type":
      "application/json",
  };

  const authorization =
    request.headers.get(
      "authorization"
    );

  const cookie =
    request.headers.get(
      "cookie"
    );

  if (authorization) {
    headers.Authorization =
      authorization;
  }

  if (cookie) {
    headers.Cookie =
      cookie;
  }

  const response =
    await fetch(
      targetUrl,
      {
        method: "POST",

        headers,

        cache: "no-store",

        body:
          JSON.stringify({
            conversationId,
            question,
          }),
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    return {
      response,
      data: {
        ok: false,
        error:
          "El asistente devolvió una respuesta inválida.",
        code:
          "INVALID_ASSISTANT_RESPONSE",
      },
    };
  }

  return {
    response,
    data,
  };
}

// =========================================================
// POST
// =========================================================

export async function POST(
  request
) {
  try {
    const body =
      await request.json();

    const conversationId =
      body?.conversationId
        ? String(
            body.conversationId
          ).trim()
        : null;

    const originalQuestion =
      String(
        body?.question ||
          ""
      ).trim();

    const topic =
      body?.topic
        ? String(
            body.topic
          )
            .trim()
            .toUpperCase()
        : null;

    const plan =
      body?.plan &&
      typeof body.plan ===
        "object"
        ? body.plan
        : null;

    const usedTopics =
      Array.isArray(
        body?.usedTopics
      )
        ? body.usedTopics.map(
            (item) =>
              String(
                item
              ).toUpperCase()
          )
        : [];

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

    if (
      !originalQuestion &&
      !topic
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Falta question o topic",
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

    let conversation =
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

    // Consultas sobre el chip de estado: delegar al router estructurado.
    // No seleccionar otra OOSS ni cambiar el contexto de la conversación.
    if (originalQuestion && !topic && isSocialWorkStatusQuestion(originalQuestion)) {
      const {response, data} = await callAssistantQuery({request,conversationId,question:originalQuestion});
      return Response.json(data, {status:response.status});
    }

    // Excepción para UNA receta nueva sin OOSS explícita. No cambia
    // la persistencia habitual de active_social_work_id.
    const recipeClarification = body?.recipeClarification || null;
    let namedSocialWorkInQuestion = false;

    if (recipeClarification) {
      const action = String(recipeClarification.action || "");
      if (!shouldConfirmNewPrescriptionContext({
        question: originalQuestion,
        activeSocialWorkId: conversation.active_social_work_id,
      }) || !["CONFIRM_ACTIVE", "SELECT_OTHER"].includes(action)) {
        return Response.json({ok:false,code:"INVALID_RECIPE_CLARIFICATION",error:"Confirmación de receta no válida."},{status:400});
      }

      if (action === "CONFIRM_ACTIVE") {
        // Si cambió el contexto mientras había una confirmación pendiente,
        // jamás responder con otra OOSS por accidente.
        if (Number(recipeClarification.expectedSocialWorkId) !== Number(conversation.active_social_work_id)) {
          return Response.json({ok:false,code:"RECIPE_CONTEXT_CHANGED",error:"Cambió la obra social activa. Volvé a consultar la receta."},{status:409});
        }
      } else {
        const candidate = String(recipeClarification.socialWorkName || "").trim();
        if (!candidate || candidate.length > 120) {
          return Response.json({ok:false,code:"RECIPE_SOCIAL_WORK_UNKNOWN",error:"Indicame el nombre de la nueva obra social."},{status:400});
        }
        const detected = await detectSocialWork(candidate);
        if (detected.multiple || !detected.found || !detected.socialWork) {
          return Response.json({ok:false,code:"RECIPE_SOCIAL_WORK_UNKNOWN",error:"No pude identificar esa obra social. Escribí el nombre completo para continuar con la receta."},{status:400});
        }
        const selectedId = Number(detected.socialWork.id);
        if (selectedId !== Number(conversation.active_social_work_id)) {
          await setConversationSocialWork({conversationId,socialWorkId:selectedId});
          conversation = {...conversation,active_social_work_id:selectedId,active_billing_channel_id:null};
        }
      }
    }

    // =====================================================
    // DETECTAR OOSS NOMBRADA
    // =====================================================

    if (originalQuestion && !recipeClarification) {
      const detection =
        await detectSocialWork(
          originalQuestion
        );
      if (detection.unresolvedName) {
        // Nunca cambiar el contexto a una OOSS distinta tras una sigla no reconocida.
        const {response,data} = await callAssistantQuery({request,conversationId,question:originalQuestion});
        return Response.json(data,{status:response.status});
      }

      if (
        detection.multiple
      ) {
        // v3.13.60 — varias obras sociales posibles: lo resuelve el motor de consulta
        // (ofrece las opciones y conserva la pregunta original).
        const {response,data} = await callAssistantQuery({request,conversationId,question:originalQuestion});
        return Response.json(data,{status:response.status});
      }

      if (
        detection.found
      ) {
        namedSocialWorkInQuestion = true;
        const detectedId =
          Number(
            detection
              .socialWork.id
          );

        if (
          detectedId !==
          Number(
            conversation
              .active_social_work_id
          )
        ) {
          await setConversationSocialWork({
            conversationId,
            socialWorkId:
              detectedId,
          });

          conversation = {
            ...conversation,

            active_social_work_id:
              detectedId,

            active_billing_channel_id:
              null,
          };
        }
      }
    }

    const socialWorkId =
      Number(
        conversation
          .active_social_work_id
      );

    // La consulta general de pertenencia Cámara/Colegio no pide una obra social.
    if (originalQuestion && !topic && !recipeClarification && isGeneralBranchCircuitQuestion(originalQuestion)) {
      const { response, data } = await callAssistantQuery({
        request, conversationId, question: originalQuestion,
      });
      return Response.json(data, {status: response.status});
    }

    // =====================================================
    // SI SIGUE SIN OOSS
    // =====================================================

    if (
      !Number.isInteger(
        socialWorkId
      ) ||
      socialWorkId <= 0
    ) {
      // v3.13.66 — «¿Quisiste decir X?» / «¿A cuál te referís?» sin obra social activa:
      // la respuesta («sí», «1», un nombre) la resuelve el motor de consulta con el estado guardado.
      try {
        const { data: stateRow } = await supabaseAdmin.from("conversations")
          .select("conversation_state").eq("id", conversationId).maybeSingle();
        const pendingKind = stateRow?.conversation_state?.pending?.kind;
        if (["CONFIRM_SOCIAL_WORK", "CHOOSE_SOCIAL_WORK", "NEEDS_CHANNEL"].includes(pendingKind)) {
          const { response, data } = await callAssistantQuery({ request, conversationId, question: originalQuestion });
          return Response.json(data, { status: response.status });
        }
      } catch {
        // sin estado guardado: se mantiene el comportamiento anterior
      }
      return Response.json(
        {
          ok: false,

          error:
            "Indicame la obra social que querés consultar.",

          code:
            "SOCIAL_WORK_REQUIRED",
        },
        {
          status: 400,
        }
      );
    }

    const socialWork =
      await loadSocialWork(
        socialWorkId
      );

    // Solo repreguntar si se presentó una receta NUEVA con un dato
    // faltante, sin nombrar otra OOSS. Una continuación normal no repregunta.
    if (!recipeClarification && shouldConfirmNewPrescriptionContext({
      question: originalQuestion,
      activeSocialWorkId: socialWorkId,
      namedSocialWork: namedSocialWorkInQuestion,
      topic,
    })) {
      return Response.json({
        ok: true,
        answer: `¿La receta pertenece a ${socialWork?.name || "la obra social activa"}, la obra social que estás consultando actualmente?`,
        source: "STRUCTURED_CLARIFICATION",
        route: "RECIPE_SOCIAL_WORK_CONFIRMATION",
        found: true,
        context: { conversation_id: conversationId, social_work_id: socialWorkId },
        social_work: socialWork,
        clarification: { original_question: originalQuestion },
        ui: {type: "CONFIRM_SOCIAL_WORK"},
      });
    }

    // =====================================================
    // PLANES
    // =====================================================

    const plans =
      await loadPlans(
        socialWorkId
      );

    const explicitPlan =
      originalQuestion
        ? findPlanInQuestion(
            originalQuestion,
            plans
          )
        : null;

    // =====================================================
    // CONSULTA AMPLIA "REQUISITOS AVALIAN"
    // =====================================================

    if (
      originalQuestion &&
      !topic &&
      isBroadRequirementsQuestion(
        originalQuestion
      ) &&
      plans.length > 0 &&
      !explicitPlan
    ) {
      const options = [
        {
          id:
            "general",

          label:
            "General",

          topic:
            "PLAN_REQUIREMENTS",

          plan: {
            id:
              "general",

            code:
              "GENERAL",

            label:
              "General",
          },
        },

        ...plans.map(
          (item) => ({
            id:
              item.id,

            label:
              item.label,

            topic:
              "PLAN_REQUIREMENTS",

            plan:
              item,
          })
        ),
      ];

      return Response.json({
        ok: true,

        answer:
          `¿Sobre qué plan de ${socialWork?.name || "esta obra social"} querés consultar?`,

        source:
          "STRUCTURED_CLARIFICATION",

        route:
          "PLAN_CLARIFICATION",

        found:
          true,

        context: {
          conversation_id:
            conversationId,

          branch_id:
            conversation.branch_id,

          device_id:
            conversation.device_id,

          social_work_id:
            socialWorkId,

          billing_channel_id:
            null,

          user_id:
            conversation.user_id,
        },

        social_work:
          socialWork,

        ui: {
          type:
            "OPTIONS",

          options,
        },
      });
    }

    // =====================================================
    // CONSTRUIR CONSULTA EFECTIVA
    // =====================================================

    let effectiveQuestion =
      originalQuestion;

    // Una respuesta "Sí" o la selección de otra OOSS solo CONFIRMA el contexto.
    // Para resolver la receta sin fecha/firma/etc. consultamos requisitos normativos,
    // sin volver a clasificar "¿la puedo recibir?" como recepción por circuito.
    if (recipeClarification && !topic) {
      effectiveQuestion = buildConfirmedMissingFieldQuestion({
        question: originalQuestion,
        socialWorkName: socialWork?.name,
      }) || originalQuestion;
    }

    if (topic) {
      /*
       * Follow-up determinístico.
       *
       * RECIPE_REQUIREMENTS no debe convertirse en una pregunta
       * que pueda ser interpretada como un único campo (por ejemplo
       * vigencia). Pedimos explícitamente el conjunto de requisitos.
       */
      if (topic === "RECIPE_REQUIREMENTS") {
        effectiveQuestion =
          "Detallá todos los requisitos generales que debe contener o cumplir la receta para esta obra social. " +
          "Incluí solamente requisitos respaldados por la normativa vigente. " +
          "Si la normativa distingue receta física, manuscrita, digital o electrónica, indicá esas diferencias. " +
          "No respondas solamente vigencia, cobertura, facturación o presentación.";
      } else {
        effectiveQuestion =
          buildTopicQuestion({
            topic,

            planLabel:
              plan?.label ||
              explicitPlan?.label ||
              null,
          });
      }

      if (
        !effectiveQuestion
      ) {
        return Response.json(
          {
            ok: false,

            error:
              "Topic inválido",

            code:
              "INVALID_TOPIC",
          },
          {
            status: 400,
          }
        );
      }
    } else if (
      explicitPlan
    ) {
      effectiveQuestion =
        `${originalQuestion}. La consulta corresponde específicamente al plan ${explicitPlan.label}.`;
    }

    // =====================================================
    // ROUTER ACTUAL
    // =====================================================

    const {
      response,
      data,
    } =
      await callAssistantQuery({
        request,

        conversationId,

        question:
          effectiveQuestion,
      });

    if (
      !response.ok ||
      data?.ok === false
    ) {
      return Response.json(
        data,
        {
          status:
            response.status,
        }
      );
    }

    // =====================================================
    // FOLLOW-UP ESTRUCTURADO
    // =====================================================

    let answer =
      String(
        data?.answer ||
          ""
      ).trim();

    const followUp =
      extractFollowUp(
        answer
      );

    let ui = null;

    if (followUp) {
      const followUpTopic =
        classifyFollowUpTopic(
          followUp
        );

      /*
       * Sacamos la pregunta del texto.
       * La mostramos separada con botones.
       */
      answer =
        stripFollowUp(
          answer,
          followUp
        );

      if (
        followUpTopic &&
        !usedTopics.includes(
          followUpTopic
        )
      ) {
        ui = {
          type:
            "YES_NO",

          prompt:
            followUp,

          yes: {
            topic:
              followUpTopic,
          },

          no: {
            action:
              "DISMISS",
          },
        };
      }
    }

    // v3.13.82 — «¿Quisiste decir…?» / «¿Cuál de estas obras sociales?»: opciones como botones.
    if (!ui && Array.isArray(data?.suggestion?.options) && data.suggestion.options.length > 0 &&
        ["UNKNOWN_EXPLICIT_SOCIAL_WORK", "AMBIGUOUS_SOCIAL_WORK"].includes(data?.route)) {
      ui = {
        type: "CHOICES",
        prompt: "Elegí la obra social:",
        options: data.suggestion.options.slice(0, 5).map((name, index) => ({ id: `choice-${index}`, label: String(name) })),
      };
    }

    return Response.json({
      ...data,

      answer,

      ui,

      social_work:
        socialWork,

      selected_plan:
        plan ||
        explicitPlan ||
        null,
    });
  } catch (error) {
    console.error(
      "assistant chat error:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "Error interno del asistente",

        code:
          "ASSISTANT_CHAT_ERROR",
      },
      {
        status: 500,
      }
    );
  }
}