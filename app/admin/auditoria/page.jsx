'use client';
import { useCallback, useEffect, useState } from 'react';
import { refreshStoredSession } from '../../../lib/client/session';

const VERDICT = { CORRECT: ['Correcta', '#16a34a'], PARTIAL: ['Parcial', '#d97706'], INCORRECT: ['Incorrecta', '#dc2626'], NO_BASE: ['Sin base', '#6b7280'], NA: ['No aplica', '#9ca3af'] };
const AGING = { VIGENTE: ['Vigente', '#dc2626'], POSIBLEMENTE_RESUELTA: ['Posiblemente resuelta', '#2563eb'], SIN_CAMBIOS: ['—', '#9ca3af'] };
const STATUS = { PENDING: 'Pendiente', APPROVED: 'Aprobada', REJECTED: 'Rechazada' };
const sel = 'rounded-xl border border-[#e5d9e6] bg-white px-3 py-2 text-sm';
const btn = 'rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';

function Bar({ label, parts, total }) {
  return <div className="grid grid-cols-[150px_1fr_44px] items-center gap-2 text-xs">
    <span className="truncate" title={label}>{label}</span>
    <div className="flex h-3 overflow-hidden rounded bg-zinc-100">{['CORRECT', 'PARTIAL', 'INCORRECT', 'NO_BASE'].map((k) => parts[k] ? <div key={k} title={`${VERDICT[k][0]}: ${parts[k]}`} style={{ width: `${(100 * parts[k]) / Math.max(1, total)}%`, background: VERDICT[k][1] }} /> : null)}</div>
    <span className="text-right text-zinc-500">{total}</span></div>;
}
const Pill = ({ children, color }) => <span className="rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ background: color }}>{children}</span>;

export default function AuditoriaAdmin() {
  const [data, setData] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [f, setF] = useState({ status: 'PENDING', verdict: '', circuit: '', aging: '', cause: '', work: '', page: 1 });
  const [open, setOpen] = useState(null), [edit, setEdit] = useState({});
  const request = useCallback(async (url, options = {}) => {
    const token = sessionStorage.getItem('gdpsoft_access_token') || await refreshStoredSession();
    const make = (t) => fetch(url, { ...options, cache: 'no-store', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } });
    let r = await make(token); if (r.status === 401) r = await make(await refreshStoredSession());
    const j = await r.json(); if (!r.ok || !j.ok) throw new Error(j.error || 'Error de comunicación'); return j;
  }, []);
  const load = useCallback(async () => {
    try { setError(''); const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v != null)); setData(await request('/api/admin/auditoria?' + qs)); }
    catch (e) { setError(e.message); }
  }, [f, request]);
  useEffect(() => { load(); }, [load]);
  async function decide(it, action) {
    const e = edit[it.id] || {};
    if (action === 'REJECT' && !confirm('¿Rechazar esta propuesta?')) return;
    setBusy(true);
    try { await request('/api/admin/auditoria', { method: 'POST', body: JSON.stringify({ id: it.id, action, finalAnswer: e.answer ?? it.proposed_answer ?? '', appliesTo: e.applies ?? it.applies_to_suggested }) }); setOpen(null); await load(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const s = data?.summary;
  const setFilter = (k, v) => setF((x) => ({ ...x, [k]: v, page: 1 }));
  const works = Object.entries(s?.by_social_work || {}).sort((a, b) => b[1].INCORRECT + b[1].PARTIAL - (a[1].INCORRECT + a[1].PARTIAL)).slice(0, 15);
  const causes = Object.entries(s?.by_cause || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
  return <div className="mx-auto max-w-[1250px] space-y-6">
    <div><p className="text-xs font-bold uppercase tracking-widest text-[#8f2a85]">Superadmin</p><h1 className="mt-1 text-2xl font-bold">Auditoría de respuestas</h1>
      <p className="text-sm text-zinc-600">Revisión consulta por consulta con evidencia. Nada cambia en el bot hasta que aprobás una respuesta.</p></div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}
    {s && <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[['Consultas auditadas', s.judged], ['Correctas', (s.acceptance_pct ?? 0) + ' %'], ['Correctas + parciales', (s.acceptance_with_partial_pct ?? 0) + ' %'], ['Pendientes de aprobar', s.by_status.PENDING], ['Posiblemente ya resueltas', s.by_aging.POSIBLEMENTE_RESUELTA]].map(([a, b]) =>
          <div key={a} className="rounded-2xl border border-[#eaddeb] bg-white p-4 shadow-sm"><p className="text-xs text-zinc-500">{a}</p><p className="mt-1 text-3xl font-extrabold text-[#8f2a85]">{b}</p></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-2xl border border-[#eaddeb] bg-white p-4"><h2 className="font-bold">Por circuito</h2>
          {Object.entries(s.by_circuit).map(([k, v]) => <Bar key={k} label={k === 'CAMARA' ? 'Cámara' : k === 'COLEGIO' ? 'Colegio' : 'Sin circuito'} parts={v} total={v.total} />)}
          <p className="pt-2 text-[11px] text-zinc-500">Verde correcta · ámbar parcial · rojo incorrecta · gris sin base</p></section>
        <section className="space-y-2 rounded-2xl border border-[#eaddeb] bg-white p-4"><h2 className="font-bold">Causas de las fallas</h2>
          {causes.map(([k, v]) => <div key={k} className="grid grid-cols-[150px_1fr_30px] items-center gap-2 text-xs"><span className="truncate">{k}</span><div className="h-3 rounded bg-[#8f2a85]" style={{ width: `${(100 * v) / causes[0][1]}%` }} /><span className="text-right">{v}</span></div>)}</section>
        <section className="space-y-2 rounded-2xl border border-[#eaddeb] bg-white p-4 lg:col-span-2"><h2 className="font-bold">Obras sociales con más fallas</h2>
          {works.map(([k, v]) => <Bar key={k} label={k} parts={v} total={v.total} />)}</section>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={sel} value={f.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">Todos los estados</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select className={sel} value={f.verdict} onChange={(e) => setFilter('verdict', e.target.value)}><option value="">Todos los veredictos</option>{Object.entries(VERDICT).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select className={sel} value={f.circuit} onChange={(e) => setFilter('circuit', e.target.value)}><option value="">Ambos circuitos</option><option value="CAMARA">Cámara</option><option value="COLEGIO">Colegio</option></select>
        <select className={sel} value={f.aging} onChange={(e) => setFilter('aging', e.target.value)}><option value="">Toda antigüedad</option><option value="VIGENTE">Vigente</option><option value="POSIBLEMENTE_RESUELTA">Posiblemente resuelta</option></select>
        <select className={sel} value={f.work} onChange={(e) => setFilter('work', e.target.value)}><option value="">Todas las obras sociales</option>{(data.works || []).map((w) => <option key={w}>{w}</option>)}</select>
      </div>
      <p className="text-sm text-zinc-600">{data.total_filtered} propuestas</p>
      <div className="space-y-3">{data.items.map((it) => {
        const e = edit[it.id] || {}, vs = data.variants[it.id] || [], isOpen = open === it.id, A = AGING[it.aging] || AGING.VIGENTE, V = VERDICT[it.verdict_ai];
        return <article key={it.id} className="rounded-2xl border border-[#eaddeb] bg-white p-4 shadow-sm">
          <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : it.id)}>
            <Pill color={V[1]}>{V[0]}</Pill>{it.aging !== 'SIN_CAMBIOS' && <Pill color={A[1]}>{A[0]}</Pill>}
            <span className="text-xs text-zinc-500">{it.social_work_name || '—'} · {it.circuit || 'sin circuito'} · {it.branch_name || '—'} · #{it.query_id}</span>
            {it.status !== 'PENDING' && <span className="text-xs font-semibold">{STATUS[it.status]}</span>}
            <span className="w-full text-sm font-semibold">{it.question}</span></button>
          {isOpen && <div className="mt-3 space-y-3 text-sm">
            <div><p className="text-xs font-bold text-zinc-500">Respuesta del bot {it.route ? `(ruta ${it.route})` : ''}</p><p className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-3">{it.bot_answer}</p></div>
            {it.cause && <p><b>Causa:</b> {it.cause}{it.admin_verdict ? ` · Admin: ${it.admin_verdict}` : ''}{it.agrees_admin === false ? ' (la auditoría discrepa)' : ''}</p>}
            {it.aging === 'POSIBLEMENTE_RESUELTA' && <p className="rounded-xl bg-blue-50 p-2 text-blue-900">Desde esta consulta hubo {it.aging_detail?.correcciones_posteriores} corrección(es) del admin para esta obra social. Conviene repetir la pregunta antes de aprobar.</p>}
            <div><p className="text-xs font-bold text-zinc-500">Respuesta propuesta (editable)</p>
              <textarea rows={5} className="w-full rounded-xl border border-[#e5d9e6] p-3" value={e.answer ?? it.proposed_answer ?? ''} onChange={(ev) => setEdit((x) => ({ ...x, [it.id]: { ...e, answer: ev.target.value } }))} /></div>
            <div><p className="text-xs font-bold text-zinc-500">Dónde está (evidencia)</p>
              {(it.sources || []).map((src, i) => <blockquote key={i} className="mt-1 border-l-4 border-[#8f2a85] bg-[#faf5fb] p-2"><p className="whitespace-pre-wrap">«{src.cita}»</p><p className="mt-1 text-[11px] text-zinc-500">{src.archivo} › {src.seccion}</p></blockquote>)}
              {!it.sources?.length && <p className="text-zinc-500">Sin fuentes citadas.</p>}</div>
            {it.note && <p className="text-zinc-600"><b>Nota:</b> {it.note}</p>}
            {vs.length > 0 && <details><summary className="cursor-pointer text-xs font-bold text-zinc-500">Preguntas parecidas para pruebas ({vs.length})</summary><ul className="mt-1 list-disc pl-5">{vs.map((v, i) => <li key={i}>{v.variant_question}</li>)}</ul></details>}
            {it.status === 'PENDING' && <div className="flex flex-wrap items-center gap-2">
              <select className={sel} value={e.applies ?? it.applies_to_suggested} onChange={(ev) => setEdit((x) => ({ ...x, [it.id]: { ...e, applies: ev.target.value } }))}><option value="BOTH">Aplica a ambos circuitos</option><option value="CAMARA">Solo Cámara</option><option value="COLEGIO">Solo Colegio</option></select>
              {it.verdict_ai === 'CORRECT' ? <button disabled={busy} className={`${btn} bg-green-600`} onClick={() => decide(it, 'CONFIRM')}>Confirmar respuesta correcta</button>
                : <button disabled={busy} className={`${btn} bg-[#8f2a85]`} onClick={() => decide(it, 'APPROVE')}>Aprobar como corrección</button>}
              <button disabled={busy} className={`${btn} bg-zinc-500`} onClick={() => decide(it, 'REJECT')}>Rechazar</button></div>}
          </div>}
        </article>;
      })}</div>
      <div className="flex items-center gap-3">
        <button className={`${btn} bg-zinc-600`} disabled={f.page <= 1} onClick={() => setF((x) => ({ ...x, page: x.page - 1 }))}>Anterior</button>
        <span className="text-sm">Página {data.page} de {Math.max(1, Math.ceil(data.total_filtered / data.page_size))}</span>
        <button className={`${btn} bg-zinc-600`} disabled={f.page * data.page_size >= data.total_filtered} onClick={() => setF((x) => ({ ...x, page: x.page + 1 }))}>Siguiente</button></div>
    </>}
    {!s && !error && <p className="text-sm text-zinc-500">Cargando…</p>}
  </div>;
}
