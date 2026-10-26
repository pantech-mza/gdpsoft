// v3.13.102g — Los nombres de validadores que aparecen en las respuestas se muestran como enlaces a su sitio.
// Tabla simple y revisable: cada validador con las formas en que se lo nombra y su dirección.
import { splitLinks } from './linkify.mjs';

export const VALIDATORS = Object.freeze([
  { key: 'ADMIFARM', display: 'Admifarm', url: 'https://gdr.admifarmgroup.com/Login.aspx?ReturnUrl=%2f', re: /\b(?:admi(?:ni)?farm(?:\s+group)?|admi\s+farm)\b/gi },
  { key: 'DIDIO', display: 'DIDIO', url: 'http://www.didiosistemas.com.ar/', re: /\bdidio(?:\s+sistemas)?\b/gi },
  { key: 'MIS VALIDACIONES', display: 'Mis Validaciones', url: 'https://www.misvalidaciones.com.ar/', re: /\bmis\s*validaciones\b/gi },
  { key: 'GMS', display: 'GMS', url: 'http://farmaciasnet.gmssa.com.ar/User/Login?ReturnUrl=%2f', re: /\bgms\b/gi },
  { key: 'FACAF', display: 'FACAF', url: 'https://sinvaladmin.ddaval.com.ar/', re: /\b(?:facaf|sinval)\b/gi },
  // Solo en mayúsculas (como figura el validador): la palabra "compañía" en una frase común no se convierte en enlace.
  { key: 'COMPAÑIA', display: 'Compañia', url: 'https://www.plataformacsf.com/login.xhtml', re: /\bCOMPA[ÑN][IÍ]A\b/g },
  { key: 'IMED', display: 'IMED', url: 'https://www.imed.com.ar/autorizadorweb', re: /\bimed\b/gi },
  { key: 'COFA', display: 'COFA', url: 'https://principal.cofa.org.ar/', re: /\bcofa\b/gi },
]);

function splitText(text) {
  const hits = [];
  for (const v of VALIDATORS) for (const m of text.matchAll(v.re)) hits.push({ start: m.index, end: m.index + m[0].length, value: m[0], v });
  hits.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts = []; let last = 0;
  for (const h of hits) {
    if (h.start < last) continue; // solapados: gana el primero
    if (h.start > last) parts.push({ type: 'text', value: text.slice(last, h.start) });
    parts.push({ type: 'link', value: h.value, href: h.v.url, label: h.value, kind: 'validator' });
    last = h.end;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
// Si una dirección escrita en el texto es de un validador conocido, se muestra con su nombre corto (el destino sigue siendo la dirección completa).
function displayForUrl(href) {
  const h = hostOf(href); if (!h) return null;
  const v = VALIDATORS.find((x) => { const vh = hostOf(x.url); return vh && (h === vh || h.endsWith('.' + vh) || vh.endsWith('.' + h.split('.').slice(-3).join('.'))); });
  return v ? v.display : null;
}

/** Direcciones escritas en el texto + nombres de validadores conocidos, todo como enlaces. */
export function splitWithValidators(input) {
  const out = [];
  for (const p of splitLinks(input)) { if (p.type === 'link') out.push({ ...p, label: displayForUrl(p.href) || p.label }); else out.push(...splitText(p.value)); }
  return out;
}
