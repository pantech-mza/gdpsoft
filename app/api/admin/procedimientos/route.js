import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../lib/server/gdp-actor';
import {validDraft,uniqueCode,cleanText,buildPendingRevision} from '../../../../lib/procedimientos/config.mjs';
export const runtime='nodejs'; export const dynamic='force-dynamic';
const ok = (data={},status=200)=> Response.json({ok:true,...data},{status,headers:{'Cache-Control':'no-store'}});
const statusIs = (value, allowed) => allowed.includes(value);
export async function GET(request){
 const access=await requireAdminActor(request);
 if(!access.actor)return jsonError(access.error,access.status);
 const {data,error}=await supabaseAdmin.from('internal_procedures')
  .select('id,code,title,question,answer,intent,scope,social_work_id,billing_channel_id,source_document,source_pages,source_storage_path,source_type,review_notes,status,active,approved_at,approved_by,created_at,updated_at')
  .order('created_at',{ascending:false}).limit(1000);
 return error?jsonError('No se pudieron leer los procedimientos: '+error.message,500):ok({procedures:data||[]});
}
export async function POST(request){
 const access=await requireAdminActor(request);
 if(!access.actor)return jsonError(access.error,access.status);
 const b=await request.json().catch(()=>({}));
 const validated=validDraft(b);
 if(validated.error)return jsonError(validated.error);
 // La alta manual no publica ni activa el procedimiento.
 const {data,error}=await supabaseAdmin.from('internal_procedures').insert({
  code:uniqueCode(),...validated.value,source_type:'MANUAL',status:'DRAFT',active:false,created_by:access.actor.id,
  source_pages:cleanText(b.source_pages,90)||null
 }).select('id').single();
 return error?jsonError(error.message,500):ok({id:data.id},201);
}
export async function PATCH(request){
 const access=await requireAdminActor(request);
 if(!access.actor)return jsonError(access.error,access.status);
 const b=await request.json().catch(()=>({})),id=Number(b.id),action=String(b.action||'');
 if(!Number.isInteger(id)||id<1||!['approve','archive','edit','reject','reopen','revise'].includes(action))return jsonError('Solicitud inválida');
 const {data:existing,error:readError}=await supabaseAdmin.from('internal_procedures').select('*').eq('id',id).maybeSingle();
 if(readError||!existing)return jsonError(readError?.message||'No existe el procedimiento',404);
 const stamp=new Date().toISOString();
 if (action === 'revise') {
  // Approved procedures remain live until Save, never while simply typing.
  // Once saved, the procedure is disabled and must be approved again.
  const result = buildPendingRevision(existing,b,stamp);
  if(result.error)return jsonError(result.error,409);
  if(String(b.updated_at??'')!==String(existing.updated_at??''))
   return jsonError('Otro administrador modificó este procedimiento. Actualizá la pantalla antes de guardar.',409);
  let update = supabaseAdmin.from('internal_procedures').update(result.value).eq('id',id).eq('status',existing.status);
  update = existing.updated_at ? update.eq('updated_at',existing.updated_at) : update.is('updated_at',null);
  const {data,error}=await update.select('id').maybeSingle();
  if(error)return jsonError('No se pudo guardar la revisión: '+error.message,500);
  if(!data)return jsonError('El procedimiento cambió durante la edición. Actualizá antes de guardar.',409);
  return ok({id:data.id,status:'DRAFT',active:false});
 }
 if(action==='archive'){
  if(!statusIs(existing.status,['APPROVED','DRAFT','REJECTED'])) return jsonError('Estado no archivable',409);
  const {error}=await supabaseAdmin.from('internal_procedures').update({active:false,status:'ARCHIVED',updated_at:stamp}).eq('id',id).eq('status',existing.status);
  return error?jsonError(error.message,500):ok();
 }
 if(action==='reopen'){
  if(!statusIs(existing.status,['REJECTED','ARCHIVED']))return jsonError('Solo se pueden reabrir rechazados o archivados',409);
  const {error}=await supabaseAdmin.from('internal_procedures').update({active:false,status:'DRAFT',approved_at:null,approved_by:null,rejected_at:null,rejected_by:null,updated_at:stamp}).eq('id',id).eq('status',existing.status);
  return error?jsonError(error.message,500):ok();
 }
 if(existing.status!=='DRAFT')return jsonError('Solo se pueden modificar, rechazar o aprobar borradores. Archivá y reabrí para crear otra revisión.',409);
 if(action==='reject'){
  const review_notes=cleanText(b.review_notes,3000);
  if(review_notes.length<10)return jsonError('Indicá un motivo de rechazo de al menos 10 caracteres.');
  const {error}=await supabaseAdmin.from('internal_procedures').update({active:false,status:'REJECTED',review_notes,rejected_at:stamp,rejected_by:access.actor.id,updated_at:stamp}).eq('id',id).eq('status','DRAFT');
  return error?jsonError(error.message,500):ok();
 }
 if(action==='edit'){
  const validated=validDraft({...existing,...b});
  if(validated.error)return jsonError(validated.error);
  const {error}=await supabaseAdmin.from('internal_procedures').update({...validated.value,source_pages:cleanText(b.source_pages??existing.source_pages,90)||null,updated_at:stamp}).eq('id',id).eq('status','DRAFT');
  return error?jsonError(error.message,500):ok();
 }
 if(b.confirmation!=='REVISADO')return jsonError('Confirmá la revisión por el responsable antes de aprobar.');
 const validated=validDraft(existing);
 if(validated.error)return jsonError(validated.error);
 if(['PDF','DOC','DOCX','XLS','XLSX'].includes(existing.source_type)&&!existing.source_storage_path) return jsonError('No existe el archivo fuente original para esta importación.',409);
 // No publica automaticamente un documento interpretado por IA.
 const {error}=await supabaseAdmin.from('internal_procedures').update({status:'APPROVED',active:true,approved_by:access.actor.id,approved_at:stamp,updated_at:stamp}).eq('id',id).eq('status','DRAFT');
 return error?jsonError(error.message,500):ok();
}
