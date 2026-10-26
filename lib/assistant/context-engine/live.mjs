// v3.13.101 — Modo VIVO del motor de contexto completo: lee TODA la información de la obra social junta y responde.
// Si algo falla (error, demora, sin respaldo textual) se conserva la respuesta del bot actual: nunca deja a la sucursal sin respuesta.
import { runContextEngine } from './engine.mjs';
import { makeCallModel } from './openai.mjs';

// Rutas que el motor NO reemplaza: datos sensibles, cortesía y textos del administrador que se muestran tal cual.
export const LIVE_SKIP_ROUTES = /CREDENTIALS|COURTESY|IMAGE|AMBIGUOUS|CLARIFICATION_NEEDED|ADMIN_CORRECTION/i;

export function liveConfig(env = process.env) {
  const clean = (v) => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
  const mode = clean(env.CONTEXT_ENGINE_MODE || 'off').toLowerCase();
  return { enabled: mode === 'live' && !!env.OPENAI_API_KEY, model: clean(env.CONTEXT_ENGINE_MODEL) || 'gpt-4.1',
    branches: clean(env.CONTEXT_ENGINE_BRANCHES).split(',').map((s) => Number(s.trim())).filter(Boolean),
    pct: Math.min(100, Math.max(0, Number(env.CONTEXT_ENGINE_LIVE_PCT ?? 100))), timeoutMs: Math.max(5000, Number(env.CONTEXT_ENGINE_TIMEOUT_MS || 25000)),
    skip: env.CONTEXT_ENGINE_SKIP_ROUTES ? new RegExp(env.CONTEXT_ENGINE_SKIP_ROUTES, 'i') : LIVE_SKIP_ROUTES };
}
export function shouldGoLive(cfg, { socialWorkId, branchId, route, ok, rand = Math.random() }) {
  if (!cfg.enabled || !ok || !Number.isInteger(socialWorkId) || socialWorkId <= 0) return false;
  if (cfg.skip.test(String(route || ''))) return false;
  if (cfg.branches.length && !cfg.branches.includes(Number(branchId))) return false;
  return rand * 100 < cfg.pct;
}
// Solo estos resultados reemplazan al bot actual. NO_BASIS/UNVERIFIED/ERROR conservan la respuesta anterior (y quedan registrados).
export const adoptable = (r) => !!r && !!String(r.answer || '').trim() && (r.status === 'OK' || r.status === 'CLARIFY');

export async function runLive({ supabase, cfg, question, socialWorkId, branchId, circuit, conversationId, currentAnswer, currentRoute }) {
  let r; const t0 = Date.now();
  try {
    let history = [];
    if (conversationId) {
      const { data } = await supabase.from('assistant_query_log').select('question,answer,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(5);
      history = (data || []).slice(1).reverse();
    }
    const run = runContextEngine({ supabase, callModel: makeCallModel({ apiKey: process.env.OPENAI_API_KEY, timeoutMs: cfg.timeoutMs }), model: cfg.model, question, history, socialWorkId, branchId, circuit });
    r = await Promise.race([run, new Promise((res) => setTimeout(() => res({ status: 'ERROR', error: 'timeout' }), cfg.timeoutMs))]);
  } catch (e) { r = { status: 'ERROR', error: String(e?.message || e).slice(0, 300) }; }
  const used = adoptable(r);
  try {
    await supabase.from('assistant_shadow_results').insert({ branch_id: branchId || null, social_work_id: socialWorkId, conversation_id: conversationId || null,
      question: String(question).slice(0, 2000), current_answer: String(currentAnswer || '').slice(0, 6000), current_route: `${used ? 'LIVE_USED' : 'LIVE_FALLBACK'}:${currentRoute || ''}`.slice(0, 120),
      engine_model: cfg.model, engine_answer: r.answer ? String(r.answer).slice(0, 6000) : null, engine_status: r.status || 'ERROR', engine_sources: r.sources || [], engine_conflicts: r.conflicts || [],
      latency_ms: r.latency_ms || Date.now() - t0, tokens_in: r.tokens_in || null, tokens_out: r.tokens_out || null, error: r.error || null });
  } catch { /* el registro es opcional */ }
  return { used, result: r };
}

// El historial, las correcciones y la Validación leen assistant_query_log: se deja ahí lo que realmente vio la sucursal.
export async function syncQueryLog(supabase, { branchId, socialWorkId, question, answer, route }) {
  try {
    const since = new Date(Date.now() - 3 * 60_000).toISOString();
    let q = supabase.from('assistant_query_log').select('id').eq('question', question).eq('social_work_id', socialWorkId).gte('created_at', since).order('id', { ascending: false }).limit(1);
    if (branchId) q = q.eq('branch_id', branchId);
    const { data } = await q; const id = data?.[0]?.id; if (!id) return false;
    await supabase.from('assistant_query_log').update({ answer, route, source: route }).eq('id', id); return true;
  } catch { return false; }
}

// Diagnóstico para el panel del superadmin: qué ve realmente ESTE deploy (sin mostrar claves).
export function engineDiagnostics(env = process.env) {
  const c = liveConfig(env);
  return { mode: liveConfig(env).enabled ? 'live' : (String(env.CONTEXT_ENGINE_MODE || 'off').toLowerCase().trim().replace(/^["']+|["']+$/g, '')), modeRaw: String(env.CONTEXT_ENGINE_MODE ?? '(sin cargar)'), enabled: c.enabled, model: c.model, branches: c.branches,
    branchesRaw: String(env.CONTEXT_ENGINE_BRANCHES ?? '(sin cargar)'), pct: c.pct, hasKey: !!env.OPENAI_API_KEY, vercelEnv: env.VERCEL_ENV || null, gitBranch: env.VERCEL_GIT_COMMIT_REF || null,
    commit: String(env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null };
}
