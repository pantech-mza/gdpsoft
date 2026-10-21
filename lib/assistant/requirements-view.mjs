// GDPSoft v3.13.68 — «Requisitos de receta» en formato corto con pestañas.
// Solo reordena lo que ya devolvieron la Ficha y la normativa: no agrega ni inventa requisitos.
// El texto guardado sigue siendo legible (Actividad / Validar respuestas) y la pantalla lo muestra en pestañas.

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const FICHA_LABELS = [
  [/^tipo de receta/, 'Tipo'],
  [/^vigencia/, 'Vigencia'],
  [/^membrete/, 'Membrete'],
  [/^limite de rp|^rp/, 'RP por receta'],
  [/^diagnostico/, 'Diagnóstico'],
  [/^monodroga/, 'Monodroga'],
  [/^nombre comercial/, 'Nombre comercial'],
  [/^sustitucion/, 'Sustitución'],
];

export function shortenFichaLines(lines = []) {
  const out = [];
  for (const raw of lines) {
    const m = String(raw).replace(/^[•\-*\s]+/, '').match(/^([^:]{2,60}):\s*(.+)$/);
    if (!m) continue;
    const key = fold(m[1]).trim();
    if (key.startsWith('observaciones')) continue; // texto libre: no va en la tarjeta
    const hit = FICHA_LABELS.find(([re]) => re.test(key));
    if (!hit) continue;
    let value = m[2].trim();
    if (hit[1] === 'Vigencia' && /^\d+$/.test(value)) value = `${value} días`;
    out.push({ label: hit[1], value });
  }
  return out;
}

const BILLING = /(factur|ticket|troquel|precio|valor sugerido|alfabeta|kairos|pre-?auditor|archivo digital|numero de orden|fecha de venta|sello y firma de la farmacia|firma del afiliado|datos a completar por la farmacia|copia del ticket|presentaci[oo]n de|rendici)/;
const QUANTITIES = /(envase|tamano|rengl[oo]n|\bgrande\b|menor valor|inmediato inferior|unidades por|cantidad maxima|maximo de)/;
const ALERT = /(motivo de debito|\bdebito\b|obligatori|bajo ninguna|no se (?:acepta|dispensa|recibe))/;

/** Lista plana de requisitos a partir de la respuesta de la normativa (numerada, con viñetas o en prosa). */
export function extractRequirementEntries(answer = '') {
  const entries = [];
  let heading = '';
  for (const rawLine of String(answer).replace(/\r/g, '').split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    line = line.replace(/^(?:[-•*✓✔]\s+|\d{1,2}[.)]\s+)/, '').replace(/\*\*/g, '').replace(/__/g, '').trim();
    if (!line) continue;
    if (/^paso\s+\d+/i.test(line)) continue;
    if (/^(?:a continuaci[oó]n|para aceptar una receta|los requisitos|se deben cumplir|requisitos (?:encontrados|para)|si deseas|si necesit|documentos recuperados|fuente)/i.test(line)) continue;
    if (/:$/.test(line) && line.length < 70) { heading = line.replace(/:$/, ''); continue; } // título de bloque
    entries.push({ item: line.replace(/\s+/g, ' '), heading });
  }
  const seen = new Set();
  return entries.filter((e) => (seen.has(e.item) ? false : seen.add(e.item)));
}

export function extractRequirementItems(answer = '') {
  return extractRequirementEntries(answer).map((e) => e.item);
}

export function buildRequirementsAnswer({ socialWorkName, circuitLabel = null, fichaLines = [], normativeAnswer = '', documentNames = [] } = {}) {
  const ficha = shortenFichaLines(fichaLines);
  const hasValidity = ficha.some((f) => f.label === 'Vigencia');
  const receta = [];
  const cantidades = [];
  const facturacion = [];
  const alerts = [];
  if (/^\s*(?:no (?:hay|se encontr|pude|encontre)|la normativa no)/i.test(String(normativeAnswer))) return null;
  for (const { item, heading } of extractRequirementEntries(normativeAnswer)) {
    const q = fold(item);
    const h = fold(heading);
    if (hasValidity && /^(?:validez|vigencia)\b/.test(h) ) continue; // ya figura en la ficha
    if (hasValidity && /^(?:validez|vigencia)\b/.test(q)) continue;
    if (BILLING.test(q) || (!QUANTITIES.test(q) && !ALERT.test(q) && BILLING.test(h))) facturacion.push(item);
    else if (QUANTITIES.test(q) || (!ALERT.test(q) && QUANTITIES.test(h))) cantidades.push(item);
    else if (ALERT.test(q) && alerts.length < 2) alerts.push(item);
    else receta.push(item);
  }
  if (receta.length < 2) return null; // no se pudo ordenar con seguridad: se usa el formato anterior

  const lines = [`Requisitos de receta · ${socialWorkName || 'esta obra social'}`];
  if (circuitLabel) lines.push(`Circuito: ${circuitLabel}`);
  if (ficha.length) lines.push('Ficha:', ...ficha.map((f) => `- ${f.label}: ${f.value}`));
  lines.push('## Receta', ...receta.map((i) => `- ${i}`));
  if (cantidades.length) lines.push('## Cantidades', ...cantidades.map((i) => `- ${i}`));
  if (facturacion.length) lines.push('## Facturación', ...facturacion.map((i) => `- ${i}`));
  for (const alert of alerts) lines.push(`Importante: ${alert}`);
  const names = [...new Set(documentNames.filter(Boolean))].slice(0, 3);
  if (names.length) lines.push(`Fuente: ${names.join('; ')}`);
  lines.push('Aviso: este resumen no autoriza por sí solo la recepción ni la dispensación. Revisá los campos en la receta.');
  return lines.join('\n');
}

/** Interpreta el texto anterior para mostrarlo en pestañas; null si no tiene ese formato. */
export function parseRequirementsMessage(text = '') {
  const lines = String(text).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const head = lines[0]?.match(/^(?:Requisitos de receta|Información) · (.+)$/);
  if (!head || !lines.some((l) => l.startsWith('## '))) return null;
  const out = { title: head[1], intro: null, circuit: null, ficha: [], sections: [], alerts: [], source: null, notice: null };
  let mode = null;
  let section = null;
  for (const line of lines.slice(1)) {
    let m;
    if ((m = line.match(/^Circuito:\s*(.+)$/))) { out.circuit = m[1]; mode = null; continue; }
    if ((m = line.match(/^Intro:\s*(.+)$/))) { out.intro = m[1]; mode = null; continue; }
    if (line === 'Ficha:') { mode = 'ficha'; continue; }
    if ((m = line.match(/^##\s+(.+)$/))) { section = { title: m[1], items: [] }; out.sections.push(section); mode = 'section'; continue; }
    if ((m = line.match(/^Importante:\s*(.+)$/))) { out.alerts.push(m[1]); mode = null; continue; }
    if ((m = line.match(/^Fuente:\s*(.+)$/))) { out.source = m[1]; mode = null; continue; }
    if ((m = line.match(/^Aviso:\s*(.+)$/))) { out.notice = m[1]; mode = null; continue; }
    const bullet = line.match(/^-\s+(.+)$/);
    if (!bullet) continue;
    if (mode === 'ficha') {
      const kv = bullet[1].match(/^([^:]+):\s*(.+)$/);
      if (kv) out.ficha.push({ label: kv[1], value: kv[2] });
    } else if (mode === 'section' && section) section.items.push(bullet[1]);
  }
  return out.sections.length ? out : null;
}

// ---------------------------------------------------------------------------
// Mismo diseño para cualquier respuesta larga de la normativa (v3.13.69).
// Los títulos de las pestañas son los bloques que ya trae la respuesta: no se agrega contenido.
// ---------------------------------------------------------------------------
const TAIL = /^(?:si deseas|si necesit|si quer[eé]s|ac[aá] ten[eé]s|document[oó]s? recuperados|fuente:)/i;

function headingOf(line) {
  let m;
  if ((m = line.match(/^#{1,4}\s+(.{2,80})$/))) return m[1];
  if ((m = line.match(/^(?:\d{1,2}[.)]\s+)?(?:paso\s+\d+\s*[:\-]?\s*)?\*\*(.{2,80}?)\*\*\s*:?\s*$/i))) return m[1];
  if ((m = line.match(/^(?:\d{1,2}[.)]\s+)(?:paso\s+\d+\s*[:\-]?\s*)?([^:]{2,70}):\s*$/i))) return m[1];
  if ((m = line.match(/^([A-ZÁÉÍÓÚÑ][^:.]{2,70}):\s*$/))) return m[1];
  return null;
}

export function buildSectionedAnswer({ answer = '', title = '', circuitLabel = null, maxIntro = 260 } = {}) {
  const text = String(answer).replace(/\r/g, '');
  if (!text.trim() || /(^|\n)##\s/.test(text) || /^Requisitos de receta · /.test(text.trim())) return null;
  const clean = (v) => String(v).replace(/^(?:[-•*✓✔]\s+|\d{1,2}[.)]\s+)/, '').replace(/\*\*/g, '').replace(/__/g, '').replace(/\s+/g, ' ').trim();
  const sections = [];
  const intro = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (TAIL.test(clean(line))) continue;
    const heading = headingOf(line);
    if (heading) { current = { title: clean(heading).replace(/:$/, ''), items: [] }; sections.push(current); continue; }
    const item = clean(line);
    if (!item) continue;
    if (current) current.items.push(item);
    else intro.push(item);
  }
  const usable = sections.filter((section) => section.items.length > 0);
  if (usable.length < 2 || !title) return null; // respuesta corta o sin bloques: se muestra como siempre
  const introText = intro.join(' ').slice(0, maxIntro).trim();
  const lines = [`Información · ${title}`];
  if (circuitLabel) lines.push(`Circuito: ${circuitLabel}`);
  if (introText) lines.push(`Intro: ${introText}`);
  for (const section of usable) lines.push(`## ${section.title}`, ...section.items.map((i) => `- ${i}`));
  return lines.join('\n');
}
