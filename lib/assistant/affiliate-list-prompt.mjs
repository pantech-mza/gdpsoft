// v3.13.128 — «lista de afiliado» / «padrón» sin DNI: en lugar de «no encontré información», se pregunta por el afiliado.
// Con DNI en la pregunta no actúa: sigue el flujo normal (que busca el DNI en el listado cargado).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function isAffiliateListQuestionWithoutDni(question = '') {
  const q = fold(question).replace(/(\d)[.\s](?=\d)/g, '$1');
  if (/\b\d{6,9}\b/.test(q)) return false;
  const words = q.split(/\s+/).filter(Boolean).length;
  if (words > 14) return false;
  const person = /\b(?:afiliad[oa]s?|socios?|beneficiari[oa]s?|paciente)\b/;
  const list = /\b(?:lista|listas|listado|listados|padron|nomina)\b/;
  return (person.test(q) && list.test(q)) || /\b(?:lista|listado|padron)\s+de\s+(?:afiliad|socio|beneficiari)/.test(q);
}

export function buildAffiliateListPrompt(workName) {
  const name = String(workName || '').trim();
  return `¿Qué necesitás saber del afiliado? Si querés saber si se encuentra en el listado${name ? ` de ${name}` : ''}, indicame su DNI y lo verifico.`;
}

export const AFFILIATE_PROMPT_MARKER = 'indicame su DNI y lo verifico';

/** Respuesta con SOLO el DNI (con o sin puntos) justo después de nuestra pregunta: se arma la consulta completa. */
export function dniReplyToQuestion(question = '', lastAnswer = '', workName = '') {
  if (!String(lastAnswer || '').includes(AFFILIATE_PROMPT_MARKER)) return null;
  const digits = String(question).trim().replace(/^(?:dni|d\.n\.i\.?)[:\s]*/i, '').replace(/[.\s]/g, '');
  if (!/^\d{6,9}$/.test(digits)) return null;
  return `me indicarías si el afiliado con el dni ${digits} se encuentra en el listado de ${workName || 'esta obra social'}`.trim();
}
