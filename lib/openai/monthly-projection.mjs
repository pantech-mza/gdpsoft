// GDPSoft v3.13.111 — Estimación mensual del gasto de OpenAI, por sucursal y para toda la red.
// Siempre es una ESTIMACIÓN: parte del gasto real del período y de los días con actividad, y se reparte según las
// consultas (tokens) de cada sucursal. Las pruebas internas (Nico, Mica, Admin) no cuentan en la operación real.

/**
 * daily: [{date, cost_usd}] del período · rows: filas por sucursal de /openai-usage/branches (con share, internal, branch_id, name, requests)
 * totalCostUsd: gasto real del período (OpenAI) · branchesTotal: sucursales de la red (editable)
 */
export function projectMonthly({ daily = [], rows = [], totalCostUsd = null, branchesTotal = 0, daysInMonth = 30 } = {}) {
  const costDays = (daily || []).filter((d) => Number(d?.cost_usd) > 0);
  const activeDays = costDays.length;
  const total = totalCostUsd == null ? costDays.reduce((n, d) => n + Number(d.cost_usd), 0) : Number(totalCostUsd);
  if (!activeDays || !(total > 0)) return { ok: false, reason: 'SIN_DATOS', activeDays, branches: [] };
  const dailyAvg = total / activeDays;
  const monthlyOrg = dailyAvg * daysInMonth; // toda la organización, incluidas las pruebas
  const live = rows.filter((r) => !r.internal);
  const internal = rows.filter((r) => r.internal);
  const monthly = (share) => dailyAvg * daysInMonth * share;
  const branchRows = live.filter((r) => r.branch_id != null);
  const branches = branchRows.map((r) => ({ key: r.key, branch_id: r.branch_id, name: r.name, requests: r.requests, share: r.share, monthly_usd: monthly(r.share) }))
    .sort((a, b) => b.monthly_usd - a.monthly_usd);
  const realMonthly = monthly(live.reduce((n, r) => n + r.share, 0));
  const internalMonthly = monthly(internal.reduce((n, r) => n + r.share, 0));
  const branchSum = branches.reduce((n, b) => n + b.monthly_usd, 0);
  const perBranch = branches.length ? branchSum / branches.length : 0;
  const total_branches = Math.max(0, Math.floor(Number(branchesTotal) || 0));
  return {
    ok: true, activeDays, dailyAvg, daysInMonth,
    monthly_org_usd: monthlyOrg, monthly_real_usd: realMonthly, monthly_internal_usd: internalMonthly,
    active_branches: branches.length, per_branch_usd: perBranch,
    network_branches: total_branches, network_usd: total_branches ? perBranch * total_branches : null,
    branches,
  };
}
