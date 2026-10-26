// v3.13.102c — Enlace al vademécum actualizado (farmalive) al final de las respuestas de OSEP-OYTE sobre medicamentos.
export const VADEMECUM_URL = 'https://www.farmalive.com.ar/index.asp';
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// OYTE es un PLAN de OSEP (variante), no una obra social aparte: se acepta el nombre completo ("OSEP OYTE") o la obra social OSEP
// con la variante OYTE detectada en la consulta o heredada de la conversación.
export const isOsepOyte = (name, variant = null) => { const f = fold(name);
  if (/\boyte\b/.test(f) && /\bosep\b/.test(f)) return true;
  return /\bosep\b/.test(f) && String(variant || '').toUpperCase() === 'OYTE'; };
// Pregunta o respuesta que habla de medicamentos, cobertura de productos o presentaciones.
export const mentionsMedication = (text) => /(medicament|remedio|vademecum|vademec|droga|monodroga|principio activo|presentacion|marca|comercial|cobertura|descuento|genérico|generico|laboratorio|troquel)/.test(fold(text));

export function vademecumLine({ socialWorkName, question, answer, variant = null }) {
  if (!isOsepOyte(socialWorkName, variant)) return null;
  if (!mentionsMedication(question) && !mentionsMedication(answer)) return null;
  if (String(answer || '').includes('farmalive.com.ar')) return null;
  return `Vademécum actualizado (consultar cobertura de medicamentos): ${VADEMECUM_URL}`;
}

export function withVademecum(json, { variant = null } = {}) {
  if (!json || json.ok !== true || json.found !== true || typeof json.answer !== 'string') return null;
  const line = vademecumLine({ socialWorkName: json.social_work?.name, question: json.question, answer: json.answer_plain || json.answer, variant });
  if (!line) return null;
  const add = (s) => (typeof s === 'string' && s.trim() ? `${s.replace(/\s+$/, '')}\n\n${line}` : s);
  return { ...json, answer: add(json.answer), ...(typeof json.answer_plain === 'string' ? { answer_plain: add(json.answer_plain) } : {}) };
}
