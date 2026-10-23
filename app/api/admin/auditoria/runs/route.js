import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';
import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { modelList, validModel, PRICES } from '../../../../../lib/audit/live-core.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function superAdmin(request) {
  const a = await requireAdminActor(request);
  if (!a.actor) return { error: jsonError(a.error, a.status) };
  if (a.actor.is_super_admin !== true) return { error: jsonError('Solo el superadmin puede usar este módulo.', 403) };
  return { actor: a.actor };
}

export async function GET(request) {
  const auth = await superAdmin(request); if (!auth.actor) return auth.error;
  try {
    const p = new URL(request.url).searchParams;
    const { data: runs, error } = await supabaseAdmin.from('audit_runs').select('*').order('id', { ascending: false }).limit(15);
    if (error) throw error;
    const id = Number(p.get('run')) || runs?.[0]?.id || null;
    let run = null, workers = [], feed = [], counts = {};
    if (id) {
      run = (runs || []).find((r) => r.id === id) || (await supabaseAdmin.from('audit_runs').select('*').eq('id', id).maybeSingle()).data;
      const [w, f, c] = await Promise.all([
        supabaseAdmin.from('audit_run_workers').select('*').eq('run_id', id).order('worker_no'),
        supabaseAdmin.from('audit_proposals').select('id,query_id,social_work_name,circuit,branch_name,question,verdict_ai,cause,proposed_answer,sources,created_at').eq('run_id', id).order('id', { ascending: false }).limit(30),
        supabaseAdmin.from('audit_proposals').select('verdict_ai').eq('run_id', id).limit(20000),
      ]);
      workers = w.data || []; feed = f.data || [];
      for (const r of c.data || []) counts[r.verdict_ai] = (counts[r.verdict_ai] || 0) + 1;
    }
    const { data: hb } = await supabaseAdmin.from('audit_runner').select('heartbeat_at,host').eq('id', 1).maybeSingle();
    const connected = !!hb && Date.now() - Date.parse(hb.heartbeat_at) < 20000;
    return Response.json({ ok: true, runs: runs || [], run, workers, feed, counts, runner: { connected, host: hb?.host || null },
      models: modelList(process.env.AUDIT_MODELS), prices: PRICES }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET auditoria/runs', e);
    return jsonError('No se pudo leer la auditoría en vivo. ¿Se ejecutó la migración 20261024_auditoria_en_vivo.sql?', 500);
  }
}

export async function POST(request) {
  const auth = await superAdmin(request); if (!auth.actor) return auth.error;
  try {
    const b = await request.json();
    if (b.action === 'CONTROL') {
      const id = Number(b.id), control = String(b.control || '').toUpperCase();
      if (!Number.isSafeInteger(id) || !['RUN', 'PAUSE', 'STOP'].includes(control)) return jsonError('Control inválido', 400);
      const { data: cur } = await supabaseAdmin.from('audit_runs').select('status').eq('id', id).maybeSingle();
      if (!cur) return jsonError('Corrida inexistente', 404);
      if (control === 'STOP' && cur.status === 'QUEUED') await supabaseAdmin.from('audit_runs').update({ control, status: 'STOPPED', finished_at: new Date().toISOString(), message: 'Cancelada antes de empezar' }).eq('id', id);
      else await supabaseAdmin.from('audit_runs').update({ control }).eq('id', id);
      return Response.json({ ok: true });
    }
    const model = String(b.model || '').trim();
    const since = new Date(String(b.since || ''));
    const workers = Math.min(8, Math.max(1, Number(b.workers) || 4));
    if (!validModel(model)) return jsonError('Modelo inválido', 400);
    if (Number.isNaN(since.getTime())) return jsonError('Fecha inválida', 400);
    const { data: active } = await supabaseAdmin.from('audit_runs').select('id').in('status', ['QUEUED', 'PREPARING', 'RUNNING', 'PAUSED']).limit(1);
    if (active?.length) return jsonError('Ya hay una corrida en curso. Esperá a que termine o detenela.', 409);
    const { data, error } = await supabaseAdmin.from('audit_runs').insert({ model, since: since.toISOString(), workers, created_by: auth.actor.id }).select('id').single();
    if (error) throw error;
    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    console.error('POST auditoria/runs', e);
    return jsonError('No se pudo crear la corrida', 500);
  }
}
