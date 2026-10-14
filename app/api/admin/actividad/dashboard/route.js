import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function positiveId(raw) {
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : NaN;
}
export async function GET(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return jsonError(access.error, access.status);
  try {
    const p = new URL(request.url).searchParams;
    const days = Number(p.get('days') || 7);
    const branchId = positiveId(p.get('branch_id'));
    const socialWorkId = positiveId(p.get('social_work_id'));
    if (![1,7,30].includes(days) || Number.isNaN(branchId) || Number.isNaN(socialWorkId)) return jsonError('Filtros inválidos',400);
    const {data,error} = await supabaseAdmin.rpc('gdp_assistant_activity_dashboard',{
      p_days:days, p_branch_id:branchId, p_social_work_id:socialWorkId
    });
    if (error) {
      console.error('gdp_assistant_activity_dashboard:', error.message);
      return jsonError('Error en el dashboard. Verificá que ejecutaste sql/03_DASHBOARD_CONSULTAS.sql',500);
    }
    return Response.json({ok:true,dashboard:data||{},period_days:days,updated_at:new Date().toISOString()}, {headers:{'Cache-Control':'no-store, max-age=0'}});
  } catch (error) {
    console.error('admin dashboard exception:',error);
    return jsonError('No se pudo cargar el dashboard',500);
  }
}
