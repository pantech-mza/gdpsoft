"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoneyUsd, formatMoneyUsdPrecise } from '../../lib/assistant/format-money-usd.mjs';
import { priceCells, startDate, applyFilters, summarize, byBranch } from '../../lib/openai/spend-filter.mjs';

const money = formatMoneyUsd;
const num = (v) => Number(v || 0).toLocaleString('es-AR');
const pct = (v) => `${(v * 100).toFixed(1).replace('.', ',')}%`;
const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR');

function Check({ label, options = [], value = [], onChange, allLabel = 'Todas', extra }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const names = new Map(options.map((o) => [String(o.id), o.name]));
  const text = !value.length ? allLabel : value.length === 1 ? (names.get(value[0]) || '1 seleccionado') : `${value.length} seleccionados`;
  const shown = options.filter((o) => !q || String(o.name).toLowerCase().includes(q.toLowerCase()));
  const flip = (id) => { const v = String(id); onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]); };
  return <div ref={ref} className="relative text-xs font-semibold text-slate-500"><span>{label}</span>
    <button type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`mt-1 flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left text-sm font-normal text-slate-800 ${value.length ? 'border-[#8f2a85] bg-[#faf0f9]' : 'border-purple-100 bg-white'}`}><span className="truncate">{text}</span><span aria-hidden className="text-slate-400">▾</span></button>
    {open && <div className="absolute z-30 mt-1 w-full min-w-[250px] rounded-xl border border-purple-100 bg-white p-2 shadow-lg">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar…" className="mb-2 w-full rounded-lg border border-purple-100 px-2.5 py-1.5 text-sm font-normal" />
      <div className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true">{shown.map((o) => <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-normal text-slate-700 hover:bg-purple-50"><input type="checkbox" checked={value.includes(String(o.id))} onChange={() => flip(o.id)} /><span className="truncate">{o.name}</span>{o.tag && <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-500">{o.tag}</span>}</label>)}{!shown.length && <p className="px-2 py-2 text-xs font-normal text-slate-400">Sin resultados</p>}</div>
      <div className="mt-2 flex items-center justify-between border-t border-purple-50 pt-2"><div className="flex gap-3"><button type="button" onClick={() => onChange(options.map((o) => String(o.id)))} className="text-xs font-semibold text-[#8f2a85]">Todos</button><button type="button" onClick={() => onChange([])} className="text-xs font-semibold text-[#8f2a85]">Limpiar</button>{extra}</div><button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-[#8f2a85] px-3 py-1 text-xs font-semibold text-white">Listo</button></div>
    </div>}
  </div>;
}

function Kpi({ title, value, sub, accent = '#8f2a85' }) {
  return <div className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"><p className="text-xs font-semibold text-slate-500">{title}</p><strong className="mt-2 block text-2xl font-black" style={{ color: accent }}>{value}</strong>{sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}</div>;
}

export default function OpenAiPilotSpend({ data, usage, error }) {
  const [branches, setBranches] = useState([]), [devices, setDevices] = useState([]), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [expected, setExpected] = useState(''), [init, setInit] = useState(false);

  const start = useMemo(() => startDate({ daily: data?.daily || [], cells: usage?.usage_cells || [] }), [data, usage]);
  const daily = useMemo(() => (data?.daily || []).filter((d) => !start || d.date >= start), [data, start]);
  const cells = useMemo(() => (usage?.usage_cells || []).filter((c) => !start || c.date >= start), [usage, start]);
  const priced = useMemo(() => priceCells({ cells, daily }), [cells, daily]);

  const branchOpts = useMemo(() => (usage?.usage_branches || []).map((b) => ({ id: String(b.id), name: b.name })), [usage]);
  const devOpts = useMemo(() => (usage?.usage_devices || []).map((d) => ({ id: d.key, name: d.label, tag: d.internal ? 'interno' : '' })), [usage]);
  const today = new Date().toISOString().slice(0, 10);
  const branchNames = useMemo(() => new Map(branchOpts.map((b) => [b.id, b.name])), [branchOpts]);

  // Por defecto se dejan afuera los dispositivos internos (Nico, Mica, Admin); se pueden volver a tildar.
  useEffect(() => { if (init || !usage) return; setDevices((usage.usage_devices || []).filter((d) => !d.internal).map((d) => d.key)); setInit(true); }, [usage, init]);

  const totalCost = daily.reduce((n, d) => n + Number(d.cost_usd || 0), 0);
  const totalQueries = cells.reduce((n, c) => n + c.queries, 0);
  const rows = useMemo(() => applyFilters(priced, { branches, devices, from, to }), [priced, branches, devices, from, to]);
  const s = summarize(rows, { totalCost, daysInMonth: 30, expectedQueries: expected === '' ? null : expected });
  const bb = byBranch(rows, branchNames);
  const maxB = Math.max(0.0001, ...bb.map((b) => b.cost_usd)), maxD = Math.max(0.0001, ...s.days.map((d) => d.cost_usd));
  const internalOpts = (usage?.usage_devices || []).filter((d) => d.internal).map((d) => d.key);
  const noInternal = () => setDevices((usage?.usage_devices || []).filter((d) => !d.internal).map((d) => d.key));

  if (error) return <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">No se pudo cargar el gasto desde el inicio: {error}</p>;
  if (!data || !usage) return <p className="rounded-xl bg-white p-4 text-sm text-slate-400">Calculando el gasto desde el primer consumo…</p>;

  return <section className="space-y-4 rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
    <div><h2 className="text-lg font-black text-[#311b39]">Gasto desde que se conectó OpenAI</h2><p className="mt-1 text-xs text-slate-500">Desde el primer consumo en OpenAI ({start ? fmtDay(start) : '—'}) hasta hoy. El piloto arrancó el 19/10; antes hubo desarrollo y pruebas. El total de OpenAI es real; el reparto por sucursal, dispositivo y día es una estimación según los tokens que registra la app.</p></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi title="Gasto total en OpenAI" value={money(totalCost)} sub="Desde el inicio hasta hoy · todo lo facturado" />
      <Kpi title="Consultas registradas" value={num(totalQueries)} sub="Todas las sucursales y dispositivos" accent="#93c01f" />
      <Kpi title="Costo promedio por consulta" value={totalQueries ? formatMoneyUsdPrecise(totalCost / totalQueries) : '—'} sub="Gasto total ÷ consultas" accent="#5f76d0" />
      <Kpi title="Días con gasto" value={num(daily.filter((d) => Number(d.cost_usd) > 0).length)} sub={`Promedio ${money(totalCost / Math.max(1, daily.filter((d) => Number(d.cost_usd) > 0).length))} por día`} accent="#e7a53b" />
    </div>
    <div className="grid gap-3 rounded-xl bg-[#faf7fb] p-3 md:grid-cols-3">
      <Check label="Sucursal" options={branchOpts} value={branches} onChange={setBranches} allLabel="Todas las sucursales" />
      <Check label="Dispositivo" options={devOpts} value={devices} onChange={setDevices} allLabel="Todos los dispositivos" extra={internalOpts.length ? <button type="button" onClick={noInternal} className="text-xs font-semibold text-[#8f2a85]">Sin internos</button> : null} />
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500"><label>Desde<input type="date" value={from} min={start || undefined} max={to || today} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-purple-100 bg-white p-2.5 text-sm font-normal text-slate-800" /></label><label>Hasta<input type="date" value={to} min={from || start || undefined} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-purple-100 bg-white p-2.5 text-sm font-normal text-slate-800" /></label>{(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="col-span-2 text-left text-xs font-semibold text-[#8f2a85]">Quitar fechas</button>}</div>
    </div>
    <p className="text-[11px] text-slate-500">Al abrir, los dispositivos internos (Nico, Mica, Admin) quedan sin tildar. Tildalos o quitá los que quieras desde la lista.</p>
    <h3 className="text-sm font-bold text-[#311b39]">Resultado de la selección</h3>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi title="Gasto de la selección" value={money(s.cost)} sub={`${pct(s.share)} del gasto total`} />
      <Kpi title="Consultas de la selección" value={num(s.queries)} sub={totalQueries ? `${pct(s.queries / totalQueries)} de todas las consultas` : ''} accent="#93c01f" />
      <Kpi title="Costo por consulta" value={s.queries ? formatMoneyUsdPrecise(s.costPerQuery) : '—'} sub={`Promedio ${money(s.avgCostDay)} por día de uso`} accent="#5f76d0" />
      <Kpi title="Estimado próximo mes" value={money(s.nextMonth)} sub={`${num(Math.round(s.expectedQueries))} consultas × costo por consulta`} accent="#e7a53b" />
    </div>
    <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">Consultas esperadas en el mes:<input type="number" min="0" value={expected} placeholder={String(Math.round(s.avgQueriesDay * 30))} onChange={(e) => setExpected(e.target.value)} className="w-28 rounded-lg border border-purple-100 px-2 py-1.5 text-sm" />{expected !== '' && <button type="button" onClick={() => setExpected('')} className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-[#8f2a85]">Usar promedio actual</button>}<span className="text-[11px] text-slate-400">Si no lo cambiás, usa el promedio diario × 30. Con más o menos consultas el estimado se ajusta.</span></label>
    <div className="grid gap-4 lg:grid-cols-2">
      <div><h3 className="mb-2 text-sm font-bold text-[#311b39]">Gasto total por sucursal</h3><div className="space-y-2">{bb.length ? bb.map((b) => <div key={b.id} className="rounded-xl border border-purple-100 p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#311b39]">{b.name}</span><strong className="text-[#8f2a85]">{money(b.cost_usd)}</strong></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#8f2a85]" style={{ width: `${100 * b.cost_usd / maxB}%` }} /></div><p className="mt-1 text-[11px] text-slate-500">{num(b.queries)} consultas · {pct(totalCost > 0 ? b.cost_usd / totalCost : 0)} del total{b.queries ? ` · ${formatMoneyUsdPrecise(b.cost_usd / b.queries)} por consulta` : ''}</p></div>) : <p className="text-sm text-slate-400">Sin datos con estos filtros.</p>}</div></div>
      <div><h3 className="mb-2 text-sm font-bold text-[#311b39]">Gasto por día</h3><div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">{s.days.length ? [...s.days].reverse().map((d) => <div key={d.date} className="grid grid-cols-[84px_1fr_auto] items-center gap-2 text-xs"><span className="text-slate-500">{fmtDay(d.date)}</span><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#93c01f]" style={{ width: `${100 * d.cost_usd / maxD}%` }} /></div><span className="whitespace-nowrap font-semibold text-slate-700">{money(d.cost_usd)} <span className="font-normal text-slate-400">· {num(d.queries)} cons.</span></span></div>) : <p className="text-sm text-slate-400">Sin datos con estos filtros.</p>}</div></div>
    </div>
    <p className="text-xs leading-5 text-slate-500"><strong>Cómo se calcula.</strong> OpenAI informa el gasto por día de toda la cuenta. De cada día se toma la parte que corresponde a cada sucursal y dispositivo según sus tokens registrados (consultas del bot y del motor). El resto (desarrollo, auditorías) no se asigna a ninguna sucursal, por eso la suma de las sucursales es menor que el total. «Estimado próximo mes» = costo por consulta de la selección × consultas esperadas.</p>
  </section>;
}
