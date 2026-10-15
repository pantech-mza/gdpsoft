import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { legacyNoteCandidate } from "../../lib/social-works/legacy-notes.mjs";

const file=process.argv.slice(2).find(a=>!a.startsWith("--"));
const apply=process.argv.includes("--apply");
const confirmed=process.argv.includes("--confirm=observaciones-legacy");
if (!file || !fs.existsSync(file)) {console.error('Uso: node --env-file=.env.local scripts/qa/import-ficha-observaciones.mjs "RUTA\\obras_sociales(3).json" [--apply --confirm=observaciones-legacy]');process.exit(2)}
if (apply && !confirmed) {console.error("Para aplicar necesitás --confirm=observaciones-legacy y respaldo previo de Supabase.");process.exit(2)}
const json=JSON.parse(fs.readFileSync(file,"utf8"));
if (!Array.isArray(json))throw new Error("Se esperaba un array JSON");
const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url||!key)throw new Error("Faltan variables SUPABASE_URL y SUPABASE_SECRET_KEY");
const supabase=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const {data:app,error:appError}=await supabase.from("social_works")
  .select("id,id_soft,name,plan,recipe_type,recipe_validity_days,rp,observations").order("id");
if(appError)throw new Error(`No se pudo leer ficha: ${appError.message}`);
// No consultar ni exponer el contenido de notas/credenciales ya existentes.
const {data:notes,error:notesError}=await supabase.from("social_work_notes")
  .select("id,social_work_id,legacy_id,source").not("legacy_id","is",null);
if(notesError)throw new Error("No se pudo consultar social_work_notes. ¿Ejecutaste la migración SQL?");
const byLegacy=new Map((app||[]).filter(o=>o.id_soft!=null).map(o=>[Number(o.id_soft),o]));
const existing=new Set((notes||[]).map(o=>`${o.social_work_id}:${o.legacy_id}`));
const stats={source:json.length,appRows:(app||[]).length,matched:0,unmapped:0,
  coreMismatch:0,noObservations:0,alreadyStored:0,existingFichaObservation:0,
  generalPlanned:0,accessPlanned:0,tooLongSkipped:0,created:0,errors:0};
const candidates=[];
for(const row of json){
  const current=byLegacy.get(Number(row.id));
  if(!current){stats.unmapped++;continue}
  stats.matched++;
  const candidate=legacyNoteCandidate(row,current);
  if(!candidate){
    if(typeof row.observations==="string"&&row.observations.trim())stats.coreMismatch++;
    else stats.noObservations++;
    continue;
  }
  if(candidate.body.length>10000){stats.tooLongSkipped++;continue}
  if(current.observations?.trim() && current.observations.trim()===candidate.body){stats.existingFichaObservation++;continue}
  if(existing.has(`${current.id}:${row.id}`)){stats.alreadyStored++;continue}
  stats[candidate.kind==="ACCESS"?"accessPlanned":"generalPlanned"]++;
  candidates.push(candidate);
}
console.log(apply?"MODO: IMPORTACIÓN CONTROLADA":"MODO: SOLO AUDITORÍA");
console.table(stats);
console.log("Los nombres se conservan, no se crean OOSS. Las notas históricas quedan PENDIENTES DE REVISIÓN y no se envían a OpenAI.");
if(apply){
  for(const candidate of candidates){
    const {error}=await supabase.from("social_work_notes").insert(candidate);
    if(error){stats.errors++;console.error(`Error importando app_id=${candidate.social_work_id} / id_soft=${candidate.legacy_id}: ${error.code||"DB"}`)}
    else stats.created++;
  }
  console.log(`CREADAS: ${stats.created}; ERRORES: ${stats.errors}. Revisar Administración -> Recordá/Ficha. No se modificó social_works.`);
  if(stats.errors)process.exitCode=1;
}
