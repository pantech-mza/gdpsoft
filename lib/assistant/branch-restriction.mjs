// v3.13.133 — observaciones de la obra social que la excluyen de un circuito («NO COLEGIO», «Solo sucursales de Cámara»).
// Si la sucursal que consulta es de COLEGIO y la obra social tiene esa observación aprobada, la respuesta lo avisa SIEMPRE,
// aunque la pregunta sea sobre otra cosa (p. ej. «¿hay que hacer declaración de dispensa?»), y la reemplaza: no se explica cómo tramitar algo que la sucursal no recibe.
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
  return `ATENCIÓN. Según las observaciones cargadas,${name} NO se recibe en sucursales de Colegio (solo en Cámara). Tu sucursal es de Colegio: si el afiliado se presenta, realizá el circuito Cámara–Colegio.`;
}

// v3.13.144 — Provincia ART en sucursales de COLEGIO: figura inactiva en Colegio y se tramita SOLO por el circuito Cámara–Colegio
// (cliente, 30/10). Si la respuesta del motor trae otro validador (COFA, FACAF) o explica el circuito a su manera,
// esas oraciones se reemplazan por la línea oficial; los requisitos (topes, tipo de receta) se conservan.
export const PROVINCIA_ART_COLEGIO_LINE = (branchLabel) =>
  `En ${branchLabel || 'tu sucursal'}, Provincia ART figura inactiva en Colegio, pero podés realizarla por el circuito Cámara–Colegio. En tu sucursal tramitala como circuito de Cámara para evitar rechazos.`;
const PROVINCIA_RE = /provincia\s*art/;
const VALIDATOR_OR_CIRCUIT = /cofa|facaf|c[aá]mara\s*[–-]\s*colegio|circuito|deriv/i;

export function withProvinciaArtColegio({ answer = '', route = '', circuit = null, workName = '', branchLabel = '' } = {}) {
  if (String(circuit || '').toUpperCase() !== 'COLEGIO') return null;
  if (!PROVINCIA_RE.test(fold(workName))) return null;
  if (SKIP_ROUTES.test(String(route))) return null;
  const text = String(answer || '');
  if (!text.trim() || /NO se recibe en sucursales de Colegio/.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¡¿])/);
  if (!sentences.some((s) => VALIDATOR_OR_CIRCUIT.test(s))) return null;
  const kept = sentences.filter((s) => !VALIDATOR_OR_CIRCUIT.test(s));
  return [PROVINCIA_ART_COLEGIO_LINE(branchLabel), ...kept].join(' ');
}

// v3.13.145 — obras sociales que en una sucursal se reciben "directo" con una línea declarada por política
// (OSTES, OSPAV, LUIS PASTEUR, OSFYHC en Colegio: «se recibe directo y se valida por dentro, por TYS»).
// Si el motor redacta otra cosa sobre el circuito/validador, esas oraciones se reemplazan por la línea oficial.
const CIRCUIT_SENTENCE = /circuito|validador|deriv|c[aá]mara|colegio|procedimiento|sin\s+circuito|habitual/i;
export function withPolicyLine({ answer = '', route = '', line = '', marker = '' } = {}) {
  if (!line) return null;
  if (SKIP_ROUTES.test(String(route))) return null;
  const text = String(answer || '');
  if (!text.trim() || /NO se recibe en sucursales de Colegio/.test(text)) return null;
  if (marker && fold(text).includes(fold(marker))) return null;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚ¡¿])/);
  if (!sentences.some((s) => CIRCUIT_SENTENCE.test(s))) return null;
  return [line, ...sentences.filter((s) => !CIRCUIT_SENTENCE.test(s))].join(' ');
}
