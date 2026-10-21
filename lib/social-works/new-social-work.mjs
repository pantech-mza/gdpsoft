// GDPSoft v3.13.51 — alta de una obra social desde el panel de administración.
// Validación pura (sin base de datos): devuelve { value } o { error }.

const TEXT_FIELDS = ['plan', 'recipe_type', 'letterhead', 'diagnosis', 'monodrug', 'commercial_name', 'tys_code', 'substitution', 'validator_name', 'validator_type'];
const MAX_TEXT = 500;
const MAX_OBSERVATIONS = 8000;

function optionalInteger(raw, label) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { value: null };
  const number = Number(raw);
  if (!Number.isInteger(number) || number < 0) return { error: `${label} debe ser un número entero válido` };
  return { value: number };
}

export function normalizeSocialWorkName(name) {
  return String(name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function validateNewSocialWork(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return { error: 'El nombre de la obra social es obligatorio' };
  if (name.length > 160) return { error: 'El nombre es demasiado largo' };
  const value = { name, active: body.active === undefined ? true : Boolean(body.active) };
  for (const field of TEXT_FIELDS) {
    const text = body[field] == null ? '' : String(body[field]).trim();
    if (text.length > MAX_TEXT) return { error: `Campo ${field} demasiado largo` };
    value[field] = text || null;
  }
  const validity = optionalInteger(body.recipe_validity_days, 'La vigencia de la receta');
  if (validity.error) return { error: validity.error };
  value.recipe_validity_days = validity.value;
  const rp = optionalInteger(body.rp, 'RP');
  if (rp.error) return { error: rp.error };
  value.rp = rp.value;
  const observations = body.observations == null ? '' : String(body.observations).trim();
  if (observations.length > MAX_OBSERVATIONS) return { error: 'Las observaciones son demasiado largas' };
  value.observations = observations || null;
  value.status = value.active ? 'Activa' : 'INACTIVA';
  return { value };
}
