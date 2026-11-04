// GDPSoft v3.13.108 — filtros de Actividad con selección múltiple.
// Los ids llegan como lista separada por comas («1,2,3») o, por compatibilidad, como un solo id.
export function parseIdList(raw, max = 200) {
  if (raw == null || raw === '') return { ids: null, ok: true };
  const parts = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return { ids: null, ok: true };
  if (parts.length > max || parts.some((p) => !/^[1-9]\d{0,15}$/.test(p))) return { ids: null, ok: false };
  return { ids: [...new Set(parts.map(Number))], ok: true };
}

export function parseActivityFilters(params) {
  const b = parseIdList(params.get('branch_ids') ?? params.get('branch_id'));
  const s = parseIdList(params.get('social_work_ids') ?? params.get('social_work_id'));
  const d = parseIdList(params.get('device_ids') ?? params.get('device_id'));
  const excludeInternal = ['1', 'true', 'si'].includes(String(params.get('exclude_internal') || '').toLowerCase());
  return { ok: b.ok && s.ok && d.ok, branchIds: b.ids, socialIds: s.ids, deviceIds: d.ids, excludeInternal };
}

const missingFunction = (error) => !!error && (error.code === 'PGRST202' || error.code === '42883' || /could not find the function|does not exist/i.test(String(error.message || '')));

// Llama a la función _v4 (múltiple). Si la migración todavía no se aplicó, cae a _v3 con el primer id de cada filtro.
export async function callActivityRpc(supabase, kind, f, base) {
  const v4 = { ...base, p_branch_ids: f.branchIds, p_social_work_ids: f.socialIds, p_device_ids: f.deviceIds, p_exclude_internal: f.excludeInternal };
  const first = await supabase.rpc(`gdp_assistant_activity_${kind}_v4`, v4);
  if (!missingFunction(first.error)) return { ...first, legacy: false };
  const v3 = { ...base, p_branch_id: f.branchIds?.[0] ?? null, p_social_work_id: f.socialIds?.[0] ?? null, p_device_id: f.deviceIds?.[0] ?? null };
  const second = await supabase.rpc(`gdp_assistant_activity_${kind}_v3`, v3);
  return { ...second, legacy: true };
}
