import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';
import { parseActivityFilters, callActivityRpc } from '../../../../../lib/server/activity-filters.mjs';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request) {
 const auth=await requireAdminActor(request);
 if(!auth.actor)return jsonError(auth.error,auth.status);
 const p=new URL(request.url).searchParams;
 const days=Number(p.get('days')??'0'),filters=parseActivityFilters(p);
 if(![0,1,7,30].includes(days)||!filters.ok)return jsonError('Filtros inválidos',400);
 const question=String(p.get('question')||'').slice(0,180)||null;
 const day=String(p.get('day')||'');
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return jsonError('Fecha inválida',400);
 const {data,error,legacy}=await callActivityRpc(supabaseAdmin,'dashboard',filters,{p_days:days,p_question:question,p_day:day||null});
 if(error){console.error('Actividad v3',error.message);return jsonError('Falta migración 20261014_pilot_activity_baseline_and_devices.sql o falló la consulta',500)}
 return Response.json({ok:true,dashboard:data||{},is_super_admin:auth.actor.is_super_admin===true,period_days:days,legacy_filters:legacy===true}, {headers:{'Cache-Control':'no-store'}});
}
