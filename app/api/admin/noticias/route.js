import { detectWorkFromTitle } from '../../../../lib/server/notice-work-detect.mjs';
import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { deactivateAllCachedAnswers } from '../../../../lib/assistant/admin-corrections.mjs';
import { actorFromRequest, adminActor, jsonError } from '../../../../lib/server/gdp-actor';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Un aviso para el bot cambia lo que el asistente responde: se descartan las respuestas guardadas (de esa obra social o de todas).
async function invalidateBotCache(socialWorkId) {
  try {
    if (Number.isInteger(Number(socialWorkId)) && Number(socialWorkId) > 0) return await deactivateAllCachedAnswers(supabaseAdmin, socialWorkId);
    const { error } = await supabaseAdmin.from('assistant_answer_cache').update({ active: false }).eq('active', true);
    return !error;
  } catch { return false; }
}
async function invalidateForNotice(id) {
  const { data } = await supabaseAdmin.from('branch_notices').select('social_work_id,bot_use').eq('id', id).maybeSingle();
  if (data?.bot_use) await invalidateBotCache(data.social_work_id);
}
const botFields = (body) => {
  const swRaw = body.social_work_id;
  const social_work_id = swRaw === null || swRaw === undefined || swRaw === '' ? null : Number(swRaw);
  return { social_work_id: Number.isSafeInteger(social_work_id) && social_work_id > 0 ? social_work_id : null, bot_use: body.bot_use === true };
};

// v3.13.165 — todo aviso nuevo lo usa el asistente (salvo que se destilde) y la obra social se detecta por el título («OSEP - CONVENIO…»).
async function newNoticeBotFields(body, title) {
  const base = botFields(body);
  const bot_use = body.bot_use !== false;
  if (!bot_use) return { social_work_id: null, bot_use: false };
  return { social_work_id: base.social_work_id || (await detectWorkFromTitle(supabaseAdmin, title)), bot_use: true };
}

export async function GET(request) {
  const actor = await actorFromRequest(request);
  if (!adminActor(actor)) return jsonError('No autorizado',403);
  const [n,b,t,a,sw] = await Promise.all([
    supabaseAdmin.from('branch_notices').select('id,title,body,severity,all_branches,published,created_at,archived_at,created_by,social_work_id,bot_use').order('created_at',{ascending:false}).limit(150),
    supabaseAdmin.from('branches').select('id,name,code,active,branch_type').eq('active',true).order('name'),
    supabaseAdmin.from('branch_notice_targets').select('notice_id,branch_id').limit(10000),
    supabaseAdmin.from('branch_notice_ack').select('notice_id,device_id,branch_id').limit(10000),
    supabaseAdmin.from('social_works').select('id,name,active').order('name').limit(1000),
  ]);
  const error = n.error || b.error || t.error || a.error;
  if (error) return jsonError(error.message,500);
  const notices=(n.data||[]).map(note=>({
    ...note, branch_ids: (t.data||[]).filter(x=>x.notice_id===note.id).map(x=>x.branch_id),
    closed_devices: (a.data||[]).filter(x=>x.notice_id===note.id).length
  }));
  return Response.json({ok:true,notices,branches:b.data||[],social_works:sw.data||[]});
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
  const botNew=await newNoticeBotFields(body,title);
  const {data:notice,error}=await supabaseAdmin.from('branch_notices').insert({title,body:message,severity,all_branches:all,created_by:actor.id,published:true,...botNew}).select('id').single();
  if(error || !notice) return jsonError(error?.message||'No se pudo publicar',500);
  if(!all) {
    const {error:targetErr}=await supabaseAdmin.from('branch_notice_targets').insert(ids.map(branch_id=>({notice_id:notice.id,branch_id})));
    if(targetErr){await supabaseAdmin.from('branch_notices').delete().eq('id',notice.id);return jsonError('No se asignaron las sucursales: '+targetErr.message,500);}
  }
  if (botNew.bot_use) await invalidateBotCache(botNew.social_work_id);
  return Response.json({ok:true,id:notice.id,bot_use:botNew.bot_use,bot_social_work_id:botNew.social_work_id},{status:201});
}

export async function PATCH(request) {
  const actor=await actorFromRequest(request);
  if(!adminActor(actor)) return jsonError('No autorizado',403);
  const body=await request.json().catch(()=>({}));const id=Number(body.id);
  if(!Number.isInteger(id)||id<1||!['archive','republish','edit','bot'].includes(body.action)) return jsonError('Acción inválida');
  // v3.13.165 — interruptor por aviso: el administrador decide si el asistente lo usa y para qué obra social.
  if (body.action === 'bot') {
    const {data:prev}=await supabaseAdmin.from('branch_notices').select('title,social_work_id,bot_use').eq('id',id).maybeSingle();
    if(!prev) return jsonError('Aviso inexistente',404);
    const base=botFields(body);
    const use=body.bot_use===true;
    const swId=use?(base.social_work_id||await detectWorkFromTitle(supabaseAdmin,prev.title)):null;
    const {error:botError}=await supabaseAdmin.from('branch_notices').update({bot_use:use,social_work_id:use?swId:prev.social_work_id}).eq('id',id);
    if(botError) return jsonError(botError.message,500);
    if (use) await invalidateBotCache(swId);
    if (prev.bot_use && prev.social_work_id!==swId) await invalidateBotCache(prev.social_work_id);
    if (!use && prev.bot_use) await invalidateBotCache(prev.social_work_id);
    let name=null; if(swId){const {data:w}=await supabaseAdmin.from('social_works').select('name').eq('id',swId).maybeSingle(); name=w?.name||null;}
    return Response.json({ok:true,bot_use:use,social_work_id:use?swId:prev.social_work_id,social_work_name:name});
  }
  // v3.13.93 — corregir título, mensaje o prioridad de un aviso ya publicado (errores de tipeo).
  // Los destinatarios no cambian. Con reshow=true además se reinician los cierres para que vuelva a mostrarse.
  if (body.action === 'edit') {
    const title=String(body.title||'').trim(), message=String(body.body||'').trim();
    const severity=String(body.severity||'').toUpperCase();
    if (title.length<3 || title.length>140 || message.length<3 || message.length>4000 || !['INFO','IMPORTANT','URGENT'].includes(severity)) return jsonError('Título, mensaje o importancia inválidos');
    const {data:prev}=await supabaseAdmin.from('branch_notices').select('social_work_id,bot_use').eq('id',id).maybeSingle();
    const {data:updated,error:editError}=await supabaseAdmin.from('branch_notices').update({title,body:message,severity,...botFields(body)}).eq('id',id).select('id').maybeSingle();
    if(editError)return jsonError(editError.message,500);
    if(!updated)return jsonError('Aviso inexistente',404);
    const nf = botFields(body);
    if (nf.bot_use) await invalidateBotCache(nf.social_work_id);
    if (prev?.bot_use && (!nf.bot_use || prev.social_work_id !== nf.social_work_id)) await invalidateBotCache(prev.social_work_id);
    if (body.reshow === true) {
      const {error:ackError}=await supabaseAdmin.from('branch_notice_ack').delete().eq('notice_id',id);
      if(ackError)return jsonError('Se guardó el texto, pero no se pudieron restablecer los cierres: '+ackError.message,500);
    }
    return Response.json({ok:true});
  }
  // Volver a mostrar: reiniciar acks de todas las PCs. No duplica la noticia.
  if (body.action === 'republish') {
    const {data:found,error:lookupError}=await supabaseAdmin.from('branch_notices').select('id').eq('id',id).maybeSingle();
    if(lookupError)return jsonError(lookupError.message,500);
    if(!found)return jsonError('Aviso inexistente',404);
    const {error:ackError}=await supabaseAdmin.from('branch_notice_ack').delete().eq('notice_id',id);
    if(ackError)return jsonError('No se pudieron restablecer los cierres: '+ackError.message,500);
    const {error}=await supabaseAdmin.from('branch_notices').update({published:true,archived_at:null}).eq('id',id);
    await invalidateForNotice(id);
    return error?jsonError(error.message,500):Response.json({ok:true});
  }
  const {error}=await supabaseAdmin.from('branch_notices').update({published:false,archived_at:new Date().toISOString()}).eq('id',id);
  await invalidateForNotice(id);
  return error?jsonError(error.message,500):Response.json({ok:true});
}

export async function DELETE(request) {
  const actor=await actorFromRequest(request);
  if(!adminActor(actor)) return jsonError('No autorizado',403);
  const body=await request.json().catch(()=>({}));
  const id=Number(body.id);
  if(!Number.isSafeInteger(id)||id<1)return jsonError('Aviso inválido',400);
  // Las tablas branch_notice_targets / branch_notice_ack tienen ON DELETE CASCADE.
  const {data,error}=await supabaseAdmin.from('branch_notices').delete().eq('id',id).select('id,social_work_id,bot_use').maybeSingle();
  if(error)return jsonError(error.message,500);
  if(!data)return jsonError('Aviso inexistente',404);
  if(data.bot_use) await invalidateBotCache(data.social_work_id);
  return Response.json({ok:true});
}
