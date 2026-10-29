// v3.13.133 — observaciones de la obra social que la excluyen de un circuito («NO COLEGIO», «Solo sucursales de Cámara»).
// Si la sucursal que consulta es de COLEGIO y la obra social tiene esa observación aprobada, la respuesta lo avisa SIEMPRE,
// aunque la pregunta sea sobre otra cosa (p. ej. «¿hay que hacer declaración de dispensa?»).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const NO_COLEGIO = /\bno\s+(?:se\s+recibe\s+en\s+)?(?:las\s+)?(?:sucursales?\s+de\s+)?colegio\b/;
const SOLO_CAMARA = /\bsolo\s+(?:para\s+|en\s+|las\s+)?sucursales?\s+de\s+camara\b/;
const SKIP_ROUTES = /COURTESY|CLARIFICATION|AMBIGUOUS|UNKNOWN_EXPLICIT|INACTIVE_SOCIAL_WORK|CREDENTIALS|AFFILIATE_LIST/i;

export function colegioRestrictionFromNotes(notes = []) {
  return (notes || []).some((n) => {
    const t = fold(n?.body ?? n?.text ?? n);
    return NO_COLEGIO.test(t) || SOLO_CAMARA.test(t);
  });
}

export function withColegioRestriction({ answer = '', route = '', circuit = null, workName = '', hasRestriction = false } = {}) {
  if (!hasRestriction || String(circuit || '').toUpperCase() !== 'COLEGIO') return null;
  if (SKIP_ROUTES.test(String(route))) return null;
  const a = fold(answer);
  if (!a.trim() || /no se recibe en sucursales de colegio/.test(a)) return null;
  const name = workName ? ` ${workName}` : ' esta obra social';
  return `⚠️ Atención: según las observaciones cargadas,${name} NO se recibe en sucursales de Colegio (solo en Cámara). Tu sucursal es de Colegio: si el afiliado se presenta, no la dispenses y derivalo a una sucursal de Cámara.\n\n${answer}`;
}
