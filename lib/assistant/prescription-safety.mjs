/** GDPSoft: reglas determinísticas para consultas amplias y lectura visual prudente. */
const normalize = (value = "") => String(value)
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** Una lista completa de requisitos nunca debe resolverse con un solo campo de Ficha. */
export function asksForPrescriptionChecklist(question = "") {
  const q = normalize(question);
  // GDP_FIX_SUBTEMA_RECETA_31372: los anexos no son checklists generales.
  if (/\b(?:vacun\w*|antigripal\w*|diabet\w*|insulin\w*|cronic\w*|tiras\s+reactivas|pmi|materno\s+infantil)\b/.test(q)) return false;
  if (!/\breceta(?:s|rio)?\b/.test(q)) return false;
  const wantsRequirements = /\brequisit|\bdatos obligatorios\b|\bdebe contener\b|\bdebe tener\b|\blista de control\b|\bchecklist\b|\bcontroles de la receta\b/.test(q);
  if (!wantsRequirements) return false;
  // Las preguntas puntuales conservan su ruta habitual.
  const broadRequest = /\b(todos|todas|generales|completo|completa|listado|lista de control)\b/.test(q);
  const onlyField = /\b(?:solo|solamente|unicamente|especificamente)\b.{0,45}\b(vigencia|rp|diagnostico|membrete|matricula|firma|sello|monodroga|sustitucion)\b/.test(q);
  return broadRequest || !onlyField;
}

const HANDWRITTEN_CRITICAL = new Set([
  "patient_name", "affiliate_number", "prescription_date", "doctor_name",
  "doctor_registration_number", "active_ingredient", "medication_name",
  "concentration", "dosage", "quantity", "presentation", "authorization_number",
  "prescription_number", "diagnosis",
]);

/** Ante un campo clínico/identificatorio incierto, nunca calcular aptitud desde la foto. */
export function needsManualPrescriptionReview(analysis = {}) {
  if (analysis.document_type && !["prescription", "unknown"].includes(analysis.document_type)) return true;
  const confirmed = Array.isArray(analysis.confirmed_fields) ? analysis.confirmed_fields : [];
  const uncertain = Array.isArray(analysis.uncertain_fields) ? analysis.uncertain_fields : [];
  if (!confirmed.length) return true;
  return uncertain.some((item) => HANDWRITTEN_CRITICAL.has(item?.field));
}

/** Texto de Ficha, sin convertir campos opcionales en obligatorios ni inventar valores. */
export function buildFichaPrescriptionChecklist(ficha = null) {
  if (!ficha) return [];
  const fields = [
    ["recipe_type", "Tipo de receta admitido"],
    ["recipe_validity_days", "Vigencia registrada (días)"],
    ["letterhead", "Membrete"],
    ["rp", "Límite de RP por receta"],
    ["diagnosis", "Diagnóstico"],
    ["monodrug", "Monodroga"],
    ["commercial_name", "Nombre comercial"],
    ["substitution", "Sustitución"],
    ["observations", "Observaciones"],
  ];
  return fields.flatMap(([key, label]) => {
    const raw = ficha[key];
    if (raw == null || String(raw).trim() === "") return [];
    return [`• ${label}: ${String(raw).trim()}`];
  });
}

export function buildUncertainPrescriptionReply({ socialWorkName = null, ficha = null, circuitWarning = null } = {}) {
  const intro = "No puedo interpretar con suficiente certeza todos los datos de esta receta. No puedo confirmar si se puede recibir o dispensar.";
  if (!socialWorkName) {
    return `${intro}\n\n¿Me indicás la obra social? Así te muestro qué requisitos debés verificar manualmente, según su Recordá/Ficha y normativa vigente.`;
  }
  const lines = buildFichaPrescriptionChecklist(ficha);
  return [
    intro,
    `\nPara ${socialWorkName}, estos son los datos disponibles en Recordá/Ficha para controlar manualmente:`,
    ...(lines.length ? lines : ["• No hay campos suficientes cargados en Recordá/Ficha."]),
    circuitWarning ? `\n${circuitWarning}` : "",
    "\nEste listado corresponde únicamente a Recordá/Ficha; puede ser incompleto. Revisá también la normativa vigente, el plan, el circuito (Cámara/Colegio) y los datos ilegibles directamente en la receta. No sustituye la validación del colaborador.",
  ].filter(Boolean).join("\n");
}

/** Consulta por una receta con datos faltantes, no sobre el circuito de la sucursal. */
export function isPrescriptionMissingFieldQuestion(question = '') {
  const q = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\b(receta|recetas|recetario|prescripcion)\b/.test(q)) return false;
  const missing = /\b(sin|falta|faltan|no tiene|no figura|no aparece|carece de)\s+(?:(?:la|el|una|un|los|las)\s+)?(?:fecha(?: de prescripcion)?|firma|sello|matricula|diagnostico|dni|numero de afiliado|datos del afiliado)\b/.test(q);
  if (!missing) return isPrescriptionObservationContentQuestion(question);
  return /\b(puedo|podemos|recib|acept|dispens|valid|permit|debo|hago|corresponde|rechaz)\w*\b/.test(q);
}

/**
 * v3.13.38 — «tengo una receta de X que tiene el nombre de la obra social en
 * observaciones, ¿puedo recibirla?»: pregunta por el CONTENIDO de la receta
 * (dato escrito en un campo), no por si la sucursal recibe esa obra social.
 */
export function isPrescriptionObservationContentQuestion(question = '') {
  const q = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\b(receta|recetas|recetario|prescripcion)\b/.test(q)) return false;
  if (!/\b(?:en|dentro de|figura en|aparece en|escrit[oa] en|anotad[oa] en|dice en)\s+(?:el\s+campo\s+(?:de\s+)?)?(?:las?\s+)?observaci/.test(q)) return false;
  return /\b(puedo|podemos|recib|acept|dispens|valid|permit|debo|hago|corresponde|rechaz|sirve|es valida)\w*\b/.test(q);
}

/** Conserva la pregunta sobre el requisito faltante en la normativa de la OOSS confirmada. */
export function buildMissingFieldNormativeQuestion({question, socialWorkName} = {}) {
  const name = String(socialWorkName || '').trim();
  if (!name) return null;
  if (isPrescriptionObservationContentQuestion(question)) {
    return `Para la obra social ${name} (contexto activo), evaluá esta consulta: "${question}". ` +
      `El colaborador pregunta por el DATO escrito en el campo Observaciones de la receta, ` +
      `no si la sucursal atiende la obra social. Buscá en la normativa vigente de ${name} ` +
      `qué indica sobre ese caso (si la receta es válida, qué debe constar o cómo proceder). ` +
      `NO respondas sobre circuito Cámara/Colegio. Si no hay respaldo documental, decilo y derivá a revisión.`;
  }
  return `Para la obra social ${name} (contexto activo), evaluá esta consulta: "${question}". ` +
    `Buscá si la normativa vigente de ${name} exige el dato faltante mencionado ` +
    `y si especifica cómo proceder cuando no está. Respondé únicamente sobre ` +
    `esa omisión; NO confundas aptitud de la receta con circuito Cámara/Colegio. ` +
    `Si no existe respaldo documental, no autorices la recepción y derivá para revisión.`;
}

