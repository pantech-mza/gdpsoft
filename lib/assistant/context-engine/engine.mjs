// v3.13.100 — Motor de contexto completo: carga los datos de la obra social, arma el documento, consulta
// al modelo y verifica lo que responde. NO decide qué ve la sucursal: eso lo define quien lo llama.
import { maskSensitive } from '../../audit/export-audit.mjs';
import { buildContextDocument, buildEngineMessages, verifyEngineOutput, channelMatchesCircuit } from './core.mjs';

const cache = new Map(); const TTL = 60_000;
const groupOf = (t) => { const f = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); return /CAMARA/.test(f) ? 'CAMARA' : /COLEGIO/.test(f) ? 'COLEGIO' : null; };
const mask = (s) => maskSensitive(s);

async function rows(q) { const { data, error } = await q; if (error) throw error; return data || []; }

export async function loadRecords(supabase, { socialWorkId, branchId = null, circuit = null, excludeQueryIds = [] }) {
  const key = `${socialWorkId}:${branchId}:${circuit}:${excludeQueryIds.join(',')}`;
  const hit = cache.get(key); if (hit && Date.now() - hit.t < TTL) return hit.v;
  const [work, profiles, notes, procedures, general, faqs, rules, channels, branches] = await Promise.all([
    supabase.from('social_works').select('*').eq('id', socialWorkId).maybeSingle().then((r) => r.data),
    rows(supabase.from('social_work_circuit_profiles').select('*').eq('social_work_id', socialWorkId)),
    rows(supabase.from('social_work_notes').select('*').eq('social_work_id', socialWorkId).eq('kind', 'GENERAL').eq('review_status', 'APPROVED')), // nunca ACCESS (credenciales)
    rows(supabase.from('internal_procedures').select('*').eq('social_work_id', socialWorkId).eq('active', true)),
    rows(supabase.from('internal_procedures').select('*').is('social_work_id', null).eq('active', true)),
    rows(supabase.from('social_work_faqs').select('*').eq('social_work_id', socialWorkId)),
    rows(supabase.from('social_work_operation_rules').select('*').eq('social_work_id', socialWorkId).eq('active', true)),
    rows(supabase.from('billing_channels').select('id,name,code')),
    rows(supabase.from('branches').select('id,branch_type')),
  ]);
  const branchType = new Map(branches.map((b) => [Number(b.id), groupOf(b.branch_type)]));
  const channelName = new Map(channels.map((c) => [String(c.id), c.name || c.code || '']));
  const circuitProfile = profiles.find((p) => String(p.circuit_group || '').toUpperCase().includes(circuit || '__')) || null;
  const scopedRules = rules.filter((r) => r.approved !== false && (String(r.rule_scope || '').toUpperCase() !== 'BRANCH' || (branchId && Number(r.branch_id) === Number(branchId))));
  const revs = await rows(supabase.from('branch_response_reviews')
    .select('query_id,verdict,suggested_answer,comment,applies_to,updated_at,assistant_query_log!inner(question,social_work_id,branch_id)')
    .in('verdict', ['INCORRECT', 'PARTIAL']).eq('assistant_query_log.social_work_id', socialWorkId));
  const corrections = revs.filter((r) => String(r.suggested_answer || '').trim() && !excludeQueryIds.includes(Number(r.query_id)))
    .map((r) => ({ ...r, question: r.assistant_query_log?.question, origin_circuit: branchType.get(Number(r.assistant_query_log?.branch_id)) || null }));
  const links = await rows(supabase.from('normative_social_works').select('normative_id,billing_channel_id,document_role').eq('social_work_id', socialWorkId));
  const ids = [...new Set(links.map((l) => l.normative_id))];
  let normatives = [];
  if (ids.length) {
    const [ns, texts] = await Promise.all([
      rows(supabase.from('normatives').select('*').in('id', ids)),
      rows(supabase.from('assistant_normative_text').select('normative_id,text').in('normative_id', ids)),
    ]);
    const textOf = new Map(texts.map((t) => [Number(t.normative_id), t.text]));
    normatives = ns.filter((n) => n.is_current !== false).map((n) => {
      const link = links.filter((l) => Number(l.normative_id) === Number(n.id));
      const names = link.map((l) => channelName.get(String(l.billing_channel_id)) || '').filter(Boolean);
      return { ...n, channel: names.join(' / '), text: textOf.get(Number(n.id)) || '', _ok: !names.length || names.some((nm) => channelMatchesCircuit(nm, circuit)) };
    }).filter((n) => n._ok);
  }
  const v = { work, circuitProfile, notes, procedures, generalProcedures: general, faqs, rules: scopedRules, corrections, normatives };
  cache.set(key, { t: Date.now(), v }); return v;
}

export async function runContextEngine({ supabase, callModel, model, question, history = [], socialWorkId, branchId = null, circuit = null, excludeQueryIds = [], maxChars }) {
  const t0 = Date.now();
  const records = await loadRecords(supabase, { socialWorkId, branchId, circuit, excludeQueryIds });
  const doc = buildContextDocument(records, { circuit, mask, ...(maxChars ? { maxChars } : {}) });
  const out = await callModel(buildEngineMessages({ document: doc.text, history, question }), { model });
  const v = verifyEngineOutput(out.text, doc.text);
  return { ...v, truncated: doc.truncated, doc_chars: doc.text.length, tokens_in: out.tin, tokens_out: out.tout, latency_ms: Date.now() - t0, model };
}
