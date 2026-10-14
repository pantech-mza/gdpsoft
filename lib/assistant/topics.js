// =========================================================
// GDPSoft - Catálogo central de topics del asistente
// =========================================================

export const ASSISTANT_TOPICS = {
  RECIPE_REQUIREMENTS: {
    key: "RECIPE_REQUIREMENTS",
    label: "Requisitos de receta",

    buildQuestion({ planLabel } = {}) {
      const planText =
        planLabel &&
        planLabel !== "General"
          ? ` para el plan ${planLabel}`
          : "";

      return [
        `Mostrame únicamente los requisitos que debe contener o cumplir una receta${planText}.`,
        "No agregues vigencia, presentación, cobertura, topes, validación, facturación, cierre ni auditoría.",
        "No agregues información de otros temas.",
      ].join(" ");
    },
  },

  PLAN_REQUIREMENTS: {
    key: "PLAN_REQUIREMENTS",
    label: "Requisitos del plan",

    buildQuestion({ planLabel } = {}) {
      if (
        !planLabel ||
        planLabel === "General"
      ) {
        return [
          "Mostrame únicamente los requisitos generales aplicables.",
          "Separá claramente los requisitos operativos de cualquier información adicional.",
          "No desarrolles temas no solicitados.",
        ].join(" ");
      }

      return [
        `Mostrame únicamente los requisitos aplicables al plan ${planLabel}.`,
        `La consulta es específicamente sobre ${planLabel}.`,
        "No mezcles otros planes.",
        "No agregues información general que no sea necesaria para operar este plan.",
      ].join(" ");
    },
  },

  RECIPE_VALIDITY: {
    key: "RECIPE_VALIDITY",
    label: "Vigencia de receta",

    buildQuestion({ planLabel } = {}) {
      return [
        "Indicame únicamente la vigencia o validez de la receta.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No agregues requisitos, presentación, cobertura ni otros temas.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  PRESENTATION_REQUIREMENTS: {
    key:
      "PRESENTATION_REQUIREMENTS",

    label:
      "Presentación de recetas",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente los requisitos específicos para la presentación de las recetas.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No repitas los requisitos generales que debe contener una receta.",
        "Respondé solamente sobre preparación, orden, carátula, detalle, troqueles, tickets, adhesión, formato, legibilidad, documentación y envío.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  ELECTRONIC_PRESCRIPTIONS: {
    key:
      "ELECTRONIC_PRESCRIPTIONS",

    label:
      "Recetas electrónicas",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente el procedimiento y los requisitos específicos de las recetas electrónicas.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No repitas los requisitos generales que debe contener una receta.",
        "Respondé solamente con reglas específicas sobre receta electrónica, impresión, tickets, troqueles, hoja A4, cierre, documentación, envío, validación o auditoría.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  VALIDATION: {
    key: "VALIDATION",
    label: "Validación",

    buildQuestion({ planLabel } = {}) {
      return [
        "Detallame únicamente cómo se realiza la validación.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No agregues presentación, auditoría, facturación ni requisitos generales salvo que sean indispensables para realizar la validación.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  AUTHORIZATION: {
    key: "AUTHORIZATION",
    label: "Autorizaciones",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente cómo funcionan las autorizaciones y cuándo son necesarias.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No agregues otros temas salvo que sean indispensables.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  COVERAGE: {
    key: "COVERAGE",
    label: "Cobertura",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente la cobertura o descuento aplicable.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "Conservá exactamente los porcentajes.",
        "No agregues requisitos generales si no fueron solicitados.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  LIMITS: {
    key: "LIMITS",
    label: "Topes y límites",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente los topes, límites, cantidades, renglones o envases aplicables.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No agregues requisitos generales de receta.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  BILLING: {
    key: "BILLING",
    label: "Facturación",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente el procedimiento de facturación aplicable.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No agregues información de otros circuitos salvo que sea indispensable.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  AUDIT: {
    key: "AUDIT",
    label: "Auditoría",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente los controles y requisitos de auditoría relacionados con la consulta.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No repitas requisitos generales de receta ni presentación salvo que sean indispensables para explicar un control.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },

  EXCEPTIONS: {
    key: "EXCEPTIONS",
    label: "Excepciones",

    buildQuestion({ planLabel } = {}) {
      return [
        "Mostrame únicamente las excepciones aplicables.",
        planLabel &&
        planLabel !== "General"
          ? `La consulta corresponde al plan ${planLabel}.`
          : "",
        "No repitas la información general ya explicada.",
      ]
        .filter(Boolean)
        .join(" ");
    },
  },
};

// =========================================================
// OBTENER TOPIC
// =========================================================

export function getAssistantTopic(
  key
) {
  if (!key) {
    return null;
  }

  return (
    ASSISTANT_TOPICS[
      String(key)
        .trim()
        .toUpperCase()
    ] || null
  );
}

// =========================================================
// CONSTRUIR PREGUNTA PARA EL ROUTER EXISTENTE
// =========================================================

export function buildTopicQuestion({
  topic,
  planLabel = null,
}) {
  const definition =
    getAssistantTopic(
      topic
    );

  if (!definition) {
    return null;
  }

  return definition.buildQuestion({
    planLabel,
  });
}