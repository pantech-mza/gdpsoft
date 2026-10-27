// v3.13.113 — gasto desde el inicio con filtros (sucursal, dispositivo, día). Todo es estimación salvo el total de OpenAI.
export const cellDeviceKey = (c) => `${c.branch_id ?? 'x'}:${c.device_id ?? 'x'}`;

/** Reparte el costo real de cada día entre las celdas de la app según sus tokens. */
export function priceCells({ cells = [], daily = [] } = {}) {
  const byDay = new Map(daily.map((d) => [d.date, d]));
  const appTokens = new Map();
  for (const c of cells) appTokens.set(c.date, (appTokens.get(c.date) || 0) + Number(c.tokens || 0));
  return cells.map((c) => {
    const d = byDay.get(c.date);
    const denom = Math.max(Number(d?.total_tokens || 0), appTokens.get(c.date) || 0);
    const cost = d && denom > 0 ? Number(d.cost_usd || 0) * Number(c.tokens || 0) / denom : 0;
    return { ...c, cost_usd: cost };
  });
}

/** Primer día con actividad (gasto o consultas): «desde el inicio». */
export function startDate({ daily = [], cells = [] } = {}) {
  const ds = [...daily.filter((d) => Number(d.cost_usd) > 0 || Number(d.requests) > 0).map((d) => d.date), ...cells.map((c) => c.date)].sort();
  return ds[0] || null;
}

const pass = (sel, v) => !sel || !sel.length || sel.includes(String(v));

export function applyFilters(priced, { branches = [], devices = [], from = '', to = '' } = {}) {
  return priced.filter((c) => pass(branches, c.branch_id) && pass(devices, cellDeviceKey(c)) && (!from || c.date >= from) && (!to || c.date <= to));
}

export function summarize(rows, { totalCost = 0, daysInMonth = 30, expectedQueries = null } = {}) {
  const cost = rows.reduce((n, r) => n + r.cost_usd, 0);
  const queries = rows.reduce((n, r) => n + r.queries, 0);
  const perDay = new Map();
  for (const r of rows) {
    const d = perDay.get(r.date) || { date: r.date, cost_usd: 0, queries: 0 };
    d.cost_usd += r.cost_usd; d.queries += r.queries; perDay.set(r.date, d);
  }
  const days = [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  const activeDays = days.filter((d) => d.queries > 0).length;
  const costPerQuery = queries > 0 ? cost / queries : 0;
  const avgQueriesDay = activeDays > 0 ? queries / activeDays : 0;
  const expected = expectedQueries != null && expectedQueries !== '' ? Number(expectedQueries) : avgQueriesDay * daysInMonth;
  return {
    cost, queries, days, activeDays, costPerQuery, avgQueriesDay,
    share: totalCost > 0 ? cost / totalCost : 0,
    avgCostDay: activeDays > 0 ? cost / activeDays : 0,
    expectedQueries: expected,
    nextMonth: costPerQuery * expected,
  };
}

/** Totales por sucursal (sobre las celdas ya filtradas). */
export function byBranch(rows, names = new Map()) {
  const m = new Map();
  for (const r of rows) {
    const k = String(r.branch_id);
    const b = m.get(k) || { id: k, name: names.get(k) || (r.branch_id == null ? 'Administración / sin sucursal' : `Sucursal ${r.branch_id}`), cost_usd: 0, queries: 0 };
    b.cost_usd += r.cost_usd; b.queries += r.queries; m.set(k, b);
  }
  return [...m.values()].sort((a, b) => b.cost_usd - a.cost_usd);
}
