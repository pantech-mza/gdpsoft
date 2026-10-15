// Comparar el registro viejo con una ficha consolidada, SIN comparar el nombre
// (en el sistema anterior llevaba sufijos «- CAMARA», «- COLEGIO», etc.).
// social_works.id es app_id; social_works.id_soft es JSON.id.
export const STRUCTURED_LEGACY_FIELDS = Object.freeze([
  ['plan','plan'],['recipe_type','recipe_type'],
  ['recipe_validity','recipe_validity_days'],['letterhead','letterhead'],
  ['rp','rp'],['diagnosis','diagnosis'],['monodrug','monodrug'],
  ['commercial_name','commercial_name'],['substitution','substitution'],
]);
export function norm(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase().replace(/\s+/g,' ');
}
export function matchesLegacyFicha(source, appRow) {
  if (!source || !appRow || !Number.isInteger(Number(source.id))) return false;
  if (Number(source.id) !== Number(appRow.id_soft)) return false;
  return STRUCTURED_LEGACY_FIELDS.every(([oldKey,newKey]) =>
    norm(source[oldKey]) === norm(appRow[newKey]));
}
export function empty(value) { return value == null || String(value).trim() === ''; }
export function sensitiveText(value) {
  const s = String(value ?? '');
  // Bloquear textos con claves, tokens, passwords, cadenas de autorización.
  return /\b(usuario|clave|password|contrasena|contraseña|token|api[\s_-]?key|secret|credenciales?)\b|[a-z0-9._%+-]+:[^/@ ]+@/i.test(s);
}
export function invalidValidator(value) {
  return /[\\/]|https?:|\.(pdf|docx?)\b/i.test(String(value ?? '')) || /^(0|-|null)$/i.test(String(value ?? '').trim());
}
