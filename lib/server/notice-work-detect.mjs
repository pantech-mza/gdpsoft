// v3.13.165 — obra social de un aviso, detectada por el título («OSEP - CONVENIO…»): coincidencia de palabras completas, la más larga gana.
const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
export async function detectWorkFromTitle(client, title) {
  try {
    const t = ` ${norm(title)} `;
    const { data } = await client.from('social_works').select('id,name,active');
    let best = null;
    for (const w of data || []) {
      const n = norm(w.name);
      if (n.length < 3 || w.active === false || !t.includes(` ${n} `)) continue;
      if (!best || n.length > best.len) best = { id: Number(w.id), len: n.length };
    }
    return best?.id || null;
  } catch { return null; }
}
