// v3.13.100 — Motor de contexto completo: carga los datos de la obra social, arma el documento, consulta
// al modelo y verifica lo que responde. NO decide qué ve la sucursal: eso lo define quien lo llama.
import { maskSensitive } from '../../audit/export-audit.mjs';
import { isClarificationText } from '../admin-corrections.mjs';
import { buildContextDocument, buildEngineMessages, verifyEngineOutput, channelMatchesCircuit, ruleApplies, procedureApplies } from './core.mjs';
import { filterRowsByVariant, filterTextsByVariant } from '../plan-variant.mjs';

const cache = new Map(); const TTL = 60_000;
const groupOf = (t) => { const f = String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); return /CAMARA/.test(f) ? 'CAMARA' : /COLEGIO/.test(f) ? 'COLEGIO' : null; };
const mask = (s) => maskSensitive(s);

async function rows(q) { const { data, error } = await q; if (error) throw error; return data || []; }

export async function loadRecords(supabase, { socialWorkId, branchId = null, circuit = null, variant = null, excludeQueryIds = [] }) {
  const key = `${socialWorkId}:${branchId}:${circuit}:${variant || ''}:${excludeQueryIds.join(',')}`;
  const hit = cache.get(key); if (hit && Date.now() - hit.t < TTL) return hit.v;
  const [work, profiles, notes, procedures, general, faqs, rules, channels, branches] = await Promise.all([
    supabase.from('social_works').select('*').eq('id', socialWorkId).maybeSingle().then((r) => r.data),
    rows(supabase.from('social_work_circuit_profiles').select('*').eq('social_work_id', socialWorkId)),
    rows(supabase.from('social_work_notes').select('*').eq('social_work_id', socialWorkId).eq('kind', 'GENERAL').eq('review_status', 'APPROVED')), // nunca ACCESS (credenciales)
    rows(supabase.from('internal_procedures').select('*').eq('social_work_id', socialWorkId).eq('active', true).eq('status', 'APPROVED')),
    rows(supabase.from('internal_procedures').select('*').is('social_work_id', null).eq('active', true).eq('status', 'APPROVED')),
    rows(supabase.from('social_work_faqs').select('*').eq('social_work_id', socialWorkId)),
    rows(supabase.from('social_work_operation_rules').select('*').eq('social_work_id', socialWorkId).eq('active', true)),
    rows(supabase.from('billing_channels').select('id,name,code')),
    rows(supabase.from('branches').select('id,name,branch_type')),
  ]);
  const branchType = new Map(branches.map((b) => [Number(b.id), groupOf(b.branch_type)]));
  const channelName = new Map(channels.map((c) => [String(c.id), c.name || c.code || '']));
  const circuitProfile = profiles.find((p) => String(p.circuit_group || '').toUpperCase().includes(circuit || '__')) || null;
  const today = new Date().toISOString().slice(0, 10);
  const scopedRules = rules.filter((r) => ruleApplies(r, { branchId, circuit, today, groupOf }));
  const procOk = (p) => procedureApplies(p, { circuit, today, channelName });
  const branchRow = branches.find((b) => Number(b.id) === Number(branchId));
  const revs = await rows(supabase.from('branch_response_reviews')
    .select('query_id,verdict,suggested_answer,comment,applies_to,updated_at,assistant_query_log!inner(question,social_work_id,branch_id)')
    .in('verdict', ['INCORRECT', 'PARTIAL']).eq('assistant_query_log.social_work_id', socialWorkId));
  const corrections = revs.filter((r) => String(r.suggested_answer || '').trim() && !isClarificationText(r.suggested_answer) && !excludeQueryIds.includes(Number(r.query_id)))
    .map((r) => ({ ...r, question: r.assistant_query_log?.question, origin_circuit: branchType.get(Number(r.assistant_query_log?.branch_id)) || null }));
  const allLinks = await rows(supabase.from('normative_social_works').select('normative_id,billing_channel_id,document_role,plan_variant').eq('social_work_id', socialWorkId));
  const links = filterRowsByVariant(allLinks, variant).rows; // OSEP y OSEP OYTE no se mezclan
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
  const v = { work, circuitProfile, variant, branch: branchRow ? { id: branchRow.id, name: branchRow.name, type: groupOf(branchRow.branch_type) } : null,
    notes: filterTextsByVariant(notes, variant, (n) => n.body),
    procedures: filterTextsByVariant(procedures.filter(procOk), variant, (p) => `${p.title} ${p.question} ${p.answer}`),
    generalProcedures: general.filter(procOk),
    faqs: filterTextsByVariant(faqs, variant, (f) => `${f.question} ${f.answer || f.answer_text || ''}`),
    rules: scopedRules, corrections, normatives };
  cache.set(key, { t: Date.now(), v }); return v;
}

export async function runContextEngine({ supabase, callModel, model, question, history = [], socialWorkId, branchId = null, circuit = null, variant = null, excludeQueryIds = [], maxChars }) {
  const t0 = Date.now();
  const records = await loadRecords(supabase, { socialWorkId, branchId, circuit, variant, excludeQueryIds });
  const doc = buildContextDocument(records, { circuit, mask, ...(maxChars ? { maxChars } : {}) });
  const out = await callModel(buildEngineMessages({ document: doc.text, history, question }), { model });
  const extraText = (history || []).map((m) => m?.answer || '').filter(Boolean).join('\n');
  let v = verifyEngineOutput(out.text, doc.text, { extraText });
  // Una respuesta que repite «el resto de las sucursales» no le sirve a quien consulta: se pide reescribirla para SU sucursal (un solo reintento).
  const branchName = records?.branch?.name;
  const needsBranchRewrite = (a) => /\b(?:el resto|las demas|las dem[aá]s|los demas|los dem[aá]s)(?: de las| de| las)? sucursales\b/i.test(a) ||
    /(?:no aclaraste|no indicaste|no me dijiste|indiques|indicame|decime|aclar[aá]me)[^.]{0,40}sucursal|sucursal[^.]{0,30}(?:no (?:est[aá]|fue) (?:indicada|aclarada)|necesito)|depende de la sucursal/i.test(a);
  if (branchName && v.answer && needsBranchRewrite(v.answer)) {
    const again = await callModel(buildEngineMessages({ document: doc.text, history, question:
      `${question}\n\n[INSTRUCCIÓN INTERNA: la sucursal que consulta es ${branchName}. Tu respuesta anterior decía «${String(v.answer).slice(0, 300)}», que no responde para la sucursal que consulta (habla de otras sucursales o le pide que la indique, cuando ya se sabe que es ${branchName}). Reescribila respondiendo directamente para ${branchName} (p. ej. «Sí, la recibimos en ${branchName} solo después de las 20 hs»), sin nombrar a otras sucursales, y conservando las demás condiciones de la regla (p. ej. validez de la receta). Mismas citas del documento.]` }), { model });
    const v2 = verifyEngineOutput(again.text, doc.text, { extraText });
    if (v2.status === 'OK' || v2.status === 'CLARIFY') { out.tin = (out.tin || 0) + (again.tin || 0); out.tout = (out.tout || 0) + (again.tout || 0); v = v2; }
  }
  return { ...v, truncated: doc.truncated, doc_chars: doc.text.length, tokens_in: out.tin, tokens_out: out.tout, latency_ms: Date.now() - t0, model };
}
