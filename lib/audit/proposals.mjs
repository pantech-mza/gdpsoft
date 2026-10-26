// v3.13.98 — Lógica pura del módulo de auditoría (sin acceso a base): normaliza lo que devuelven los
// agentes, calcula la antigüedad y valida decisiones del superadmin.
const VERDICTS = { CORRECTA: 'CORRECT', PARCIAL: 'PARTIAL', INCORRECTA: 'INCORRECT', SIN_BASE: 'NO_BASE', NO_APLICA: 'NA',
  CORRECT: 'CORRECT', PARTIAL: 'PARTIAL', INCORRECT: 'INCORRECT', NO_BASE: 'NO_BASE', NA: 'NA' };
const SECRET_LINE = /(usuario|user(name)?|clave|contrase[ñn]a|password|pass|token)\s*[:=]\s*\S+/gi;

export function stripSecrets(text, max = 4000) {
  return String(text ?? '').replace(SECRET_LINE, '[CREDENCIAL OMITIDA]').slice(0, max);
}
export function normalizeVerdict(v) {
  const k = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '_').replace('Á', 'A');
  return VERDICTS[k] || null;
}
export function circuitOf(v) {
  const k = String(v ?? '').toUpperCase().replace('Á', 'A');
  return k === 'CAMARA' || k === 'COLEGIO' ? k : null;
}
// Por defecto una corrección aplica al circuito de la consulta (más seguro); sin circuito, a ambos.
export function defaultAppliesTo(circuit) { return circuit === 'CAMARA' || circuit === 'COLEGIO' ? circuit : 'BOTH'; }

export function normalizeProposal(raw, batch) {
  const queryId = Number(raw?.id ?? raw?.query_id);
  const verdict = normalizeVerdict(raw?.veredicto ?? raw?.verdict);
  if (!Number.isSafeInteger(queryId) || queryId <= 0 || !verdict) return null;
  const circuit = circuitOf(raw.circuito ?? raw.circuit);
  const sources = (Array.isArray(raw.fuentes) ? raw.fuentes : []).slice(0, 12).map((s) => ({
    archivo: stripSecrets(s?.archivo, 200), seccion: stripSecrets(s?.seccion, 300), cita: stripSecrets(s?.cita, 2500),
    ...(typeof s?.verificada === 'boolean' ? { verificada: s.verificada } : {}),
  })).filter((s) => s.cita || s.archivo);
  return {
    batch, query_id: queryId, verdict_ai: verdict, circuit,
    cause: raw.causa && raw.causa !== '-' ? String(raw.causa).slice(0, 80) : null,
    proposed_answer: raw.respuesta_propuesta ? stripSecrets(raw.respuesta_propuesta, 6000) : null,
    sources,
    agrees_admin: typeof raw.coincide_admin === 'boolean' ? raw.coincide_admin : null,
    note: raw.nota ? stripSecrets(raw.nota, 2000) : null,
    applies_to_suggested: defaultAppliesTo(circuit),
    _social_work_hint: Number(raw.obra_social_id) || null,
  };
}

// Antigüedad: una respuesta mala puede estar ya resuelta si después de la consulta el admin corrigió
// esa misma obra social. Lo definitivo es repetir la pregunta contra el bot actual (replay).
export function computeAging(proposal, corrections = [], now = Date.now()) {
  const at = proposal.query_created_at ? Date.parse(proposal.query_created_at) : NaN;
  const ageDays = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 86400000)) : null;
  if (proposal.verdict_ai === 'CORRECT' || proposal.verdict_ai === 'NA') return { aging: 'SIN_CAMBIOS', detail: { age_days: ageDays } };
  const later = corrections.filter((c) => Number.isFinite(at) && Date.parse(c.updated_at) > at && c.query_id !== proposal.query_id);
  if (later.length) {
    const last = later.map((c) => c.updated_at).sort().pop();
    return { aging: 'POSIBLEMENTE_RESUELTA', detail: { age_days: ageDays, correcciones_posteriores: later.length, ultima: last } };
  }
  return { aging: 'VIGENTE', detail: { age_days: ageDays } };
}

export function summarize(rows) {
  const by = (key) => rows.reduce((m, r) => { const k = key(r) || '—'; m[k] = m[k] || { total: 0, CORRECT: 0, PARTIAL: 0, INCORRECT: 0, NO_BASE: 0, NA: 0 }; m[k].total++; m[k][r.verdict_ai]++; return m; }, {});
  const judged = rows.filter((r) => r.verdict_ai !== 'NA');
  const ok = judged.filter((r) => r.verdict_ai === 'CORRECT').length;
  const part = judged.filter((r) => r.verdict_ai === 'PARTIAL').length;
  const count = (f) => rows.filter(f).length;
  return {
    total: rows.length, judged: judged.length,
    acceptance_pct: judged.length ? Math.round((1000 * ok) / judged.length) / 10 : null,
    acceptance_with_partial_pct: judged.length ? Math.round((1000 * (ok + part)) / judged.length) / 10 : null,
    by_verdict: by((r) => r.verdict_ai), by_circuit: by((r) => r.circuit), by_social_work: by((r) => r.social_work_name),
    by_cause: rows.filter((r) => r.cause).reduce((m, r) => { m[r.cause] = (m[r.cause] || 0) + 1; return m; }, {}),
    replay: (() => { const r = rows.filter((x) => x.replay_verdict); const c = (v) => r.filter((x) => x.replay_verdict === v).length;
      return { judged: r.length, correct: c('CORRECT'), partial: c('PARTIAL'), incorrect: c('INCORRECT'), correct_pct: r.length ? Math.round((1000 * c('CORRECT')) / r.length) / 10 : null,
        // Bot actual sobre las MISMAS consultas: con el mismo juez si está disponible; si no, con la auditoría original.
        current_correct_pct: r.length ? Math.round((1000 * r.filter((x) => (x.current_judged || x.verdict_ai) === 'CORRECT').length) / r.length) / 10 : null,
        same_judge: r.length > 0 && r.every((x) => !!x.current_judged) }; })(),
    by_status: { PENDING: count((r) => r.status === 'PENDING'), APPROVED: count((r) => r.status === 'APPROVED'), REJECTED: count((r) => r.status === 'REJECTED') },
    by_aging: { VIGENTE: count((r) => r.aging === 'VIGENTE'), POSIBLEMENTE_RESUELTA: count((r) => r.aging === 'POSIBLEMENTE_RESUELTA'), SIN_CAMBIOS: count((r) => r.aging === 'SIN_CAMBIOS') },
  };
}

export function validateDecision(body) {
  const id = Number(body?.id);
  const action = String(body?.action || '').toUpperCase();
  if (!Number.isSafeInteger(id) || id <= 0) return { error: 'Propuesta inválida' };
  if (!['APPROVE', 'REJECT', 'CONFIRM'].includes(action)) return { error: 'Acción inválida' };
  const appliesTo = ['BOTH', 'CAMARA', 'COLEGIO'].includes(String(body?.appliesTo || '').toUpperCase()) ? String(body.appliesTo).toUpperCase() : null;
  const finalAnswer = String(body?.finalAnswer || '').trim().slice(0, 12000);
  if (action === 'APPROVE' && finalAnswer.length < 10) return { error: 'La respuesta aprobada no puede estar vacía' };
  return { id, action, appliesTo, finalAnswer };
}
