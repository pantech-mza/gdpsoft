// v3.13.130 — «¿el afiliado con DNI X está en el listado de OS?»: búsqueda EXACTA del DNI en el texto de las normativas/planillas
// de la obra social (sin modelo de lenguaje: un listado largo se trunca en el contexto y el modelo respondía «no figura»).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function extractDni(question = '') {
  const q = String(question).replace(/(\d)[.\s](?=\d{3}\b)/g, '$1');
  const m = q.match(/\b(\d{6,9})\b/);
  return m ? m[1] : null;
}

export function isAffiliateDniQuestion(question = '') {
  if (!extractDni(question)) return false;
  const q = fold(question);
  return /\b(?:afiliad[oa]s?|lista|listado|padron|nomina|empadronad[oa]|figura|encuentra|esta en|aparece|dni)\b/.test(q) &&
    !/\b(?:receta|recetas|autoriza|autorizacion|monto|importe|plan\s+\d)\b/.test(q);
}

const looksLikeList = (text) => new Set(String(text || '').match(/\b\d{7,8}\b/g) || []).size >= 20;

/** texts: [{title, text}]. Devuelve {status:'FOUND'|'NOT_FOUND'|'NO_LIST', title?, line?}. */
export function lookupDni(dni, texts = []) {
  const re = new RegExp(`(?<!\\d)${String(dni).split('').join('[.\\s]?')}(?!\\d)`);
  let listTitle = null;
  for (const t of texts) {
    const body = String(t?.text || '');
    if (!body) continue;
    if (looksLikeList(body)) listTitle = listTitle || t.title || 'listado cargado';
    const hit = body.match(re);
    if (hit) {
      const start = body.lastIndexOf('\n', hit.index) + 1;
      let end = body.indexOf('\n', hit.index); if (end < 0) end = body.length;
      return { status: 'FOUND', title: t.title || 'listado cargado', line: body.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 220) };
    }
  }
  return listTitle ? { status: 'NOT_FOUND', title: listTitle } : { status: 'NO_LIST' };
}

export function buildDniAnswer(result, { dni, workName }) {
  if (result.status === 'FOUND') return `Sí, el DNI ${dni} figura en el listado de ${workName} (${result.title}): ${result.line}`;
  if (result.status === 'NOT_FOUND') return `No encontré el DNI ${dni} en el listado de ${workName} cargado en GDPSoft (${result.title}). Revisá que el DNI esté bien escrito; si el listado no está actualizado, confirmalo con la obra social antes de rechazar al afiliado.`;
  return null;
}

/** v3.13.131 — padrón cargado en la tabla affiliate_lists (búsqueda exacta por DNI). hit = fila o null. */
export function buildTableAnswer({ dni, workName, hit }) {
  if (hit) {
    const rel = [hit.relationship, hit.holder ? `titular: ${hit.holder}` : ''].filter(Boolean).join(', ');
    return `Sí, el DNI ${dni} figura en el listado de ${workName}: ${hit.full_name}${rel ? ` (${rel})` : ''}.`;
  }
  return `No encontré el DNI ${dni} en el listado de ${workName} cargado en GDPSoft. Revisá que el DNI esté bien escrito; si el afiliado debería estar, confirmalo con la obra social antes de rechazarlo.`;
}
