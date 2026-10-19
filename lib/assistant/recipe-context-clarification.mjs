/**
 * Detección autocontenida para la confirmación de una receta NUEVA.
 * No depende de exports añadidos a prescription-safety en otra versión;
 * solo se usa como condición adicional a "introducesNewPrescription".
 */
function isPrescriptionMissingFieldQuestion(question = '') {
  const q = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  if (!/\b(receta|recetas|recetario|prescripcion)\b/.test(q)) return false;
  const missing = /\b(sin|falta|faltan|no tiene|no figura|no aparece|carece de)\s+(?:(?:la|el|una|un|los|las)\s+)?(?:fecha(?: de prescripcion)?|firma|sello|matricula|diagnostico|dni|numero de afiliado|datos del afiliado)\b/.test(q);
  if (!missing) return false;
  return /\b(puedo|podemos|recib|acept|dispens|valid|permit|debo|hago|corresponde|rechaz)\w*\b/.test(q);
}

/**
 * Excepción acotada: el colaborador presenta UNA receta nueva sin mencionar OOSS.
 * El resto del diálogo mantiene la OOSS activa sin pedir confirmación.
 */
export function shouldConfirmNewPrescriptionContext({
  question = '', activeSocialWorkId = null, namedSocialWork = false, topic = null,
} = {}) {
  if (!Number.isInteger(Number(activeSocialWorkId)) || Number(activeSocialWorkId) <= 0) return false;
  if (namedSocialWork || topic) return false;
  const normalized = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  const introducesNewPrescription = /\b(?:tengo|tenemos|me trajeron|nos trajeron|me dieron|me presentaron|vino)\s+(?:(?:una|esta|la)\s+)?receta\b/.test(normalized);
  return introducesNewPrescription && isPrescriptionMissingFieldQuestion(question);
}

/** Respuestas de confirmación. No interpreta «sí» como aceptación de receta. */
export function interpretPrescriptionContextReply(text = '') {
  const cleaned = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[.!?¿¡]/g, '').trim();
  if (/^(si|s|si es la misma|es la misma|si es esa)$/.test(cleaned)) return 'CONFIRM_ACTIVE';
  if (/^(no|n|otra|otra obra social|es otra)$/.test(cleaned)) return 'ASK_OTHER';
  return 'SELECT_OTHER';
}

/**
 * Al confirmar una receta nueva, transformar la consulta ORIGINAL en una
 * pregunta de requisito normativo sobre el campo ausente. No transmite
 * "¿la puedo recibir?" al router de circuitos. El contexto de OOSS se
 * determina en servidor, no a partir de la respuesta "Sí".
 */
export function buildConfirmedMissingFieldQuestion({ question = '', socialWorkName = '' } = {}) {
  if (!isPrescriptionMissingFieldQuestion(question)) return null;
  const name = String(socialWorkName || '').trim();
  if (!name || name.length > 160) return null;
  const q = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const fields = [
    [/\bfecha(?:\s+de\s+prescripcion)?\b/, 'fecha de prescripción'],
    [/\bfirma\b/, 'firma del profesional'],
    [/\bsello\b/, 'sello del profesional'],
    [/\bmatricula\b/, 'matrícula del profesional'],
    [/\bdiagnostico\b/, 'diagnóstico'],
    [/\bdni\b/, 'DNI'],
    [/\bnumero\s+de\s+afiliado\b/, 'número de afiliado'],
    [/\bdatos\s+del\s+afiliado\b/, 'datos del afiliado'],
  ];
  const missing = fields.find(([pattern]) => pattern.test(q))?.[1];
  if (!missing) return null;
  return `Consulta normativa de receta para ${name}: falta ${missing} en una receta nueva. ` +
    `Según la normativa vigente de ${name}, indicá si ese dato es obligatorio y qué hacer cuando falta. ` +
    `Si no hay evidencia confirmada, indicá que se requiere revisión administrativa. ` +
    `No resuelvas esta consulta mediante el circuito de sucursal ni autorices dispensación sin respaldo.`;
}
