// GDPSoft v3.13.100 — Guarda el TEXTO de las normativas para el motor de contexto completo.
// Escribe SOLO en assistant_normative_text. Correlo cuando se cargue o cambie una normativa.
//
//   node scripts/construir-conocimiento.mjs                 (solo las que faltan o cambiaron)
//   node scripts/construir-conocimiento.mjs --forzar        (todas)
//   node scripts/construir-conocimiento.mjs --obra-social=11
//   node scripts/construir-conocimiento.mjs --incluir-planillas   (por defecto se OMITEN las planillas/padrones por privacidad)
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { makeNormativeTextExtractor } from '../lib/audit/normative-text.mjs';
nextEnv.loadEnvConfig(process.cwd());
const arg = (n, d = null) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const extract = makeNormativeTextExtractor(supabase);

let ids = null;
if (arg('obra-social')) {
  const { data } = await supabase.from('normative_social_works').select('normative_id').eq('social_work_id', Number(arg('obra-social')));
  ids = [...new Set((data || []).map((r) => r.normative_id))];
}
let q = supabase.from('normatives').select('*').order('id');
if (ids) q = q.in('id', ids.length ? ids : [-1]);
const { data: norms, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
const { data: have } = await supabase.from('assistant_normative_text').select('normative_id,updated_at,chars');
const haveMap = new Map((have || []).map((h) => [Number(h.normative_id), h]));
let ok = 0, skipped = 0, sheets = 0, failed = 0;
for (const n of norms.filter((x) => x.is_current !== false)) {
  const h = haveMap.get(Number(n.id));
  if (!flag('forzar') && h && (!n.updated_at || Date.parse(h.updated_at) >= Date.parse(n.updated_at))) { skipped++; continue; }
  try {
    const { text, extraction } = await extract(n);
    if (/PLANILLA/i.test(extraction) && !flag('incluir-planillas')) { sheets++; console.log(`· #${n.id} ${n.title}: planilla omitida (privacidad)`); continue; }
    if (!String(text || '').trim()) { failed++; console.log(`· #${n.id} ${n.title}: sin texto (${extraction})`); continue; }
    const { error: e } = await supabase.from('assistant_normative_text').upsert({ normative_id: n.id, text, extraction, chars: text.length, updated_at: new Date().toISOString() });
    if (e) throw e; ok++; console.log(`· #${n.id} ${n.title}: ${text.length} caracteres`);
  } catch (e) { failed++; console.log(`· #${n.id} ${n.title}: ERROR ${e.message}`); }
}
console.log(`Listo. Guardadas: ${ok} · sin cambios: ${skipped} · planillas omitidas: ${sheets} · fallidas o sin texto: ${failed}`);
