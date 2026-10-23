// v3.13.100 — Modo sombra: el motor nuevo responde en paralelo y deja el resultado guardado. NUNCA afecta lo que
// ve la sucursal y nunca lanza errores hacia afuera.
import { runContextEngine } from './engine.mjs';
import { makeCallModel } from './openai.mjs';

export function shadowConfig(env = process.env) {
  const mode = String(env.CONTEXT_ENGINE_MODE || 'off').toLowerCase();
  const branches = String(env.CONTEXT_ENGINE_BRANCHES || '').split(',').map((s) => Number(s.trim())).filter(Boolean);
  return { enabled: mode === 'shadow' && !!env.OPENAI_API_KEY, model: env.CONTEXT_ENGINE_MODEL || 'gpt-4.1-mini', branches,
    sample: Math.min(1, Math.max(0, Number(env.CONTEXT_ENGINE_SAMPLE ?? 1))) };
}
export function shouldShadow(cfg, { socialWorkId, branchId, route, ok, rand = Math.random() }) {
  if (!cfg.enabled || !ok || !Number.isInteger(socialWorkId) || socialWorkId <= 0) return false;
  if (/IMAGE/i.test(String(route || ''))) return false;
  if (cfg.branches.length && !cfg.branches.includes(Number(branchId))) return false;
  return rand < cfg.sample;
}

export async function runShadow({ supabase, cfg, question, socialWorkId, branchId, circuit, conversationId, currentAnswer, currentRoute }) {
  try {
    let history = [];
    if (conversationId) {
      const { data } = await supabase.from('assistant_query_log').select('question,answer,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(5);
      history = (data || []).slice(1).reverse(); // se descarta la consulta actual (la más nueva)
    }
    let r;
    try { r = await runContextEngine({ supabase, callModel: makeCallModel({ apiKey: process.env.OPENAI_API_KEY, timeoutMs: 60000 }), model: cfg.model, question, history, socialWorkId, branchId, circuit }); }
    catch (e) { r = { status: 'ERROR', error: String(e?.message || e).slice(0, 300) }; }
    await supabase.from('assistant_shadow_results').insert({ branch_id: branchId || null, social_work_id: socialWorkId, conversation_id: conversationId || null,
      question: String(question).slice(0, 2000), current_answer: String(currentAnswer || '').slice(0, 6000), current_route: currentRoute || null, engine_model: cfg.model,
      engine_answer: r.answer ? String(r.answer).slice(0, 6000) : null, engine_status: r.status, engine_sources: r.sources || [], engine_conflicts: r.conflicts || [],
      latency_ms: r.latency_ms || null, tokens_in: r.tokens_in || null, tokens_out: r.tokens_out || null, error: r.error || null });
  } catch (e) { console.warn('motor en sombra:', e?.message); }
}
