// GDPSoft v3.13.100 — Repite las consultas auditadas contra el motor de contexto completo y las compara con la
// respuesta correcta propuesta por la auditoría. Guarda el resultado en audit_proposals (replay_*): no cambia
// nada del bot. Cada pregunta se evalúa SIN la corrección del admin que nació de esa misma pregunta.
//
//   node scripts/probar-motor.mjs --modelo=gpt-4.1 --lote=2026-10-22 [--juez=gpt-4.1] [--limite=100] [--todos] [--obra-social=11]
//   node scripts/probar-motor.mjs --solo-actual --juez=gpt-4.1 --lote=2026-10-22   (califica con el MISMO juez la respuesta original del bot en las ya repetidas)
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { runContextEngine } from '../lib/assistant/context-engine/engine.mjs';
import { makeCallModel } from '../lib/assistant/context-engine/openai.mjs';
nextEnv.loadEnvConfig(process.cwd());
const arg = (n, d = null) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, ai = process.env.OPENAI_API_KEY;
if (!url || !key || !ai) { console.error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY u OPENAI_API_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const model = arg('modelo', 'gpt-4.1-mini'), judgeModel = arg('juez', model), limit = Number(arg('limite', 1000));
const callModel = makeCallModel({ apiKey: ai, timeoutMs: 120000 });

let q = supabase.from('audit_proposals').select('id,query_id,social_work_id,circuit,question,bot_answer,proposed_answer,verdict_ai,replay_at,replay_detail').neq('verdict_ai', 'NA').not('proposed_answer', 'is', null).order('id').limit(limit);
if (arg('lote')) q = q.eq('batch', arg('lote'));
if (arg('obra-social')) q = q.eq('social_work_id', Number(arg('obra-social')));
const onlyCurrent = process.argv.includes('--solo-actual');
if (onlyCurrent) q = q.not('replay_at', 'is', null);
else if (!process.argv.includes('--todos')) q = q.is('replay_at', null);
const { data: props, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
console.log(`Consultas a repetir: ${props.length} · motor ${model} · juez ${judgeModel}`);

const JUDGE = `Compará la RESPUESTA DEL MOTOR con la RESPUESTA CORRECTA de referencia para la misma pregunta de una farmacia. Es CORRECTA si dice lo mismo en lo esencial (aunque use otras palabras o agregue contexto sin contradecir); PARCIAL si es correcta pero incompleta, o mezcla algo dudoso; INCORRECTA si contradice, inventa, pide aclaración innecesaria, dice que no hay información cuando la referencia sí la tiene, o responde otra cosa. Si la referencia es "sin información", es CORRECTA una respuesta que reconoce que no hay base. Respondé SOLO JSON: {"veredicto":"CORRECTA|PARCIAL|INCORRECTA","motivo":"una línea"}`;
const MAP = { CORRECTA: 'CORRECT', PARCIAL: 'PARTIAL', INCORRECTA: 'INCORRECT' };
// Califica una respuesta contra la referencia con el MISMO juez, para comparar el motor nuevo y el bot actual con la misma vara.
async function judge(question, reference, answer) {
  const j = await callModel([{ role: 'system', content: JUDGE }, { role: 'user', content: `PREGUNTA: ${question}\n\nRESPUESTA CORRECTA DE REFERENCIA:\n${reference}\n\nRESPUESTA DEL MOTOR:\n${answer}` }], { model: judgeModel });
  const parsed = JSON.parse(j.text);
  return { verdict: MAP[String(parsed.veredicto).toUpperCase()] || 'INCORRECT', motivo: String(parsed.motivo || '').slice(0, 300) };
}
let i = 0, done = 0; const tally = { CORRECT: 0, PARTIAL: 0, INCORRECT: 0 };
async function one(p) {
  if (onlyCurrent) {
    if (p.replay_detail?.current_verdict || !String(p.bot_answer || '').trim()) return;
    let cur = 'INCORRECT', why = '';
    try { ({ verdict: cur, motivo: why } = await judge(p.question, p.proposed_answer, p.bot_answer)); } catch (e) { why = `juez: ${e.message}`; }
    tally[cur]++;
    await supabase.from('audit_proposals').update({ replay_detail: { ...(p.replay_detail || {}), current_verdict: cur, current_motivo: why } }).eq('id', p.id);
    return;
  }
  const { data: row } = await supabase.from('assistant_query_log').select('branch_id,social_work_id,conversation_id,created_at').eq('id', p.query_id).maybeSingle();
  const swId = p.social_work_id || row?.social_work_id; if (!row || !swId) return;
  let history = [];
  if (row.conversation_id) { const { data } = await supabase.from('assistant_query_log').select('question,answer').eq('conversation_id', row.conversation_id).lt('created_at', row.created_at).order('created_at', { ascending: false }).limit(4); history = (data || []).reverse(); }
  let r; try { r = await runContextEngine({ supabase, callModel, model, question: p.question, history, socialWorkId: swId, branchId: row.branch_id, circuit: p.circuit, excludeQueryIds: [p.query_id] }); }
  catch (e) { r = { status: 'ERROR', error: e.message }; }
  let verdict = 'INCORRECT', motivo = r.error || '';
  if (r.answer) {
    try {
      const j = await callModel([{ role: 'system', content: JUDGE }, { role: 'user', content: `PREGUNTA: ${p.question}\n\nRESPUESTA CORRECTA DE REFERENCIA:\n${p.proposed_answer}\n\nRESPUESTA DEL MOTOR:\n${r.answer}` }], { model: judgeModel });
      const parsed = JSON.parse(j.text); verdict = MAP[String(parsed.veredicto).toUpperCase()] || 'INCORRECT'; motivo = String(parsed.motivo || '').slice(0, 300);
    } catch (e) { motivo = `juez: ${e.message}`; }
  }
  let cur = null, curWhy = '';
  if (String(p.bot_answer || '').trim()) { try { ({ verdict: cur, motivo: curWhy } = await judge(p.question, p.proposed_answer, p.bot_answer)); } catch (e) { curWhy = `juez: ${e.message}`; } }
  tally[verdict]++;
  await supabase.from('audit_proposals').update({ replay_verdict: verdict, replay_answer: r.answer || null, replay_at: new Date().toISOString(), replay_model: model,
    replay_detail: { current_verdict: cur, current_motivo: curWhy, status: r.status, motivo, sources: r.sources || [], conflicts: r.conflicts || [], latency_ms: r.latency_ms || null, tokens_in: r.tokens_in || null, tokens_out: r.tokens_out || null, truncated: !!r.truncated, error: r.error || null } }).eq('id', p.id);
}
await Promise.all(Array.from({ length: Number(arg('paralelo', 4)) }, async () => {
  for (;;) { const p = props[i++]; if (!p) return; try { await one(p); } catch (e) { console.error(`#${p.query_id}: ${e.message}`); } done++; if (done % 10 === 0) console.log(`  ${done}/${props.length}`); }
}));
const n = tally.CORRECT + tally.PARTIAL + tally.INCORRECT;
console.log(onlyCurrent ? 'Respuestas ORIGINALES del bot calificadas con el mismo juez:' : 'Motor nuevo:');
console.log(`Listo. Correctas ${tally.CORRECT} · parciales ${tally.PARTIAL} · incorrectas ${tally.INCORRECT}${n ? ` · acierto ${Math.round((1000 * tally.CORRECT) / n) / 10} %` : ''}`);
