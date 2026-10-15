// Sincronización CONTROLADA desde PlataSoft. Por defecto no escribe.
// Ejecución: node --env-file=.env.local scripts/qa/sync-ficha-validadores.mjs "C:\\ruta\\obras_sociales.json"
// Aplicación: ... --apply --confirm=validadores-ficha
// Usa id_soft y compara nombre normalizado. NUNCA actualiza valores existentes.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const sourcePath = args.find((arg) => !arg.startsWith('--'));
const apply = args.includes('--apply');
const confirmed = args.includes('--confirm=validadores-ficha');
if (!sourcePath || (apply && !confirmed)) {
  console.error('Uso: node --env-file=.env.local scripts/qa/sync-ficha-validadores.mjs <obras_sociales.json> [--apply --confirm=validadores-ficha]');
  process.exit(1);
}

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]/g, '');
const empty = (value) => value == null || String(value).trim() === '';
const sensitive = (value) => /\b(usuario|clave|password|contrasena|contraseña|token|api[\s_-]?key)\s*[:=]|[a-z0-9._%+-]+:[^/@ ]+@/i.test(String(value ?? ''));
const invalidMethod = (value) => {
  const v = String(value ?? '').trim();
  return /[\\/]|https?:|\.pdf\b|\.docx?\b/i.test(v) || /^(0|-|null)$/i.test(v);
};
const data = JSON.parse(fs.readFileSync(path.resolve(sourcePath), 'utf8'));
if (!Array.isArray(data)) throw new Error('El JSON debe ser un array de registros');
const ids = new Set();
for (const r of data) {
  if (!Number.isInteger(Number(r.id)) || ids.has(Number(r.id))) throw new Error('IDs de origen inválidos o repetidos');
  ids.add(Number(r.id));
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY');
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }});
const db = [];
for (let offset = 0; ; offset += 500) {
  const { data: rows, error } = await supabase.from('social_works')
    .select('id,id_soft,name,validator_name,validator_type')
    .range(offset, offset + 499);
  if (error) throw new Error('No se pudo consultar social_works. Aplicá primero la migración SQL. ' + error.message);
  db.push(...(rows ?? []));
  if (!rows || rows.length < 500) break;
}
const byLegacyId = new Map(db.filter(x => x.id_soft != null).map(x => [Number(x.id_soft), x]));
const counters = { source: data.length, matched: 0, missing: 0, nameMismatch: 0, sensitiveSkipped: 0, invalidTypeSkipped: 0, unchanged: 0, conflict: 0, updatesPlanned: 0, updated: 0 };
const notices = [];
for (const source of data) {
  const row = byLegacyId.get(Number(source.id));
  if (!row) { counters.missing++; notices.push(`SIN ID_SOFT: ${source.id}`); continue; }
  if (normalize(source.names) !== normalize(row.name)) {
    counters.nameMismatch++;
    notices.push(`REVISAR NOMBRE: id_soft ${source.id} (${row.name})`);
    continue;
  }
  counters.matched++;
  for (const col of ['validator_name','validator_type']) {
    let value = source[col];
    if (empty(value)) continue;
    if (sensitive(value)) {
      counters.sensitiveSkipped++;
      notices.push(`OMITIDO POR POSIBLES CREDENCIALES: id_soft ${source.id} campo ${col}`);
      continue;
    }
    if (col === 'validator_type' && invalidMethod(value)) {
      counters.invalidTypeSkipped++;
      notices.push(`TIPO NO VÁLIDO: id_soft ${source.id}`);
      continue;
    }
    value = String(value).trim();
    if (!empty(row[col])) {
      if (normalize(row[col]) === normalize(value)) counters.unchanged++;
      else {
        counters.conflict++;
        notices.push(`CONFLICTO NO SOBRESCRITO: id_soft ${source.id} campo ${col}`);
      }
      continue;
    }
    counters.updatesPlanned++;
    if (!apply) continue;
    // Escritura por campo y condición de valor anterior: no sobreescribe cambios simultáneos.
    let q = supabase.from('social_works').update({ [col]: value }).eq('id', row.id);
    q = row[col] === null ? q.is(col, null) : q.eq(col, '');
    const { data: changed, error } = await q.select('id');
    if (error) throw new Error(`Error actualizando id_soft=${source.id}, campo=${col}: ${error.message}`);
    if (changed?.length === 1) counters.updated++;
    else notices.push(`SIN CAMBIO (concurrencia): id_soft ${source.id}, ${col}`);
  }
}
console.log(`MODO: ${apply ? 'APLICAR' : 'SOLO AUDITORÍA, SIN CAMBIOS'}`);
console.table(counters);
if (notices.length) {
  console.log('Primeras observaciones (sin valores sensibles):');
  notices.slice(0, 35).forEach(x=>console.log('- ' + x));
  if (notices.length > 35) console.log(`... ${notices.length - 35} observaciones adicionales`);
}
if (!apply) console.log('Ninguna fila fue modificada. Revisá especialmente los conflictos antes de habilitar --apply.');
