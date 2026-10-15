import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { actorFromRequest, adminActor, jsonError } from '../../../../lib/server/gdp-actor';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const actor = await actorFromRequest(request);
  if (!adminActor(actor)) return jsonError('No autorizado',403);
  const [n,b,t,a] = await Promise.all([
    supabaseAdmin.from('branch_notices').select('id,title,body,severity,all_branches,published,created_at,archived_at,created_by').order('created_at',{ascending:false}).limit(150),
    supabaseAdmin.from('branches').select('id,name,code,active').eq('active',true).order('name'),
    supabaseAdmin.from('branch_notice_targets').select('notice_id,branch_id').limit(10000),
    supabaseAdmin.from('branch_notice_ack').select('notice_id,device_id,branch_id').limit(10000),
  ]);
  const error = n.error || b.error || t.error || a.error;
  if (error) return jsonError(error.message,500);
  const notices=(n.data||[]).map(note=>({
    ...note, branch_ids: (t.data||[]).filter(x=>x.notice_id===note.id).map(x=>x.branch_id),
    closed_devices: (a.data||[]).filter(x=>x.notice_id===note.id).length
  }));
  return Response.json({ok:true,notices,branches:b.data||[]});
}

export async function POST(request) {
  const actor=await actorFromRequest(request);
  if (!adminActor(actor)) return jsonError('No autorizado',403);
  const body=await request.json().catch(()=>({}));
  const title=String(body.title||'').trim(), message=String(body.body||'').trim();
  const severity=String(body.severity||'INFO').toUpperCase();
  const all=body.all_branches===true;
  const ids=[...new Set((Array.isArray(body.branch_ids)?body.branch_ids:[]).map(Number))];
  if (title.length<3 || title.length>140 || message.length<3 || message.length>4000 || !['INFO','IMPORTANT','URGENT'].includes(severity)) return jsonError('Título, mensaje o importancia inválidos');
  if (!all && (ids.length===0 || ids.some(id=>!Number.isInteger(id)||id<=0))) return jsonError('Elegí al menos una sucursal válida');
  if (!all) {
    const {data,error}=await supabaseAdmin.from('branches').select('id').eq('active',true).in('id',ids);
    if(error || data?.length!==ids.length) return jsonError('Hay sucursales inválidas o inactivas',400);
  }
  const {data:notice,error}=await supabaseAdmin.from('branch_notices').insert({title,body:message,severity,all_branches:all,created_by:actor.id,published:true}).select('id').single();
  if(error || !notice) return jsonError(error?.message||'No se pudo publicar',500);
  if(!all) {
    const {error:targetErr}=await supabaseAdmin.from('branch_notice_targets').insert(ids.map(branch_id=>({notice_id:notice.id,branch_id})));
    if(targetErr){await supabaseAdmin.from('branch_notices').delete().eq('id',notice.id);return jsonError('No se asignaron las sucursales: '+targetErr.message,500);}
  }
  return Response.json({ok:true,id:notice.id},{status:201});
}

export async function PATCH(request) {
  const actor=await actorFromRequest(request);
  if(!adminActor(actor)) return jsonError('No autorizado',403);
  const body=await request.json().catch(()=>({}));const id=Number(body.id);
  if(!Number.isInteger(id)||id<1||!['archive','republish'].includes(body.action)) return jsonError('Acción inválida');
  // Volver a mostrar: reiniciar acks de todas las PCs. No duplica la noticia.
  if (body.action === 'republish') {
    const {data:found,error:lookupError}=await supabaseAdmin.from('branch_notices').select('id').eq('id',id).maybeSingle();
    if(lookupError)return jsonError(lookupError.message,500);
    if(!found)return jsonError('Aviso inexistente',404);
    const {error:ackError}=await supabaseAdmin.from('branch_notice_ack').delete().eq('notice_id',id);
    if(ackError)return jsonError('No se pudieron restablecer los cierres: '+ackError.message,500);
    const {error}=await supabaseAdmin.from('branch_notices').update({published:true,archived_at:null}).eq('id',id);
    return error?jsonError(error.message,500):Response.json({ok:true});
  }
  const {error}=await supabaseAdmin.from('branch_notices').update({published:false,archived_at:new Date().toISOString()}).eq('id',id);
  return error?jsonError(error.message,500):Response.json({ok:true});
}

export async function DELETE(request) {
  const actor=await actorFromRequest(request);
  if(!adminActor(actor)) return jsonError('No autorizado',403);
  const body=await request.json().catch(()=>({}));
  const id=Number(body.id);
  if(!Number.isSafeInteger(id)||id<1)return jsonError('Aviso inválido',400);
  // Las tablas branch_notice_targets / branch_notice_ack tienen ON DELETE CASCADE.
  const {data,error}=await supabaseAdmin.from('branch_notices').delete().eq('id',id).select('id').maybeSingle();
  if(error)return jsonError(error.message,500);
  if(!data)return jsonError('Aviso inexistente',404);
  return Response.json({ok:true});
}
