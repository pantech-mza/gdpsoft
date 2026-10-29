"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoneyUsd, formatMoneyUsdPrecise } from '../../lib/assistant/format-money-usd.mjs';
import { priceCells, startDate, applyFilters, summarize, byBranch, cellDeviceKey } from '../../lib/openai/spend-filter.mjs';

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
  return <div className="rounded-2xl border border-purple-100 bg-white p-4 shadow-sm"><p className="text-xs font-semibold text-slate-500">{title}</p><strong className="mt-1.5 block text-xl font-black" style={{ color: accent }}>{value}</strong>{sub && <p className="mt-2 text-xs text-slate-400">{sub}</p>}</div>;
}

const printCss = `@media print{body *{visibility:hidden !important}.gdp-print,.gdp-print *{visibility:visible !important}.gdp-print{position:absolute;left:0;top:0;width:100%}.gdp-no-print,.gdp-no-print *{display:none !important}@page{size:A4 portrait;margin:10mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;
const palette = ['#8f2a85', '#93c01f', '#5f76d0', '#e7a53b', '#189e91'];

function Card({ title, sub, children, className = '' }) {
  return <section className={`rounded-2xl border border-purple-100 bg-white p-4 shadow-sm ${className}`}><h3 className="text-sm font-bold text-[#311b39]">{title}</h3>{sub && <p className="mb-3 mt-0.5 text-[11px] text-slate-500">{sub}</p>}{!sub && <div className="mb-3" />}{children}</section>;
}

function HBars({ items, total, color = '#8f2a85', unit = 'cons.' }) {
  const max = Math.max(0.0001, ...items.map((b) => b.cost_usd));
  if (!items.length) return <p className="text-sm text-slate-400">Sin datos con estos filtros.</p>;
  return <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">{items.map((b, i) => <div key={b.id}><div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-semibold text-[#311b39]">{b.name}</span><strong style={{ color: i === 0 ? color : '#475569' }}>{money(b.cost_usd)}</strong></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${100 * b.cost_usd / max}%`, background: color }} /></div><p className="mt-0.5 text-[10px] text-slate-400">{num(b.queries)} {unit} · {pct(total > 0 ? b.cost_usd / total : 0)} del total{b.queries ? ` · ${formatMoneyUsdPrecise(b.cost_usd / b.queries)} c/u` : ''}</p></div>)}</div>;
}

function Bars({ days, field, color, fmt }) {
  const max = Math.max(0.0001, ...days.map((d) => d[field]));
  if (!days.length) return <p className="text-sm text-slate-400">Sin datos con estos filtros.</p>;
  return <div className="overflow-x-auto"><div className="flex min-w-[300px] items-end gap-[3px]" style={{ height: 120 }}>{days.map((d) => <div key={d.date} title={`${fmtDay(d.date)}: ${fmt(d[field])}`} className="flex min-w-[6px] flex-1 flex-col justify-end"><div className="w-full rounded-t" style={{ height: Math.max(2, Math.round(116 * d[field] / max)), background: color }} /></div>)}</div><div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>{fmtDay(days[0].date)}</span><span>{fmtDay(days[days.length - 1].date)}</span></div></div>;
}

export default function OpenAiPilotSpend({ data, usage, error, onRefresh, loading }) {
  const [branches, setBranches] = useState([]), [devices, setDevices] = useState([]);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [expected, setExpected] = useState(''), [init, setInit] = useState(false);

  const start = useMemo(() => startDate({ daily: data?.daily || [], cells: usage?.usage_cells || [] }), [data, usage]);
  const daily = useMemo(() => (data?.daily || []).filter((d) => !start || d.date >= start), [data, start]);
  const cells = useMemo(() => (usage?.usage_cells || []).filter((c) => !start || c.date >= start), [usage, start]);
  const priced = useMemo(() => priceCells({ cells, daily }), [cells, daily]);

  const branchOpts = useMemo(() => (usage?.usage_branches || []).map((b) => ({ id: String(b.id), name: b.name })), [usage]);
  const devOpts = useMemo(() => (usage?.usage_devices || []).map((d) => ({ id: d.key, name: d.label, tag: d.internal ? 'interno' : '' })), [usage]);
  const branchNames = useMemo(() => new Map(branchOpts.map((b) => [b.id, b.name])), [branchOpts]);
  const today = new Date().toISOString().slice(0, 10);

  // Al abrir, los dispositivos internos (Nico, Mica, Admin) quedan sin tildar.
  useEffect(() => { if (init || !usage) return; setDevices((usage.usage_devices || []).filter((d) => !d.internal).map((d) => d.key)); setInit(true); }, [usage, init]);
  const noInternal = () => setDevices((usage?.usage_devices || []).filter((d) => !d.internal).map((d) => d.key));

  const inRange = (d) => (!from || d >= from) && (!to || d <= to);
  const rangeDaily = daily.filter((d) => inRange(d.date));
  const rangeTotal = rangeDaily.reduce((n, d) => n + Number(d.cost_usd || 0), 0);
  const histTotal = daily.reduce((n, d) => n + Number(d.cost_usd || 0), 0);
  const histQueries = cells.reduce((n, c) => n + c.queries, 0);
  const rows = useMemo(() => applyFilters(priced, { branches, devices, from, to }), [priced, branches, devices, from, to]);
  const s = summarize(rows, { totalCost: rangeTotal, daysInMonth: 30, expectedQueries: expected === '' ? null : expected });
  const bb = byBranch(rows, branchNames);

  const devNames = useMemo(() => new Map((usage?.usage_devices || []).map((d) => [d.key, d.label])), [usage]);
  const byDevice = useMemo(() => { const m = new Map(); for (const r of rows) { const k = cellDeviceKey(r); const x = m.get(k) || { id: k, name: devNames.get(k) || k, cost_usd: 0, queries: 0 }; x.cost_usd += r.cost_usd; x.queries += r.queries; m.set(k, x); } return [...m.values()].sort((a, b) => b.cost_usd - a.cost_usd); }, [rows, devNames]);

  // Composición del gasto del período elegido (sin filtrar por sucursal/dispositivo).
  const rangePriced = priced.filter((c) => inRange(c.date));
  const internalCost = rangePriced.filter((c) => c.internal).reduce((n, c) => n + c.cost_usd, 0);
  const appCost = rangePriced.reduce((n, c) => n + c.cost_usd, 0);
  const realCost = appCost - internalCost, otherCost = Math.max(0, rangeTotal - appCost);

  // Estimado del próximo mes por sucursal: costo por consulta × consultas por día de uso × 30.
  const scale = expected !== '' && s.avgQueriesDay > 0 ? s.expectedQueries / (s.avgQueriesDay * 30) : 1;
  const nextByBranch = useMemo(() => { const m = new Map(); for (const r of rows) { const k = String(r.branch_id); const x = m.get(k) || { id: k, name: branchNames.get(k) || (r.branch_id == null ? 'Administración / sin sucursal' : `Sucursal ${r.branch_id}`), cost_usd: 0, queries: 0, days: new Set() }; x.cost_usd += r.cost_usd; x.queries += r.queries; if (r.queries > 0) x.days.add(r.date); m.set(k, x); } return [...m.values()].map((x) => ({ ...x, cost_usd: x.days.size ? x.cost_usd / x.days.size * 30 * scale : 0 })).sort((a, b) => b.cost_usd - a.cost_usd); }, [rows, branchNames, scale]);

  if (error) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">No se pudo cargar el gasto: {error}</p>;
  if (!data || !usage) return <p className="rounded-xl bg-white p-4 text-sm text-slate-400">Calculando el gasto desde el primer consumo…</p>;

  return <div className="gdp-print space-y-4"><style>{printCss}</style>
    <div className="flex flex-wrap items-end justify-between gap-2"><p className="text-xs text-slate-500">Desde el primer consumo en OpenAI ({start ? fmtDay(start) : '—'}) hasta hoy. El total de OpenAI es real; el reparto por sucursal, dispositivo y día es una estimación según los tokens que registra la app.</p><div className="gdp-no-print flex gap-2"><button type="button" onClick={() => window.print()} className="rounded-xl border border-[#8f2a85] px-3 py-2 text-sm font-semibold text-[#8f2a85]">Guardar en PDF</button><button type="button" disabled={loading} onClick={onRefresh} className="rounded-xl bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white">Actualizar</button></div></div>

    <div className="gdp-no-print grid gap-3 rounded-2xl border border-purple-100 bg-[#faf7fb] p-3 sm:grid-cols-2 lg:grid-cols-4">
      <Check label="Sucursal" options={branchOpts} value={branches} onChange={setBranches} allLabel="Todas las sucursales" />
      <Check label="Dispositivo" options={devOpts} value={devices} onChange={setDevices} allLabel="Todos los dispositivos" extra={<button type="button" onClick={noInternal} className="text-xs font-semibold text-[#8f2a85]">Sin internos</button>} />
      <label className="text-xs font-semibold text-slate-500">Desde<input type="date" value={from} min={start || undefined} max={to || today} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-xl border border-purple-100 bg-white p-2.5 text-sm font-normal text-slate-800" /></label>
      <label className="text-xs font-semibold text-slate-500">Hasta<input type="date" value={to} min={from || start || undefined} max={today} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-xl border border-purple-100 bg-white p-2.5 text-sm font-normal text-slate-800" /></label>
      <p className="text-[11px] text-slate-500 sm:col-span-2 lg:col-span-4">Dispositivos internos (Nico, Mica, Admin) quedan sin tildar al abrir; tildalos o sacá los que quieras. {(from || to) && <button type="button" onClick={() => { setFrom(''); setTo(''); }} className="font-semibold text-[#8f2a85]">Quitar fechas</button>}</p>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Kpi title="Gasto total OpenAI" value={money(histTotal)} sub={`Histórico · ${num(histQueries)} consultas`} />
      <Kpi title="Gasto de la selección" value={money(s.cost)} sub={`${pct(s.share)} del gasto del período`} accent="#5f76d0" />
      <Kpi title="Consultas" value={num(s.queries)} sub={`${s.activeDays} días de uso`} accent="#93c01f" />
      <Kpi title="Costo por consulta" value={s.queries ? formatMoneyUsdPrecise(s.costPerQuery) : '—'} sub="Gasto ÷ consultas" accent="#189e91" />
      <Kpi title="Promedio por día" value={money(s.avgCostDay)} sub={`${num(Math.round(s.avgQueriesDay))} consultas por día`} accent="#e7a53b" />
      <Kpi title="Estimado próximo mes" value={money(s.nextMonth)} sub={`${num(Math.round(s.expectedQueries))} consultas × costo`} accent="#8f2a85" />
    </div>
    <label className="gdp-no-print flex flex-wrap items-center gap-2 text-xs text-slate-600">Consultas esperadas en el mes:<input type="number" min="0" value={expected} placeholder={String(Math.round(s.avgQueriesDay * 30))} onChange={(e) => setExpected(e.target.value)} className="w-28 rounded-lg border border-purple-100 px-2 py-1.5 text-sm" />{expected !== '' && <button type="button" onClick={() => setExpected('')} className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold text-[#8f2a85]">Usar promedio actual</button>}<span className="text-[11px] text-slate-400">Por defecto: promedio diario × 30. Si hacen más o menos consultas, el estimado se ajusta.</span></label>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Gasto por día" sub="Estimado de la selección"><Bars days={s.days} field="cost_usd" color="#8f2a85" fmt={money} /></Card>
      <Card title="Consultas por día" sub="Cantidad de consultas de la selección"><Bars days={s.days} field="queries" color="#93c01f" fmt={num} /></Card>
      <Card title="Gasto total por sucursal" sub="Estimado según tokens registrados"><HBars items={bb} total={rangeTotal} /></Card>
      <Card title="Gasto por dispositivo" sub="Estimado según tokens registrados"><HBars items={byDevice} total={rangeTotal} color="#5f76d0" /></Card>
      <Card title="Estimado del próximo mes por sucursal" sub="Costo por consulta × consultas por día de uso × 30"><div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">{nextByBranch.length ? nextByBranch.map((b) => <div key={b.id} className="flex items-center justify-between rounded-xl border border-purple-100 px-3 py-2 text-sm"><span className="truncate font-semibold text-[#311b39]">{b.name}</span><strong className="text-[#e7a53b]">{money(b.cost_usd)}</strong></div>) : <p className="text-sm text-slate-400">Sin datos con estos filtros.</p>}</div></Card>
      <Card title="¿De qué se compone el gasto del período?" sub="Sin aplicar filtros de sucursal ni dispositivo"><div className="space-y-2 text-sm">{[['Gasto total en OpenAI', rangeTotal, '#8f2a85'], ['Consultas de sucursales', realCost, '#93c01f'], ['Pruebas internas (Nico, Mica, Admin)', internalCost, '#71717a'], ['Desarrollo, auditorías y otros', otherCost, '#e7a53b']].map(([n, v, c]) => <div key={n} className="flex items-center justify-between rounded-xl border border-purple-100 px-3 py-2"><span className="text-slate-600">{n}</span><strong style={{ color: c }}>{money(v)}</strong></div>)}</div></Card>
    </div>

    <Card title="Resumen diario" sub="Gasto y consultas de la selección, día por día"><div className="max-h-[420px] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-white text-xs text-slate-500"><tr><th className="py-2 pr-3">Día</th><th className="py-2 pr-3 text-right">Consultas</th><th className="py-2 pr-3 text-right">Gasto</th><th className="py-2 pr-3 text-right">Costo por consulta</th><th className="py-2 text-right">% del gasto del día</th></tr></thead><tbody>{[...s.days].reverse().map((d) => { const day = rangeDaily.find((x) => x.date === d.date); return <tr key={d.date} className="border-t border-purple-50"><td className="py-1.5 pr-3">{fmtDay(d.date)}</td><td className="py-1.5 pr-3 text-right">{num(d.queries)}</td><td className="py-1.5 pr-3 text-right font-semibold text-[#8f2a85]">{money(d.cost_usd)}</td><td className="py-1.5 pr-3 text-right">{d.queries ? formatMoneyUsdPrecise(d.cost_usd / d.queries) : '—'}</td><td className="py-1.5 text-right">{day && Number(day.cost_usd) > 0 ? pct(d.cost_usd / Number(day.cost_usd)) : '—'}</td></tr>; })}{!s.days.length && <tr><td colSpan={5} className="py-3 text-slate-400">Sin datos con estos filtros.</td></tr>}</tbody></table></div></Card>

    <p className="text-xs leading-5 text-slate-500"><strong>Cómo se calcula.</strong> OpenAI informa el gasto por día de toda la cuenta. De cada día se toma la parte que corresponde a cada sucursal y dispositivo según sus tokens registrados (consultas del bot y del motor). El resto (desarrollo, auditorías) no se asigna a ninguna sucursal, por eso las sucursales suman menos que el total. «Estimado próximo mes» = costo por consulta × consultas esperadas.</p>
  </div>;
}
