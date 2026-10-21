import { supabaseAdmin } from '../../../lib/supabase/admin';
import { actorFromRequest, jsonError } from '../../../lib/server/gdp-actor';
export const runtime='nodejs'; export const dynamic='force-dynamic';
async function context(request,uuid){
  const actor=await actorFromRequest(request);
  if(!actor || actor.role!=='SUCURSAL' || !actor.branch_id) return null;
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(uuid||''))) return null;
  const {data:device,error}=await supabaseAdmin.from('branch_devices').select('id,branch_id').eq('branch_id',actor.branch_id).eq('device_uuid',uuid).eq('active',true).maybeSingle();
  return error||!device?null:{actor,device};
}
async function allowedNotices(branchId){
  const {data:notices,error}=await supabaseAdmin.from('branch_notices').select('id,title,body,severity,all_branches,created_at')
    .eq('published',true).is('archived_at',null).order('created_at',{ascending:false}).limit(150);
  if(error) throw error;
  const targeted=(notices||[]).filter(n=>!n.all_branches).map(n=>n.id);
  let targets=[];
  if(targeted.length){
    const res=await supabaseAdmin.from('branch_notice_targets').select('notice_id').eq('branch_id',branchId).in('notice_id',targeted);
    if(res.error) throw res.error;
    targets=(res.data||[]).map(x=>x.notice_id);
  }
  return (notices||[]).filter(n=>n.all_branches || targets.includes(n.id));
}
export async function GET(request){
  const uuid=new URL(request.url).searchParams.get('device_uuid');
  const ctx=await context(request,uuid);
  if(!ctx) return jsonError('Sesión o dispositivo no autorizado',401);
  try{
    const notices=await allowedNotices(ctx.actor.branch_id);
    if(new URL(request.url).searchParams.get('history')==='1'){
      // Historial: todos los avisos de la sucursal (leídos o no), del más nuevo al más viejo.
      const {data:seen,error:seenError}=await supabaseAdmin.from('branch_notice_ack').select('notice_id').eq('device_id',ctx.device.id);
      if(seenError) throw seenError;
      const read=new Set((seen||[]).map(x=>x.notice_id));
      const limit=Math.min(Math.max(Number(new URL(request.url).searchParams.get('limit'))||5,1),150);
      return Response.json({ok:true,total:notices.length,notices:notices.slice(0,limit).map(n=>({...n,read:read.has(n.id)}))},{headers:{'Cache-Control':'no-store'}});
    }
    const {data:acks,error}=await supabaseAdmin.from('branch_notice_ack').select('notice_id').eq('device_id',ctx.device.id);
    if(error) throw error;
    const acknowledged=new Set((acks||[]).map(x=>x.notice_id));
    return Response.json({ok:true,notices:notices.filter(n=>!acknowledged.has(n.id))},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return jsonError(e.message||'Error de notificaciones',500);}
}
export async function POST(request){
  const body=await request.json().catch(()=>({}));
  const ctx=await context(request,body.device_uuid);
  if(!ctx) return jsonError('Sesión o dispositivo no autorizado',401);
  const noticeId=Number(body.notice_id);
  if(!Number.isInteger(noticeId)||noticeId<=0) return jsonError('Aviso inválido');
  try{
    const valid=await allowedNotices(ctx.actor.branch_id);
    if(!valid.some(n=>n.id===noticeId)) return jsonError('Aviso no disponible para esta sucursal',403);
    const {error}=await supabaseAdmin.from('branch_notice_ack').upsert({notice_id:noticeId,device_id:ctx.device.id,branch_id:ctx.actor.branch_id,acknowledged_at:new Date().toISOString()},{onConflict:'notice_id,device_id',ignoreDuplicates:true});
    return error?jsonError(error.message,500):Response.json({ok:true});
  }catch(e){return jsonError(e.message||'No se pudo registrar lectura',500);}
}
