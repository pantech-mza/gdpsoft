import { requireAdminActor, jsonError } from '../../../../lib/server/gdp-actor';
import { supabaseAdmin } from '../../../../lib/supabase/admin';
import { deactivateCachedAnswers } from '../../../../lib/assistant/admin-corrections.mjs';
import { summarize, validateDecision, defaultAppliesTo } from '../../../../lib/audit/proposals.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const PAGE = 1000;
const LIGHT = 'id,query_id,social_work_id,social_work_name,circuit,branch_name,verdict_ai,cause,status,aging,admin_verdict,agrees_admin,query_created_at';
const FULL = `${LIGHT},question,bot_answer,route,proposed_answer,sources,note,applies_to_suggested,aging_detail,replay_verdict,replay_answer,replay_at,final_answer,final_applies_to,decided_at`;

async function superAdmin(request) {
  const a = await requireAdminActor(request);
  if (!a.actor) return { error: jsonError(a.error, a.status) };
  if (a.actor.is_super_admin !== true) return { error: jsonError('Solo el superadmin puede usar este módulo.', 403) };
  return { actor: a.actor };
}
async function readAll(select) {
  const out = [];
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await supabaseAdmin.from('audit_proposals').select(select).order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function GET(request) {
  const auth = await superAdmin(request); if (!auth.actor) return auth.error;
  try {
    const p = new URL(request.url).searchParams;
    const light = await readAll(LIGHT);
    const summary = summarize(light);
    const f = (r) =>
      (!p.get('status') || r.status === p.get('status')) && (!p.get('verdict') || r.verdict_ai === p.get('verdict')) &&
      (!p.get('circuit') || r.circuit === p.get('circuit')) && (!p.get('aging') || r.aging === p.get('aging')) &&
      (!p.get('cause') || r.cause === p.get('cause')) && (!p.get('work') || r.social_work_name === p.get('work'));
    const page = Math.max(1, Number(p.get('page')) || 1), size = 25;
    const matched = light.filter(f).sort((a, b) => b.id - a.id);
    const ids = matched.slice((page - 1) * size, page * size).map((r) => r.id);
    let items = [], variants = {};
    if (ids.length) {
      const [{ data: full, error: e1 }, { data: vs, error: e2 }] = await Promise.all([
        supabaseAdmin.from('audit_proposals').select(FULL).in('id', ids),
        supabaseAdmin.from('audit_variants').select('proposal_id,variant_question,replay_verdict').in('proposal_id', ids),
      ]);
      if (e1) throw e1; if (e2) throw e2;
      items = ids.map((id) => full.find((x) => x.id === id)).filter(Boolean);
      for (const v of vs || []) (variants[v.proposal_id] ||= []).push(v);
    }
    const works = [...new Set(light.map((r) => r.social_work_name).filter(Boolean))].sort();
    return Response.json({ ok: true, summary, items, variants, total_filtered: matched.length, page, page_size: size, works }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('GET auditoria', e);
    return jsonError('No se pudo leer la auditoría. ¿Se ejecutó la migración 20261023_auditoria_propuestas.sql?', 500);
  }
}

// Decisión del superadmin: aprobar (crea la corrección con alcance), confirmar una respuesta correcta o rechazar.
export async function POST(request) {
  const auth = await superAdmin(request); if (!auth.actor) return auth.error;
  try {
    const d = validateDecision(await request.json());
    if (d.error) return jsonError(d.error, 400);
    const { data: prop, error } = await supabaseAdmin.from('audit_proposals').select('*').eq('id', d.id).maybeSingle();
    if (error) throw error;
    if (!prop) return jsonError('Propuesta inexistente', 404);
    const now = new Date().toISOString();
    if (d.action === 'REJECT') {
      await supabaseAdmin.from('audit_proposals').update({ status: 'REJECTED', decided_by: auth.actor.id, decided_at: now }).eq('id', d.id);
      return Response.json({ ok: true, status: 'REJECTED' });
    }
    const { data: q, error: qe } = await supabaseAdmin.from('assistant_query_log').select('id,social_work_id,normalized_question').eq('id', prop.query_id).maybeSingle();
    if (qe) throw qe;
    if (!q) return jsonError('La consulta original ya no existe', 404);
    const appliesTo = d.appliesTo || prop.applies_to_suggested || defaultAppliesTo(prop.circuit);
    const confirm = d.action === 'CONFIRM';
    const verdict = confirm ? 'CORRECT' : (prop.verdict_ai === 'PARTIAL' ? 'PARTIAL' : 'INCORRECT');
    const row = { query_id: prop.query_id, reviewer_profile_id: auth.actor.id, verdict,
      comment: confirm ? 'Auditoría: respuesta confirmada' : `Auditoría (${prop.cause || 'sin causa'}): propuesta aprobada por superadmin`,
      suggested_answer: confirm ? '' : d.finalAnswer, updated_at: now, applies_to: appliesTo };
    let { error: se } = await supabaseAdmin.from('branch_response_reviews').upsert(row, { onConflict: 'query_id,reviewer_profile_id' });
    if (se && /applies_to/i.test(String(se.message || ''))) { const { applies_to, ...rest } = row; ({ error: se } = await supabaseAdmin.from('branch_response_reviews').upsert(rest, { onConflict: 'query_id,reviewer_profile_id' })); }
    if (se) throw se;
    if (!confirm) await deactivateCachedAnswers(supabaseAdmin, q.social_work_id, q.normalized_question);
    await supabaseAdmin.from('audit_proposals').update({ status: 'APPROVED', final_answer: confirm ? null : d.finalAnswer, final_applies_to: appliesTo, decided_by: auth.actor.id, decided_at: now }).eq('id', d.id);
    return Response.json({ ok: true, status: 'APPROVED', applies_to: appliesTo });
  } catch (e) {
    console.error('POST auditoria', e);
    return jsonError('No se pudo guardar la decisión', 500);
  }
}
