// Regla de inclusión compartida por GET y POST en Validación Admin.
// Las semillas anteriores al piloto siguen incluidas, pero las pruebas QA no.
export function isPilotReviewable(row,scope) {
  if (!row || !scope || !String(row.question || "").trim()) return false;
  // v3.13.21 — las consultas hechas por el administrador (traffic_type ADMIN)
  // también se revisan: no necesitan sucursal y respetan el corte del piloto.
  if (row.traffic_type === "ADMIN") {
    return Boolean(scope.started_at) && Number.isFinite(Date.parse(row.created_at)) &&
      Date.parse(row.created_at) >= Date.parse(scope.started_at);
  }
  if (row.branch_id == null) return false;
  const id = String(row.id);
  if ((scope.seed_query_ids || []).some(seed=>String(seed)===id)) return true;
  return row.traffic_type === "PILOT" && Boolean(scope.started_at) &&
    Number.isFinite(Date.parse(row.created_at)) &&
    Date.parse(row.created_at) >= Date.parse(scope.started_at);
}

export function mergePilotReviewQueue(pilotRows,seedRows,scope,limit=100) {
  const byId = new Map();
  for (const row of [...pilotRows,...seedRows]) {
    if (isPilotReviewable(row,scope)) byId.set(String(row.id),row);
  }
  return [...byId.values()]
    .sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at) || Number(b.id)-Number(a.id))
    .slice(0,limit);
}
