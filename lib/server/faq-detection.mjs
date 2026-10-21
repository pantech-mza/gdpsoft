// GDPSoft v3.13.57 — detección de FAQ por significado (servidor).
// `db` es el cliente de Supabase (service role) y `embed(texts)` devuelve vectores.
import { resolveBranchGroup } from '../assistant/conversation-context.mjs';
import {
  FAQ_CLUSTER_SIMILARITY, FAQ_SERVE_SIMILARITY, FAQ_WINDOW_DAYS,
  buildFaqNotification, canServeSemanticFaq, findBestMatch, getSuggestThreshold, isFaqEligible,
} from '../faqs/semantic.mjs';

function normalizeText(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[¿?¡!,.;:()[\]{}"'`´]/g, ' ').replace(/\s+/g, ' ').trim();
}
const windowStart = () => new Date(Date.now() - FAQ_WINDOW_DAYS * 86400000).toISOString();

/** Registra una consulta respondida en su grupo y propone la FAQ al llegar al umbral. */
export async function applyFaqSignal({ db, signal, embedding, threshold = getSuggestThreshold() }) {
  const { data: clusters, error: clustersError } = await db.from('faq_clusters')
    .select('id,representative_question,embedding,faq_id,branch_group').eq('social_work_id', signal.socialWorkId);
  if (clustersError) throw new Error(clustersError.message);

  // Cámara y Colegio nunca comparten grupo: sus requisitos pueden diferir.
  const group = signal.branchGroup ?? null;
  const sameGroup = (clusters || []).filter((row) => (row.branch_group ?? null) === group);
  const match = findBestMatch(embedding, sameGroup, FAQ_CLUSTER_SIMILARITY);
  let cluster = match?.candidate || null;
  if (!cluster) {
    const { data, error } = await db.from('faq_clusters').insert({
      social_work_id: signal.socialWorkId, representative_question: signal.question, embedding,
      hit_count: 0, branch_group: group, last_asked_at: signal.createdAt || new Date().toISOString(),
    }).select('id,representative_question,embedding,faq_id,branch_group').single();
    if (error) throw new Error(error.message);
    cluster = data;
  }

  const { error: hitError } = await db.from('faq_cluster_hits').insert({
    cluster_id: cluster.id, branch_id: signal.branchId ?? null, device_id: signal.deviceId ?? null,
    question: signal.question, query_log_id: signal.queryLogId ?? null,
    created_at: signal.createdAt || new Date().toISOString(),
  });
  if (hitError) {
    if (hitError.code === '23505') return { status: 'DUPLICATE' };
    throw new Error(hitError.message);
  }

  const since = windowStart();
  const { count } = await db.from('faq_cluster_hits').select('id', { count: 'exact', head: true })
    .eq('cluster_id', cluster.id).gte('created_at', since);
  const hits = count || 0;
  await db.from('faq_clusters').update({
    hit_count: hits, last_asked_at: signal.createdAt || new Date().toISOString(),
    last_answer: signal.answer, last_source_type: signal.sourceType ?? null,
    last_normative_id: signal.normativeId ?? null,
  }).eq('id', cluster.id);

  if (cluster.faq_id) {
    await db.from('social_work_faqs').update({
      detected_count: hits, last_detected_at: new Date().toISOString(),
    }).eq('id', cluster.faq_id).eq('status', 'SUGGESTED');
    return { status: 'COUNTED', clusterId: cluster.id, hits };
  }
  if (hits < threshold) return { status: 'COUNTED', clusterId: cluster.id, hits };

  const { data: hitRows } = await db.from('faq_cluster_hits').select('branch_id')
    .eq('cluster_id', cluster.id).gte('created_at', since).limit(1000);
  const branches = new Set((hitRows || []).map((row) => row.branch_id).filter((id) => id != null)).size;
  const nowIso = new Date().toISOString();
  const { data: faq, error: faqError } = await db.from('social_work_faqs').insert({
    social_work_id: signal.socialWorkId, branch_id: null,
    question: cluster.representative_question, normalized_question: normalizeText(cluster.representative_question),
    answer: signal.answer, status: 'SUGGESTED', source_type: signal.sourceType ?? null,
    source_normative_id: signal.normativeId ?? null, detected_count: hits,
    first_detected_at: nowIso, last_detected_at: nowIso, active: true,
  }).select('id').single();
  if (faqError) throw new Error(faqError.message);

  const { data: claimed } = await db.from('faq_clusters').update({ faq_id: faq.id })
    .eq('id', cluster.id).is('faq_id', null).select('id');
  if (!claimed?.length) {
    await db.from('social_work_faqs').delete().eq('id', faq.id);
    return { status: 'COUNTED', clusterId: cluster.id, hits };
  }
  let socialWorkName = signal.socialWorkName;
  if (!socialWorkName) {
    const { data: work } = await db.from('social_works').select('name').eq('id', signal.socialWorkId).maybeSingle();
    socialWorkName = work?.name;
  }
  await db.from('admin_notifications').insert({
    ...buildFaqNotification({ socialWorkName, question: cluster.representative_question, count: hits, branches, group }),
    social_work_id: signal.socialWorkId, ref_id: faq.id,
  });
  return { status: 'SUGGESTED', clusterId: cluster.id, faqId: faq.id, hits };
}

export async function recordFaqSignal({ db, embed, signal }) {
  if (!isFaqEligible(signal) || !signal.socialWorkId) return { status: 'SKIPPED' };
  const [embedding] = await embed([signal.question]);
  if (!Array.isArray(embedding)) return { status: 'SKIPPED' };
  return applyFaqSignal({ db, signal, embedding });
}

/** FAQ aprobada para una pregunta parecida (no idéntica) a otra ya validada. */
export async function findSemanticApprovedFaq({ db, embed, socialWorkId, branchId, question, branchGroup = null }) {
  if (!socialWorkId || !canServeSemanticFaq(question)) return null;
  const { data: clusters, error } = await db.from('faq_clusters')
    .select('id,embedding,faq_id,branch_group').eq('social_work_id', socialWorkId).not('faq_id', 'is', null);
  const sameGroup = (clusters || []).filter((row) => (row.branch_group ?? null) === (branchGroup ?? null));
  if (error || !sameGroup.length) return null;
  const [embedding] = await embed([question]);
  const match = findBestMatch(embedding, sameGroup, FAQ_SERVE_SIMILARITY);
  if (!match) return null;
  const { data: faq } = await db.from('social_work_faqs').select('*')
    .eq('id', match.candidate.faq_id).eq('status', 'APPROVED').eq('active', true).maybeSingle();
  if (!faq) return null;
  if (faq.branch_id != null && Number(faq.branch_id) !== Number(branchId)) return null;
  return { ...faq, semantic_similarity: match.similarity };
}

/** Procesa las consultas del piloto ya registradas (una sola vez por consulta). */
export async function rebuildFaqSignalsFromLog({ db, embed, limit = 2000, budgetMs = 40000 }) {
  const startedAt = Date.now();
  const { data: rows, error } = await db.from('assistant_query_log')
    .select('id,branch_id,device_id,social_work_id,question,answer,route,source,normative_id,found,traffic_type,created_at')
    .eq('traffic_type', 'PILOT').eq('found', true).order('created_at', { ascending: true }).limit(limit);
  if (error) throw new Error(error.message);
  const signals = (rows || []).map((row) => ({
    socialWorkId: row.social_work_id, branchId: row.branch_id, deviceId: row.device_id, question: row.question,
    answer: row.answer, route: row.route, found: row.found, trafficType: row.traffic_type,
    sourceType: row.source, normativeId: row.normative_id, queryLogId: row.id, createdAt: row.created_at,
  })).filter((signal) => signal.socialWorkId && isFaqEligible(signal));

  const groups = new Map();
  for (const id of new Set(signals.map((signal) => Number(signal.branchId)).filter(Boolean))) {
    groups.set(id, await resolveBranchGroup(db, id));
  }
  for (const signal of signals) signal.branchGroup = groups.get(Number(signal.branchId)) ?? null;

  const names = new Map();
  const { data: works } = await db.from('social_works').select('id,name');
  for (const work of works || []) names.set(Number(work.id), work.name);

  // Consultas ya procesadas en corridas anteriores: se saltean sin costo.
  const done = new Set();
  const { data: doneRows } = await db.from('faq_cluster_hits').select('query_log_id').not('query_log_id', 'is', null).limit(20000);
  for (const row of doneRows || []) done.add(Number(row.query_log_id));
  const pending = signals.filter((signal) => !done.has(Number(signal.queryLogId)));

  const summary = {
    scanned: rows?.length || 0, eligible: signals.length, counted: 0, duplicates: signals.length - pending.length,
    suggested: 0, errors: 0, partial: false, remaining: 0, firstError: null,
  };
  for (let start = 0; start < pending.length; start += 48) {
    if (Date.now() - startedAt > budgetMs) {
      summary.partial = true;
      summary.remaining = pending.length - start;
      break;
    }
    const batch = pending.slice(start, start + 48);
    const embeddings = await embed(batch.map((signal) => signal.question));
    for (let i = 0; i < batch.length; i += 1) {
      try {
        const result = await applyFaqSignal({
          db, signal: { ...batch[i], socialWorkName: names.get(Number(batch[i].socialWorkId)) }, embedding: embeddings[i],
        });
        if (result.status === 'DUPLICATE') summary.duplicates += 1;
        else if (result.status === 'SUGGESTED') summary.suggested += 1;
        else summary.counted += 1;
      } catch (rowError) {
        summary.errors += 1;
        summary.firstError = summary.firstError || rowError?.message || String(rowError);
        console.error('FAQ rebuild row error:', rowError?.message);
      }
      if (Date.now() - startedAt > budgetMs) break;
    }
  }
  if (summary.errors > 0 && summary.counted + summary.suggested === 0) {
    throw new Error(`No se pudo registrar ninguna consulta: ${summary.firstError}`);
  }
  return summary;
}
