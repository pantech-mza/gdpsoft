/**
 * Preparar procedimientos internos de GDPSoft en una tabla CENTRAL.
 * Default: DRY-RUN; --apply crea DRAFT/inactivo; --trees-for=ID opcional
 * crea candidatos SUGGESTED para revisar en ESA obra social, no publicados.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const select = (key) => args.find(x => x.startsWith(`--${key}=`))?.slice(key.length + 3);
const socialWorkId = select('trees-for') ? Number(select('trees-for')) : null;
if (select('trees-for') && (!Number.isInteger(socialWorkId) || socialWorkId <= 0)) throw new Error('Usar --trees-for=ID numérico');
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('Falta SUPABASE_URL o SUPABASE_SECRET_KEY. Usá node --env-file=.env.local');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const payload = JSON.parse(readFileSync('data/gdp-procedimientos/protocolos_para_revision.json','utf8'));
const records = payload.records;
const result = { mode: apply?'APLICAR DRAFT':'VISTA PREVIA', proceduresCreated: 0, procedureExisting: 0, treesCreated: 0, treeExisting: 0, excluded: payload.excluded, errors: [] };
let sw=null, isImed=false;
if (socialWorkId) {
  const {data,error} = await db.from('social_works').select('id,name,active').eq('id',socialWorkId).maybeSingle();
  if (error || !data) throw new Error(`Obra social ${socialWorkId} no encontrada: ${error?.message||''}`);
  sw=data;
  const {data:rows,error:e} = await db.from('social_work_validators')
    .select('billing_channel_id,validator_id,validators!inner(name,slug),effective_from,effective_to')
    .eq('social_work_id',socialWorkId);
  if(e) throw new Error('No se pudo leer validadores: '+e.message);
  const today = new Date().toISOString().slice(0,10);
  // Para crear candidatos IMED no alcanza el nombre histórico: exigir asociación actual y sin ambigüedad.
  isImed=(rows||[]).some(v=>[v.validators?.name,v.validators?.slug].some(x=>String(x||'').trim().toLowerCase()==='imed') && !v.billing_channel_id && (!v.effective_from||v.effective_from<=today) && (!v.effective_to||v.effective_to>=today));
}
for (const r of records) {
  const {data:existing,error:check} = await db.from('internal_procedures').select('id,status,active').eq('code',r.code).limit(1);
  if (check) throw new Error('Primero ejecutá sql/01_PROCEDIMIENTOS_INTERNOS.sql: '+check.message);
  if (existing?.length) result.procedureExisting++;
  else if (apply) {
    const row={code:r.code,title:r.title,question:r.question,answer:r.answer,intent:r.intent,scope:r.scope,source_document:r.source_document,source_pages:r.source_pages,review_notes:r.review_notes,status:'DRAFT',active:false};
    if(r.scope==='SOCIAL_WORK' && r.code==='GDP-OSEP')row.social_work_id=59;
    if(r.scope==='SOCIAL_WORK' && r.code==='GDP-PAMI-LOG')row.social_work_id=61;
    if(r.scope==='PAMI_IMED')row.social_work_id=61;
    const {error}=await db.from('internal_procedures').insert(row);
    if (error) result.errors.push(`${r.code} procedimiento: ${error.message}`); else result.proceduresCreated++;
  } else result.proceduresCreated++;
  if (!sw || !r.tree) continue;
  // No insertamos instrucciones excepcionales PAMI/IMED como árboles operativos.
  if (r.scope==='PAMI_IMED') continue;
  if (r.scope==='IMED' && !isImed) continue;
  if (r.code==='GDP-OSEP' && socialWorkId!==59)continue;
  if (r.code==='GDP-PAMI-LOG' && socialWorkId!==61)continue;
  if (r.scope==='SOCIAL_WORK' && !['GDP-OSEP','GDP-PAMI-LOG'].includes(r.code))continue;
  const title=`[GDP ${r.code}] ${r.title}`;
  const {data:found,error:findError} = await db.from('decision_tree_candidates')
    .select('id').eq('social_work_id',socialWorkId).eq('title',title).limit(1);
  if(findError) {result.errors.push(`${r.code} candidato: ${findError.message}`);continue;}
  if(found?.length){result.treeExisting++;continue;}
  if(apply){
    const {error:insertError}=await db.from('decision_tree_candidates').insert({
      social_work_id:socialWorkId, normative_id:null, title, status:'SUGGESTED',
      source_pages:r.source_pages || 'Procedimiento interno — revisar',
      description:`Fuente: ${r.source_document}. BORRADOR INTERNO: ${r.review_notes} (Asignar circuito y norma específica si corresponde, antes de publicar.)`.slice(0,1800),
      generated_json:{...r.tree,generated_from:'GDP_INTERNAL_DRAFT',internal_procedure_code:r.code}
    });
    if(insertError)result.errors.push(`${r.code} candidato: ${insertError.message}`);else result.treesCreated++;
  }else result.treesCreated++;
}
console.log(JSON.stringify({social_work:sw?.name||null,imed_link_verified:isImed,...result},null,2));
if (result.errors.length)process.exitCode=1;
