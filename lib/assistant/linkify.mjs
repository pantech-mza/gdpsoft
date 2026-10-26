// v3.13.102e — Divide un texto en partes de texto y enlaces (solo http/https) para mostrar enlaces clickeables en el chat.
// Función pura: el componente decide cómo dibujarlos; nunca se inserta HTML.
const URL_RE = /https?:\/\/[^\s<>"'«»]+/gi;
const TRAILING = /[.,;:!?)\]}»”"']+$/;

export function splitLinks(input) {
  const text = String(input ?? '');
  const parts = []; let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    let url = m[0]; const trail = (url.match(TRAILING) || [''])[0];
    if (trail) url = url.slice(0, -trail.length);
    if (!url || !/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(url)) continue;
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'link', value: url, href: url });
    last = m.index + url.length;
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
  return parts.length ? parts : [{ type: 'text', value: text }];
}
