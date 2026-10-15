import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const optionalId = x => x == null || x === '' ? null : (/^[1-9]\d*$/.test(x) ? Number(x) : NaN);
export async function GET(request) {
 const auth=await requireAdminActor(request);
 if(!auth.actor)return jsonError(auth.error,auth.status);
 const p=new URL(request.url).searchParams;
 const days=Number(p.get('days')??'0'),branchId=optionalId(p.get('branch_id')),workId=optionalId(p.get('social_work_id')),deviceId=optionalId(p.get('device_id'));
 if(![0,1,7,30].includes(days)||[branchId,workId,deviceId].some(Number.isNaN))return jsonError('Filtros inválidos',400);
 const question=String(p.get('question')||'').slice(0,180)||null;
 const day=String(p.get('day')||'');
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return jsonError('Fecha inválida',400);
 const {data,error}=await supabaseAdmin.rpc('gdp_assistant_activity_dashboard_v3',{
  p_days:days,p_branch_id:branchId,p_social_work_id:workId,p_device_id:deviceId,p_question:question,p_day:day||null
 });
 if(error){console.error('Actividad v3',error.message);return jsonError('Falta migración 20261014_pilot_activity_baseline_and_devices.sql o falló la consulta',500)}
 return Response.json({ok:true,dashboard:data||{},is_super_admin:auth.actor.is_super_admin===true,period_days:days}, {headers:{'Cache-Control':'no-store'}});
}
