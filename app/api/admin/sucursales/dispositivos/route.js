import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function authorize(request) {
  const auth=await requireAdminActor(request);
  if(!auth.actor)return {error:jsonError(auth.error,auth.status)};
  return {actor:auth.actor};
}
function validId(x){const n=Number(x);return Number.isSafeInteger(n)&&n>0?n:null;}
export async function PATCH(request){
  const auth=await authorize(request);if(auth.error)return auth.error;
  const b=await request.json().catch(()=>({}));const id=validId(b.device_id);
  if(!id||typeof b.active!=='boolean')return jsonError('Datos inválidos',400);
  const {data,error}=await supabaseAdmin.from('branch_devices').update({active:b.active}).eq('id',id).is('removed_at',null).select('id').maybeSingle();
  if(error)return jsonError('No se pudo modificar dispositivo',500);
  if(!data)return jsonError('Dispositivo inexistente o quitado',404);
  return Response.json({ok:true});
}
export async function DELETE(request){
  const auth=await authorize(request);if(auth.error)return auth.error;
  const b=await request.json().catch(()=>({}));const id=validId(b.device_id);
  if(!id)return jsonError('Dispositivo inválido',400);
  // Baja lógica para conservar recepción de notificaciones y trazabilidad histórica.
  // El dispositivo no aparece más en Admin. Un nuevo registro puede volver a darlo de alta.
  const {data,error}=await supabaseAdmin.from('branch_devices').update({removed_at:new Date().toISOString(),active:false})
    .eq('id',id).is('removed_at',null).select('id').maybeSingle();
  if(error)return jsonError('No se pudo quitar el dispositivo',500);
  if(!data)return jsonError('Dispositivo inexistente o ya eliminado',404);
  return Response.json({ok:true,removed:true});
}
