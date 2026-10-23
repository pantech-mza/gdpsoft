// GDPSoft v3.13.99 — Auditoría en vivo. Corre en tu PC y reporta el avance a Supabase para verlo en
// Admin → Auditoría de respuestas → En vivo.
//
//   node scripts/auditar-en-vivo.mjs --esperar          (deja el script esperando corridas creadas desde la pantalla)
//   node scripts/auditar-en-vivo.mjs --modelo=gpt-4.1 --desde=2026-10-19T00:00:00-03:00 --trabajadores=4   (crea y corre una)
//
// Lee de Supabase (solo lectura sobre consultas/conocimiento) y escribe ÚNICAMENTE en audit_runs,
// audit_run_workers, audit_runner y audit_proposals. Usa OPENAI_API_KEY de .env.local.
import os from 'node:os';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { collectAudit } from '../lib/audit/export-audit.mjs';
import { makeNormativeTextExtractor } from '../lib/audit/normative-text.mjs';
import { normalizeProposal, computeAging } from '../lib/audit/proposals.mjs';
import { SYSTEM_PROMPT, buildUserPrompt, balance, chunk, verifyCitations, parseModelOutput, confidenceNote, estimateCost, validModel } from '../lib/audit/live-core.mjs';

nextEnv.loadEnvConfig(process.cwd());
const arg = (n, d = null) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, ai = process.env.OPENAI_API_KEY;
if (!url || !key || !ai) { console.error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY u OPENAI_API_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });
const MAX_KNOW = Number(process.env.AUDIT_MAX_KNOWLEDGE_CHARS || 380000);
const CHUNK = Number(process.env.AUDIT_QUERIES_PER_CALL || 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Stop extends Error {}

async function beat() { await supabase.from('audit_runner').upsert({ id: 1, heartbeat_at: new Date().toISOString(), host: os.hostname() }); }
setInterval(() => beat().catch(() => {}), 5000); await beat();

async function callModel(model, system, user) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 300000);
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: ctl.signal,
        headers: { Authorization: `Bearer ${ai}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      if (r.status === 429 || r.status >= 500) { await sleep(3000 * (attempt + 1) ** 2); continue; }
      if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j = await r.json();
      return { text: j.choices?.[0]?.message?.content || '', tin: j.usage?.prompt_tokens || 0, tout: j.usage?.completion_tokens || 0 };
    } catch (e) { if (attempt === 3) throw e; await sleep(2000 * (attempt + 1)); } finally { clearTimeout(t); }
  }
  throw new Error('OpenAI no respondió');
}

async function runOne(run) {
  const log = (m) => console.log(m);
  const setRun = (p) => supabase.from('audit_runs').update(p).eq('id', run.id);
  await setRun({ status: 'PREPARING', started_at: new Date().toISOString(), message: 'Leyendo consultas y conocimiento de las obras sociales…' });
  const result = await collectAudit({ supabase, circuit: 'TODOS', since: run.since, extractNormativeText: makeNormativeTextExtractor(supabase),
    log: (m) => { if (/^· /.test(m)) { log(m); setRun({ message: `Leyendo conocimiento: ${m.slice(2)}` }); } } });
  const rows = result.queryRows;
  const general = result.general.map((p) => `### ${p.code || ''} ${p.title || ''}\n${p.answer || ''}`).join('\n\n').slice(0, 60000);
  const mdByWork = new Map(result.knowledge.map((k) => [String(k.work.id), k.markdown]));
  const groups = new Map();
  for (const q of rows) { const k = String(q.obra_social_id || 0); if (!groups.has(k)) groups.set(k, { workId: k, workName: q.obra_social || 'Sin obra social', items: [] }); groups.get(k).items.push(q); }
  // Correcciones del admin (para la antigüedad)
  const { data: revs } = await supabase.from('branch_response_reviews').select('query_id,verdict,suggested_answer,updated_at').in('verdict', ['INCORRECT', 'PARTIAL']);
  const withText = (revs || []).filter((r) => String(r.suggested_answer || '').trim());
  const swOf = new Map();
  for (let i = 0; i < withText.length; i += 200) { const { data } = await supabase.from('assistant_query_log').select('id,social_work_id').in('id', withText.slice(i, i + 200).map((r) => r.query_id)); (data || []).forEach((r) => swOf.set(r.id, r.social_work_id)); }
  const corrBySw = new Map(); for (const r of withText) { const sw = swOf.get(r.query_id); if (!sw) continue; if (!corrBySw.has(sw)) corrBySw.set(sw, []); corrBySw.get(sw).push({ query_id: r.query_id, updated_at: r.updated_at }); }

  const plan = balance([...groups.values()], run.workers);
  await setRun({ status: 'RUNNING', total: rows.length, done: 0, message: null });
  await supabase.from('audit_run_workers').delete().eq('run_id', run.id);
  await supabase.from('audit_run_workers').insert(plan.map((w, i) => ({ run_id: run.id, worker_no: i + 1, status: 'WAITING', total: w.total })));
  const totals = { done: 0, tin: 0, tout: 0 };
  const batch = `run-${run.id}`;
  let failed = false;

  async function control() {
    for (;;) {
      if (failed) throw new Stop();
      const { data } = await supabase.from('audit_runs').select('control').eq('id', run.id).single();
      if (data?.control === 'STOP') throw new Stop();
      if (data?.control !== 'PAUSE') return;
      await setRun({ status: 'PAUSED' }); await sleep(3000);
    }
  }
  async function worker(no, w) {
    const setW = (p) => supabase.from('audit_run_workers').update({ ...p, updated_at: new Date().toISOString() }).eq('run_id', run.id).eq('worker_no', no);
    let done = 0;
    for (const g of w.groups) {
      let know = mdByWork.get(g.workId) || '(Sin información cargada para esta obra social)';
      const truncated = know.length > MAX_KNOW; if (truncated) know = know.slice(0, MAX_KNOW);
      for (const items of chunk(g.items, CHUNK)) {
        await control(); await setRun({ status: 'RUNNING' });
        await setW({ status: 'WORKING', current_social_work: g.workName, current_question: String(items[0].pregunta || '').slice(0, 200), done, note: truncated ? 'Conocimiento truncado por tamaño' : null });
        let out; try { out = await callModel(run.model, SYSTEM_PROMPT, buildUserPrompt({ workName: g.workName, knowledge: know, general, items })); }
        catch (e) { await setW({ status: 'ERROR', note: String(e.message).slice(0, 300) }); throw e; }
        totals.tin += out.tin; totals.tout += out.tout;
        const parsed = parseModelOutput(out.text, items.map((i) => i.id));
        const props = [];
        for (const r of parsed.results) {
          const q = items.find((i) => Number(i.id) === Number(r.id)); if (!q) continue;
          const p = normalizeProposal({ ...r, circuito: q.circuito, obra_social_id: q.obra_social_id }, batch); if (!p) continue;
          const sources = verifyCitations(r.fuentes, know); const { _social_work_hint, ...base } = p;
          const sw = Number(q.obra_social_id) || null;
          const row = { ...base, sources, run_id: run.id, social_work_id: sw, social_work_name: q.obra_social || null, branch_name: q.sucursal || null,
            question: String(q.pregunta || '').slice(0, 2000), bot_answer: String(q.respuesta_bot || '').slice(0, 6000), route: q.ruta || null,
            query_created_at: q.fecha, admin_verdict: q.veredicto_admin || null,
            note: [base.note, confidenceNote(sources), truncated ? 'Conocimiento truncado por tamaño: puede faltar información.' : null].filter(Boolean).join(' | ') || null };
          const ag = computeAging(row, corrBySw.get(sw) || []); props.push({ ...row, aging: ag.aging, aging_detail: ag.detail });
        }
        if (props.length) { const { error } = await supabase.from('audit_proposals').upsert(props, { onConflict: 'batch,query_id' }); if (error) throw new Error(`guardando: ${error.message}`); }
        done += items.length; totals.done += items.length;
        await setW({ done, note: parsed.missing?.length ? `El modelo omitió ${parsed.missing.length} consulta(s)` : (truncated ? 'Conocimiento truncado por tamaño' : null) });
        await setRun({ done: totals.done, tokens_in: totals.tin, tokens_out: totals.tout, cost_usd_est: estimateCost(run.model, totals.tin, totals.tout) });
      }
    }
    await setW({ status: 'DONE', current_question: null, done });
  }
  try {
    await Promise.all(plan.map((w, i) => worker(i + 1, w).catch((e) => { failed = true; throw e; })));
    await setRun({ status: 'DONE', finished_at: new Date().toISOString(), message: null });
    log(`Corrida ${run.id} terminada: ${totals.done} consultas.`);
  } catch (e) {
    if (e instanceof Stop) { await supabase.from('audit_run_workers').update({ status: 'STOPPED' }).eq('run_id', run.id).neq('status', 'DONE'); await setRun({ status: 'STOPPED', finished_at: new Date().toISOString(), message: 'Detenida desde la pantalla' }); log('Corrida detenida.'); }
    else { await setRun({ status: 'ERROR', finished_at: new Date().toISOString(), message: String(e.message).slice(0, 400) }); console.error(e); }
  }
}

if (arg('modelo')) {
  const model = arg('modelo'); if (!validModel(model)) { console.error('Modelo inválido'); process.exit(1); }
  const { data, error } = await supabase.from('audit_runs').insert({ model, since: arg('desde', '2026-10-19T00:00:00-03:00'), workers: Math.min(8, Math.max(1, Number(arg('trabajadores', 4)))) }).select().single();
  if (error) { console.error(error.message); process.exit(1); }
  await runOne(data); process.exit(0);
}
console.log('Esperando corridas creadas desde Admin → Auditoría de respuestas → En vivo… (Ctrl+C para salir)');
for (;;) {
  const { data } = await supabase.from('audit_runs').select('*').eq('status', 'QUEUED').order('id').limit(1);
  if (data?.length) await runOne(data[0]); else await sleep(4000);
}
