// GDPSoft v3.13.98 — Genera preguntas parecidas (variantes) para el banco de pruebas de regresión.
// Escribe SOLO en audit_variants. Usa OPENAI_API_KEY; las preguntas de entrada ya están enmascaradas.
//
// Uso:  node scripts/generar-variantes.mjs [--lote=2026-10-22] [--cantidad=6] [--limite=500]
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd());
const arg = (n, d = null) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, ai = process.env.OPENAI_API_KEY;
if (!url || !key || !ai) { console.error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY u OPENAI_API_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const model = process.env.OPENAI_VARIANTS_MODEL || 'gpt-4.1-mini';
const n = Math.min(10, Math.max(3, Number(arg('cantidad', 6))));
const limit = Number(arg('limite', 500)); const batch = arg('lote');

let q = supabase.from('audit_proposals').select('id,question,social_work_name,circuit,verdict_ai,status')
  .neq('verdict_ai', 'NA').neq('status', 'REJECTED').order('id').limit(limit);
if (batch) q = q.eq('batch', batch);
const { data: props, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
const { data: have } = await supabase.from('audit_variants').select('proposal_id').in('proposal_id', props.map((p) => p.id));
const done = new Set((have || []).map((h) => h.proposal_id));
const todo = props.filter((p) => !done.has(p.id) && String(p.question || '').trim().length > 6);
console.log(`Propuestas sin variantes: ${todo.length}`);

async function variants(p) {
  const prompt = `Sos un colaborador de farmacia argentina. Reescribí la pregunta de %N% formas distintas que pregunten LO MISMO sobre la misma obra social (${p.social_work_name || 'la obra social indicada'}). Mezclá: con errores de tipeo, abreviaturas, sin signos, más coloquial, más formal, con el nombre de la obra social en otra posición, y una versión de seguimiento corta. No inventes datos nuevos ni incluyas nombres ni números de personas. Respondé SOLO JSON: {"variantes":["..."]}.\nPregunta original: ${JSON.stringify(p.question)}`.replace('%N%', String(n));
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${ai}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.7, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`OpenAI ${r.status}`);
  const j = await r.json();
  const list = JSON.parse(j.choices?.[0]?.message?.content || '{}').variantes;
  return (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter((s) => s.length >= 4 && s.length <= 300 && s.toLowerCase() !== p.question.toLowerCase());
}
let total = 0, fails = 0;
for (const p of todo) {
  try {
    const vs = [...new Set(await variants(p))].slice(0, n);
    if (vs.length) { const { error: e } = await supabase.from('audit_variants').upsert(vs.map((v) => ({ proposal_id: p.id, variant_question: v })), { onConflict: 'proposal_id,variant_question' }); if (e) throw e; total += vs.length; }
  } catch (e) { fails++; console.error(`#${p.id}: ${e.message}`); }
}
console.log(`Listo. Variantes creadas: ${total} · fallidas: ${fails}`);
