import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../lib/server/gdp-actor';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const optionalId = x => x == null || x === '' ? null : (/^[1-9]\d*$/.test(x) ? Number(x) : NaN);
export async function GET(request){
 const auth=await requireAdminActor(request);
 if(!auth.actor)return jsonError(auth.error,auth.status);
 const p=new URL(request.url).searchParams;
 const days=Number(p.get('days')??'0'),branchId=optionalId(p.get('branch_id')),workId=optionalId(p.get('social_work_id')),deviceId=optionalId(p.get('device_id'));
 const page=Number(p.get('page')||1),pageSize=12;
 const day=String(p.get('day')||'');
 if(day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return jsonError('Fecha inválida',400);
 if(![0,1,7,30].includes(days)||[branchId,workId,deviceId].some(Number.isNaN)||!Number.isSafeInteger(page)||page<1||page>100000)return jsonError('Filtros inválidos',400);
 const [logs,branches,works]=await Promise.all([
   supabaseAdmin.rpc('gdp_assistant_activity_page_v3',{p_days:days,p_branch_id:branchId,p_social_work_id:workId,p_device_id:deviceId,p_question:String(p.get('question')||'').slice(0,180)||null,p_day:day||null,p_page:page,p_page_size:pageSize}),
   supabaseAdmin.from('branches').select('id,name').eq('active',true).order('name'),
   supabaseAdmin.from('social_works').select('id,name').eq('active',true).order('name')
 ]);
 if(logs.error||branches.error||works.error){console.error('Actividad lista v3',logs.error?.message||branches.error?.message||works.error?.message);return jsonError('Error en listado. Revisá migración de actividad v3.4.',500)}
 const results=logs.data||{},total=Number(results.total||0);
 return Response.json({ok:true,rows:results.rows||[],branches:branches.data||[],social_works:works.data||[],
   pagination:{page,pageSize,total,pages:Math.max(1,Math.ceil(total/pageSize))},is_super_admin:auth.actor.is_super_admin===true}, {headers:{'Cache-Control':'no-store'}});
}
