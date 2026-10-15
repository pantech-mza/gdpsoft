// Clasificación defensiva: si una nota menciona posibles datos de acceso,
// mantener el texto completo fuera de Ficha pública y fuera del asistente IA.
export function isAccessInstruction(value) {
  const text=String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return /\b(password|passwd|contrasena|clave de acceso|clave de ingreso|credenciales (?:de acceso|para ingresar))\b/.test(text) ||
    /\b(clave|usuario|username|user|login)\s*[:=]/.test(text) ||
    /\b(usuario|clave|contrasena|password)\b[\s\S]{0,90}\b(ingresar|portal|validador|pagina|sistema|acceder)\b/.test(text);
}
export function normalizedCore(value) {return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase().replace(/\s+/g," ");}
export function coreMatches(source,current) {
  const pairs=[["plan","plan"],["recipe_type","recipe_type"],["recipe_validity","recipe_validity_days"],["rp","rp"]];
  return pairs.every(([a,b])=>normalizedCore(source[a])===normalizedCore(current[b]));
}
export function legacyNoteCandidate(source,current) {
  if (!source || !current || Number(source.id)!==Number(current.id_soft) || !coreMatches(source,current)) return null;
  const observation=typeof source.observations==="string"?source.observations.trim():"";
  if (!observation)return null;
  return {
    social_work_id:Number(current.id),legacy_id:Number(source.id),
    kind:isAccessInstruction(observation)?"ACCESS":"GENERAL",body:observation,
    source:"LEGACY",review_status:"PENDING",
    source_modified_at:source.modified || null,
  };
}
