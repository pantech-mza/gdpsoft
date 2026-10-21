// GDPSoft v3.13.76 — Ficha por circuito (Cámara / Colegio).
// Una obra social unificada (ej. RECETARIO SOLIDARIO) puede tener datos distintos según el circuito
// de la sucursal. La fila de social_works es la base; social_work_circuit_profiles guarda SOLO
// los campos que cambian en cada circuito. Un campo NULL en el override hereda el valor base; '__VACIO__' fuerza «sin dato» en ese circuito.

export const CIRCUIT_FIELDS = Object.freeze([
  'recipe_type', 'recipe_validity_days', 'letterhead', 'rp', 'diagnosis',
  'monodrug', 'commercial_name', 'substitution', 'validator_name', 'validator_type',
  'observations',
]);

export const CIRCUIT_SELECT = ['social_work_id', 'circuit_group', ...CIRCUIT_FIELDS].join(',');

export function normalizeCircuitGroup(value) {
  const t = String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (/CAMARA/.test(t)) return 'CAMARA';
  if (/COLEGIO/.test(t)) return 'COLEGIO';
  return null;
}

export const EMPTY_MARK = '__VACIO__';
const isBlank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

/** Devuelve { data, applied } con los campos del circuito pisando la base. No muta la entrada. */
export function applyCircuitProfile(base, override) {
  if (!base || !override) return { data: base, applied: [] };
  const data = { ...base };
  const applied = [];
  for (const field of CIRCUIT_FIELDS) {
    if (!(field in override) || isBlank(override[field])) continue;
    // «__VACIO__» = en este circuito el dato está vacío (no hereda el valor de la base).
    data[field] = override[field] === EMPTY_MARK ? null : override[field];
    applied.push(field);
  }
  return { data, applied };
}

/** Lee el override; tolera que la tabla todavía no exista (devuelve null). */
export async function loadCircuitOverride(supabase, socialWorkId, group) {
  const g = normalizeCircuitGroup(group);
  const id = Number(socialWorkId);
  if (!g || !Number.isInteger(id) || id <= 0) return null;
  try {
    const { data, error } = await supabase
      .from('social_work_circuit_profiles')
      .select(CIRCUIT_SELECT)
      .eq('social_work_id', id)
      .eq('circuit_group', g)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function withCircuitProfile(supabase, base, group) {
  if (!base) return { data: base, applied: [], group: normalizeCircuitGroup(group) };
  const override = await loadCircuitOverride(supabase, base.id, group);
  const { data, applied } = applyCircuitProfile(base, override);
  return { data, applied, group: normalizeCircuitGroup(group) };
}
