// v3.13.102e — Divide un texto en partes de texto y enlaces (solo http/https) para mostrar enlaces clickeables en el chat.
// Función pura: el componente decide cómo dibujarlos; nunca se inserta HTML.
const URL_RE = /https?:\/\/[^\s<>"'«»]+/gi;
const TRAILING = /[.,;:!?)\]}»”"']+$/;

// Texto que se muestra para un enlace: nombres claros para los conocidos y, si es largo, solo el sitio (el destino sigue siendo el enlace completo).
export function linkLabel(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  if (/(^|\.)farmalive\.com\.ar$/i.test(host)) return 'Abrir vademécum de Farmalive';
  return url.length > 40 ? host : url;
}

export function splitLinks(input) {
  const text = String(input ?? '');
  const parts = []; let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]; const trail = (url.match(TRAILING) || [''])[0];
    if (trail) url = url.slice(0, -trail.length);
    if (!url || !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) continue;
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'link', value: url, href: url, label: linkLabel(url) });
    last = m.index + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}
