import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../lib/server/gdp-actor';
export const runtime='nodejs'; export const dynamic='force-dynamic';
export async function GET(request){
 const access = await requireAdminActor(request);
 if (!access.actor) return jsonError(access.error, access.status);
 const {data,error}=await supabaseAdmin.from('internal_procedures').select('id,code,title,question,answer,intent,scope,social_work_id,billing_channel_id,source_document,source_pages,review_notes,status,active,approved_at,approved_by').order('id').limit(500);
 return error?jsonError('No se pudieron cargar los procedimientos. Verificá los registros en Supabase.',500):Response.json({ok:true,procedures:data||[]},{headers:{'Cache-Control':'no-store, max-age=0'}});
}
export async function PATCH(request){
 const access = await requireAdminActor(request);
 if (!access.actor) return jsonError(access.error, access.status);
 const b=await request.json().catch(()=>({})); const id=Number(b.id), action=b.action;
 if(!Number.isInteger(id)||id<1||!['approve','archive','edit'].includes(action))return jsonError('Solicitud inválida');
 const {data:existing,error:readError}=await supabaseAdmin.from('internal_procedures').select('*').eq('id',id).maybeSingle();
 if(readError||!existing)return jsonError(readError?.message||'No existe el procedimiento',404);
 if(action==='archive'){
  const {error}=await supabaseAdmin.from('internal_procedures').update({active:false,status:'ARCHIVED',updated_at:new Date().toISOString()}).eq('id',id);
  return error?jsonError(error.message,500):Response.json({ok:true});
 }
 if(existing.status!=='DRAFT')return jsonError('No se puede modificar un procedimiento ya aprobado. Archivarlo y crear nueva versión.',409);
 if(action==='edit'){
  const question=String(b.question||'').trim(), answer=String(b.answer||'').trim(), notes=String(b.review_notes||'').trim();
  if(question.length<8||answer.length<12||answer.length>6000)return jsonError('Pregunta y respuesta inválidas');
  const {error}=await supabaseAdmin.from('internal_procedures').update({question,answer,review_notes:notes,updated_at:new Date().toISOString()}).eq('id',id).eq('status','DRAFT');
  return error?jsonError(error.message,500):Response.json({ok:true});
 }
 if(b.confirmation!=='REVISADO')return jsonError('Confirmá revisión de la fuente y la autorización del área de Obras Sociales');
 if(!existing.source_document||!existing.answer||!existing.question)return jsonError('El procedimiento carece de fuente o contenido');
 // Aprobación habilita consulta permanente. No indica que exista una caída activa.
 const {error}=await supabaseAdmin.from('internal_procedures').update({status:'APPROVED',active:true,approved_by:access.actor.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).eq('status','DRAFT');
 return error?jsonError(error.message,500):Response.json({ok:true});
}
