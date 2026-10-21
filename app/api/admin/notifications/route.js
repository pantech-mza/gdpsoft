import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { requireAdminActor } from '../../../../lib/server/gdp-actor';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET: últimas notificaciones del administrador + cantidad sin leer.
export async function GET(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return Response.json({ ok: false, error: access.error }, { status: access.status });
  const [list, unread] = await Promise.all([
    supabaseAdmin.from('admin_notifications').select('id,type,title,body,link,social_work_id,ref_id,created_at,read_at')
      .order('created_at', { ascending: false }).limit(30),
    supabaseAdmin.from('admin_notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ]);
  if (list.error || unread.error) {
    return Response.json({ ok: false, error: 'No se pudieron leer las notificaciones. Revisá la migración 20261021_faq_semantic_detection.sql.' }, { status: 500 });
  }
  return Response.json({ ok: true, notifications: list.data || [], unread: unread.count || 0 }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { id } marca una como leída; POST {} marca todas.
export async function POST(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return Response.json({ ok: false, error: access.error }, { status: access.status });
  const body = await request.json().catch(() => ({}));
  let query = supabaseAdmin.from('admin_notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (body?.id != null) {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ ok: false, error: 'ID inválido' }, { status: 400 });
    query = query.eq('id', id);
  }
  const { error } = await query;
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
