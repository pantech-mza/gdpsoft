import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../lib/server/gdp-actor';

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
    const params = new URL(request.url).searchParams;
    const branchId = positiveId(params.get('branch_id'));
    const socialWorkId = positiveId(params.get('social_work_id'));
    if (Number.isNaN(branchId) || Number.isNaN(socialWorkId)) return jsonError('Filtro inválido', 400);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let q = supabaseAdmin.from('assistant_query_log')
      .select('id,created_at,branch_id,social_work_id,question,answer,route,status,error_code,elapsed_ms,found,source,has_image')
      .gte('created_at', since)
      .or('traffic_type.is.null,traffic_type.not.in.(QA,AUTOMATED_QA)')
      .order('created_at', { ascending: false }).limit(120);
    if (branchId) q = q.eq('branch_id',branchId);
    if (socialWorkId) q = q.eq('social_work_id',socialWorkId);
    const [logs, branches, socialWorks] = await Promise.all([
      q,
      supabaseAdmin.from('branches').select('id,name').eq('active',true).order('name'),
      supabaseAdmin.from('social_works').select('id,name').eq('active',true).order('name')
    ]);
    if (logs.error || branches.error || socialWorks.error) {
      console.error('admin actividad:', logs.error || branches.error || socialWorks.error);
      return jsonError('No se pudo obtener la actividad del asistente',500);
    }
    return Response.json({
      ok:true, rows:logs.data||[], branches:branches.data||[], social_works:socialWorks.data||[],
      updated_at:new Date().toISOString(), limit:120, interval_seconds:5
    }, { headers: {'Cache-Control':'no-store, max-age=0'} });
  } catch (error) {
    console.error('admin actividad exception:',error);
    return jsonError('No se pudo obtener la actividad del asistente',500);
  }
}
