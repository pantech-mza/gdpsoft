// v3.13.100 — Detección de padrones (listas de personas) y limpieza de texto antes de guardarlo.
// Un padrón se reconoce por la cantidad de números de documento (7–8 dígitos): una norma operativa normal
// casi no los tiene.
export function looksLikeRoster(text, threshold = 25) {
  const m = String(text ?? '').match(/(?<![\d.,/-])\d{7,8}(?![\d.,/-])/g);
  return (m ? m.length : 0) > threshold;
}
// Quita caracteres que la base no acepta (nulo, surrogates sueltos).
export function cleanText(text) {
  return String(text ?? '').replace(/\u0000/g, '').replace(/[\uD800-\uDFFF]/g, '');
}
