'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { refreshStoredSession } from '../../../../lib/client/session';

const V = { CORRECT: ['Correcta', '#16a34a'], PARTIAL: ['Parcial', '#d97706'], INCORRECT: ['Incorrecta', '#dc2626'], NO_BASE: ['Sin base', '#6b7280'], NA: ['No aplica', '#9ca3af'] };
const ST = { QUEUED: 'En cola (esperando al script)', PREPARING: 'Preparando', RUNNING: 'En marcha', PAUSED: 'En pausa', STOPPED: 'Detenida', DONE: 'Terminada', ERROR: 'Con error' };
const WST = { WAITING: 'Esperando', WORKING: 'Analizando', PAUSED: 'En pausa', DONE: 'Listo', ERROR: 'Error', STOPPED: 'Detenido' };
const sel = 'rounded-xl border border-[#e5d9e6] bg-white px-3 py-2 text-sm';
const btn = 'rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const OTHER = '__otro__';

export default function AuditoriaEnVivo() {
  const [d, setD] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [model, setModel] = useState('gpt-4.1'), [custom, setCustom] = useState(''), [since, setSince] = useState('2026-10-19'), [workers, setWorkers] = useState(4), [runId, setRunId] = useState(null);
  const request = useCallback(async (url, options = {}) => {
    const token = sessionStorage.getItem('gdpsoft_access_token') || await refreshStoredSession();
    const make = (t) => fetch(url, { ...options, cache: 'no-store', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });
    let r = await make(token); if (r.status === 401) r = await make(await refreshStoredSession());
    const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || 'Error de comunicación'); return j;
  }, []);
  const load = useCallback(async () => { try { setError(''); setD(await request('/api/admin/auditoria/runs' + (runId ? `?run=${runId}` : ''))); } catch (e) { setError(e.message); } }, [request, runId]);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  async function start(e) {
    e.preventDefault(); setBusy(true);
    try { const m = model === OTHER ? custom.trim() : model; const j = await request('/api/admin/auditoria/runs', { method: 'POST', body: JSON.stringify({ model: m, since: `${since}T00:00:00-03:00`, workers }) }); setRunId(j.id); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function control(control) { try { await request('/api/admin/auditoria/runs', { method: 'POST', body: JSON.stringify({ action: 'CONTROL', id: d.run.id, control }) }); await load(); } catch (e) { setError(e.message); } }
  const run = d?.run, active = run && ['QUEUED', 'PREPARING', 'RUNNING', 'PAUSED'].includes(run.status);
  const pct = run?.total ? Math.round((100 * run.done) / run.total) : 0;
  const counts = d?.counts || {}, sum = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return <div className="mx-auto max-w-[1250px] space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-widest text-[#8f2a85]">Superadmin</p><h1 className="mt-1 text-2xl font-bold">Auditoría en vivo</h1></div>
      <Link href="/admin/auditoria" className="text-sm font-semibold text-[#8f2a85] underline">← Volver a Auditoría de respuestas</Link></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
    {d && <p className={`rounded-xl p-3 text-sm ${d.runner.connected ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900'}`}>
      {d.runner.connected ? `Script conectado (${d.runner.host || 'PC'}).` : <>Script desconectado. En tu PC, desde la carpeta del proyecto, corré: <code className="rounded bg-white px-1">node scripts/auditar-en-vivo.mjs --esperar</code></>}</p>}
    {d && <form onSubmit={start} className="flex flex-wrap items-end gap-3 rounded-2xl border border-[#eaddeb] bg-white p-4 shadow-sm">
      <label className="text-sm font-medium">Modelo<select className={`${sel} mt-1 block`} value={model} onChange={(e) => setModel(e.target.value)}>
        {d.models.map((m) => <option key={m} value={m}>{m}{d.prices[m] ? ` — aprox. US$ ${d.prices[m][0]} / ${d.prices[m][1]} por millón de tokens` : ''}</option>)}<option value={OTHER}>Otro (escribir nombre)…</option></select></label>
      {model === OTHER && <label className="text-sm font-medium">Nombre del modelo<input className={`${sel} mt-1 block`} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="ej. gpt-5.1" /></label>}
      <label className="text-sm font-medium">Consultas desde<input type="date" className={`${sel} mt-1 block`} value={since} onChange={(e) => setSince(e.target.value)} /></label>
      <label className="text-sm font-medium">Agentes<select className={`${sel} mt-1 block`} value={workers} onChange={(e) => setWorkers(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
      <button disabled={busy || active || (model === OTHER && custom.trim().length < 2)} className={`${btn} bg-[#8f2a85]`}>Iniciar auditoría</button>
      <p className="w-full text-[11px] text-zinc-500">Los precios son una estimación orientativa; verificá los vigentes en OpenAI. El modelo lo elegís acá: no hace falta tocar .env.local. Tu cuenta de OpenAI debe tener acceso al modelo elegido.</p></form>}
    {run && <section className="space-y-3 rounded-2xl border border-[#eaddeb] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><h2 className="font-bold">Corrida #{run.id} · {run.model}</h2><span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold">{ST[run.status]}</span>
        {run.message && <span className="text-xs text-zinc-600">{run.message}</span>}
        {active && <div className="ml-auto flex gap-2">
          {run.control === 'PAUSE' || run.status === 'PAUSED' ? <button className={`${btn} bg-green-600`} onClick={() => control('RUN')}>Reanudar</button> : <button className={`${btn} bg-amber-600`} onClick={() => control('PAUSE')}>Pausar</button>}
          <button className={`${btn} bg-red-600`} onClick={() => confirm('¿Detener la corrida?') && control('STOP')}>Detener</button></div>}</div>
      <div><div className="h-4 overflow-hidden rounded-full bg-zinc-100"><div className="h-full bg-[#8f2a85] transition-all" style={{ width: `${pct}%` }} /></div>
        <p className="mt-1 text-xs text-zinc-600">{run.done} de {run.total} consultas ({pct} %) · tokens {Number(run.tokens_in).toLocaleString('es-AR')} entrada / {Number(run.tokens_out).toLocaleString('es-AR')} salida{run.cost_usd_est != null ? ` · costo estimado US$ ${run.cost_usd_est}` : ''}</p></div>
      <div className="flex h-3 overflow-hidden rounded bg-zinc-100">{Object.keys(V).map((k) => counts[k] ? <div key={k} title={`${V[k][0]}: ${counts[k]}`} style={{ width: `${(100 * counts[k]) / sum}%`, background: V[k][1] }} /> : null)}</div>
      <p className="text-xs text-zinc-600">{Object.keys(V).filter((k) => counts[k]).map((k) => `${V[k][0]} ${counts[k]}`).join(' · ') || 'Sin resultados todavía'}</p>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">{d.workers.map((w) => <div key={w.worker_no} className={`rounded-xl border p-3 text-sm ${w.status === 'WORKING' ? 'border-[#8f2a85] bg-[#faf5fb]' : 'border-zinc-200'}`}>
        <div className="flex items-center justify-between"><b>Agente {w.worker_no}</b><span className="text-xs">{WST[w.status] || w.status}{w.status === 'WORKING' ? ' …' : ''}</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-zinc-100"><div className="h-full bg-[#8f2a85]" style={{ width: `${w.total ? (100 * w.done) / w.total : 0}%` }} /></div>
        <p className="mt-1 text-xs text-zinc-500">{w.done} / {w.total}</p>
        {w.current_social_work && w.status !== 'DONE' && <p className="mt-1 text-xs"><b>{w.current_social_work}</b></p>}
        {w.current_question && w.status === 'WORKING' && <p className="mt-1 line-clamp-2 text-xs text-zinc-600">«{w.current_question}»</p>}
        {w.note && <p className="mt-1 text-[11px] text-amber-700">{w.note}</p>}</div>)}</div></section>}
    {d?.feed?.length > 0 && <section className="space-y-2"><div className="flex items-center justify-between"><h2 className="font-bold">Últimos resultados</h2><Link href="/admin/auditoria" className="text-sm font-semibold text-[#8f2a85] underline">Revisar y aprobar →</Link></div>
      {d.feed.map((f) => { const v = V[f.verdict_ai] || V.NA; const bad = (f.sources || []).some((s) => s.verificada === false);
        return <article key={f.id} className="rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: v[1] }}>{v[0]}</span>
            <span className="text-xs text-zinc-500">{f.social_work_name} · {f.circuit || 'sin circuito'} · {f.branch_name || '—'} · #{f.query_id}{f.cause ? ` · ${f.cause}` : ''}</span>
            {bad && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">cita sin verificar</span>}</div>
          <p className="mt-1 font-medium">{f.question}</p>
          {f.proposed_answer && f.verdict_ai !== 'CORRECT' && <p className="mt-1 text-zinc-700"><b>Debió responder:</b> {f.proposed_answer}</p>}
          {f.sources?.[0]?.cita && <p className="mt-1 border-l-4 border-[#8f2a85] pl-2 text-xs text-zinc-600">«{f.sources[0].cita.slice(0, 280)}» — {f.sources[0].seccion}</p>}</article>; })}</section>}
    {d?.runs?.length > 1 && <section className="text-sm"><h2 className="mb-1 font-bold">Corridas anteriores</h2>{d.runs.map((r) => <button key={r.id} onClick={() => setRunId(r.id)} className={`mr-2 mt-1 rounded-lg border px-2 py-1 text-xs ${r.id === run?.id ? 'border-[#8f2a85] bg-[#faf5fb]' : 'border-zinc-200'}`}>#{r.id} · {r.model} · {ST[r.status]} · {r.done}/{r.total}</button>)}</section>}
  </div>;
}
