/**
 * Sincronización controlada de Recordá/Ficha con las fichas históricas del cliente.
 * Nunca crea obras sociales ni altera nombres. Match: JSON.id === social_works.id_soft;
 * escritura: social_works.id (app_id), con ID legado como protección adicional.
 * Rechaza discrepancias en 9 campos estructurados; no sobrescribe valores actuales.
 * Observaciones de texto libre SOLO con lista explícita de IDs aprobados por Admin.
 * Por defecto AUDITORÍA DE SOLO LECTURA.
 *
 * node --env-file=.env.local scripts/qa/sync-ficha-unificada.mjs "C:\\Downloads\\obras_sociales(3).json"
 * ... --apply --confirm=ficha-unificada
 * ... --apply --confirm=ficha-unificada --approved-observations="C:\\privado\\ids_aprobados.txt"
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { matchesLegacyFicha, empty, norm, sensitiveText, invalidValidator } from '../../lib/assistant/ficha-legacy-match.mjs';

const args = process.argv.slice(2);
const input = args.find(x => !x.startsWith('--'));
const apply = args.includes('--apply');
const confirmed = args.includes('--confirm=ficha-unificada');
const approvedArg = args.find(x => x.startsWith('--approved-observations='));
if (!input || (apply && !confirmed) || (approvedArg && !apply)) {
  console.error('Uso: node --env-file=.env.local scripts/qa/sync-ficha-unificada.mjs <obras_sociales.json> [--apply --confirm=ficha-unificada] [--approved-observations=<ruta_privada_txt>]');
  process.exit(1);
}
const source = JSON.parse(fs.readFileSync(path.resolve(input),'utf8'));
if (!Array.isArray(source)) throw new Error('El JSON debe ser un array');
const sourceIds = new Set();
for (const row of source) {
  if (!Number.isInteger(Number(row.id)) || sourceIds.has(Number(row.id))) throw new Error('ID legado inválido o repetido');
  sourceIds.add(Number(row.id));
}
let approvedObservations = new Set();
if (approvedArg) {
  const filename = approvedArg.slice('--approved-observations='.length);
  const lines = fs.readFileSync(path.resolve(filename),'utf8').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if (lines.some(x=> !/^\d+$/.test(x))) throw new Error('La lista aprobada debe contener SOLO un id_soft por línea, sin encabezados.');
  approvedObservations = new Set(lines.map(Number));
  if (approvedObservations.size !== lines.length) throw new Error('La lista de observaciones contiene IDs repetidos');
  for (const id of approvedObservations) if (!sourceIds.has(id)) throw new Error(`ID legado no aparece en el JSON: ${id}`);
}
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Faltan variables Supabase');
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const rows=[];
for (let offset=0;;offset+=500) {
  const {data,error}=await db.from('social_works').select('id,id_soft,name,plan,recipe_type,recipe_validity_days,letterhead,rp,diagnosis,monodrug,commercial_name,substitution,observations,validator_name,validator_type').range(offset,offset+499);
  if (error) throw new Error('Error consultando social_works: '+error.message);
  rows.push(...(data||[]));
  if (!data || data.length<500) break;
}
const lookup=new Map(rows.filter(r=>r.id_soft!=null).map(r=>[Number(r.id_soft),r]));
const stats={source:source.length, appRows:rows.length, matched:0, legacyOnly:0, coreMismatch:0, differentNames:0, validatorsPlanned:0, validatorsUpdated:0, validatorConflicts:0, invalidOrSensitive:0, observationsPendingReview:0, observationsApproved:0, observationsUpdated:0, existingObservations:0};
const problems=[];
async function writeEmpty(row,column,desired) {
  let q=db.from('social_works').update({[column]:desired})
    .eq('id',Number(row.id)).eq('id_soft',Number(row.id_soft));
  q=row[column]==null ? q.is(column,null) : q.eq(column,'');
  const {data,error}=await q.select('id');
  if (error) throw new Error(`Error en app_id ${row.id}, ${column}: ${error.message}`);
  return data?.length===1;
}
for (const old of source) {
  const row=lookup.get(Number(old.id));
  if (!row) {stats.legacyOnly++; continue;} // Anexos unificados: nunca crear otra ficha.
  if (!matchesLegacyFicha(old,row)) {
    stats.coreMismatch++;
    problems.push(`ID_SOFT ${old.id} / APP_ID ${row.id}: requisitos estructurados diferentes; OMITIDO`);
    continue;
  }
  stats.matched++;
  if (norm(old.names)!==norm(row.name)) stats.differentNames++;
  for (const field of ['validator_name','validator_type']) {
    if (empty(old[field])) continue;
    if (sensitiveText(old[field]) || invalidValidator(old[field])) {stats.invalidOrSensitive++;continue;}
    const value=String(old[field]).trim();
    if (!empty(row[field])) {
      if (norm(row[field])!==norm(value)) {
        stats.validatorConflicts++;
        problems.push(`ID_SOFT ${old.id}: conflicto en ${field}; NO sobrescrito`);
      }
      continue;
    }
    stats.validatorsPlanned++;
    if (apply && await writeEmpty(row,field,value)) stats.validatorsUpdated++;
  }
  if (empty(old.observations)) continue;
  if (!empty(row.observations)) {stats.existingObservations++;continue;}
  // Las observaciones no son requisitos normativos validados; pueden estar desactualizadas.
  // Impedir su ingreso sin un documento local de aprobaciones explícitas.
  stats.observationsPendingReview++;
  if (!approvedObservations.has(Number(old.id))) continue;
  if (sensitiveText(old.observations)) {stats.invalidOrSensitive++; problems.push(`ID_SOFT ${old.id}: observación con datos sensibles, OMITIDA`);continue;}
  stats.observationsApproved++;
  if (apply && await writeEmpty(row,'observations',String(old.observations).trim())) stats.observationsUpdated++;
}
console.log('MODO: '+(apply?'APLICACIÓN CONTROLADA':'SOLO AUDITORÍA, SIN CAMBIOS'));
console.table(stats);
console.log('Nombres actuales conservados; ningún registro agregado ni eliminado; los IDs siguen app_id=SW.id e id_soft=JSON.id.');
if (problems.length) {
  console.log('Primeras incidencias (sin textos sensibles):');
  problems.slice(0,30).forEach(x=>console.log('- '+x));
  if (problems.length>30) console.log(`... ${problems.length-30} más`);
}
if (stats.observationsPendingReview) console.log('Observaciones históricas pendientes: requieren aprobación de Administración antes de incorporarlas a Ficha/bot.');
