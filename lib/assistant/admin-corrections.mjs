// GDPSoft v3.13.21 — correcciones sugeridas por el administrador.
//
// Fuente de verdad: public.branch_response_reviews (verdict + suggested_answer),
// enlazada a assistant_query_log por query_id. No requiere tablas nuevas.
//
//  1. Coincidencia exacta (misma obra social + misma pregunta normalizada):
//     el bot responde con el texto aprobado por el admin.
//  2. Preguntas distintas de la misma obra social: las correcciones recientes
//     se agregan al prompt como fuente prioritaria.
//  3. Al guardar una revisión INCORRECTA/PARCIAL se desactiva la respuesta
//     cacheada de esa pregunta para que no vuelva a servirse la vieja.
//
// Todo degrada en silencio: si algo falla, el bot responde como antes.

const CORRECTION_VERDICTS = ['INCORRECT', 'PARTIAL'];
const MAX_PROMPT_ITEMS = 6;
const MAX_ITEM_CHARS = 700;

const clip = (text, max) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// rows: filas de branch_response_reviews con assistant_query_log embebido.
export function pickCorrections(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const log = Array.isArray(row?.assistant_query_log) ? row.assistant_query_log[0] : row?.assistant_query_log;
      return {
        verdict: String(row?.verdict || '').toUpperCase(),
        suggested: String(row?.suggested_answer ?? '').trim(),
        updatedAt: row?.updated_at || null,
        question: log?.question ?? '',
        normalizedQuestion: log?.normalized_question ?? '',
        socialWorkId: log?.social_work_id ?? null,
      };
    })
    .filter((item) => CORRECTION_VERDICTS.includes(item.verdict) && item.suggested);
  list.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  return list;
}

const canonFold = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC_WORDS = new Set(['obra', 'social', 'os', 'de', 'la', 'el']);

// Forma canónica de una pregunta sin el nombre de la obra social: «Premedic debe venir
// autorizado?» y «debe venir autorizado?» (misma obra social activa) son la misma consulta.
export function canonicalQuestion(text, socialWorkName = '') {
  const nameTokens = new Set(canonFold(socialWorkName).split(' ').filter(Boolean));
  return canonFold(text).split(' ')
    .filter((token) => token && !nameTokens.has(token) && !GENERIC_WORDS.has(token)).join(' ');
}

export function findExactCorrection(corrections, normalizedQuestion, socialWorkName = '') {
  const key = canonicalQuestion(normalizedQuestion, socialWorkName);
  if (!key) return null;
  return corrections.find((item) => canonicalQuestion(item.normalizedQuestion, socialWorkName) === key) || null;
}

export function buildCorrectionsPrompt(corrections, limit = MAX_PROMPT_ITEMS) {
  const seen = new Set();
  const items = [];
  for (const item of corrections) {
    const key = item.normalizedQuestion || item.question;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= limit) break;
  }
  if (!items.length) return '';
  const lines = items.map((item, index) =>
    `${index + 1}. Pregunta: «${clip(item.question, 200)}»\n   Respuesta aprobada por el administrador: ${clip(item.suggested, MAX_ITEM_CHARS)}`);
  return `

CORRECCIONES APROBADAS POR EL ADMINISTRADOR (misma obra social):
Estas respuestas fueron revisadas y corregidas por una persona de GDPSoft. Si la consulta actual trata el mismo tema que alguna de ellas, usá esa respuesta como fuente prioritaria por encima del texto recuperado, sin contradecirla ni inventar datos que no estén en ella ni en la normativa. Si el tema es distinto, ignorá esta sección.

${lines.join('\n')}
`;
}

export async function loadSocialWorkCorrections(supabaseAdmin, socialWorkId, { limit = 60 } = {}) {
  if (!Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('branch_response_reviews')
      .select('verdict,suggested_answer,updated_at,assistant_query_log!inner(question,normalized_question,social_work_id)')
      .in('verdict', CORRECTION_VERDICTS)
      .eq('assistant_query_log.social_work_id', Number(socialWorkId))
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return pickCorrections(data);
  } catch {
    return [];
  }
}

// Al guardar la revisión: la respuesta cacheada vieja deja de servirse.
export async function deactivateCachedAnswers(supabaseAdmin, socialWorkId, normalizedQuestion) {
  const key = String(normalizedQuestion ?? '').trim();
  if (!key || !Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return false;
  try {
    const { error } = await supabaseAdmin.from('assistant_answer_cache')
      .update({ active: false })
      .eq('social_work_id', Number(socialWorkId))
      .eq('normalized_question', key);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Observaciones sobre respuestas CORRECTAS: no cambian la respuesta del bot,
// se agregan debajo cuando consultan exactamente lo mismo (misma obra social).
// ---------------------------------------------------------------------------
export function pickObservations(rows) {
  const list = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const log = Array.isArray(row?.assistant_query_log) ? row.assistant_query_log[0] : row?.assistant_query_log;
      return {
        comment: String(row?.comment ?? '').trim(),
        updatedAt: row?.updated_at || null,
        normalizedQuestion: log?.normalized_question ?? '',
      };
    })
    .filter((item) => item.comment && item.normalizedQuestion);
  list.sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  return list;
}

export function findExactObservation(observations, normalizedQuestion, socialWorkName = '') {
  const key = canonicalQuestion(normalizedQuestion, socialWorkName);
  if (!key) return null;
  return observations.find((item) => canonicalQuestion(item.normalizedQuestion, socialWorkName) === key) || null;
}

export function appendObservation(answer, observation) {
  if (!observation?.comment) return answer;
  return `${String(answer ?? '').trimEnd()}\n\nObservación: ${observation.comment}`;
}

export async function loadSocialWorkObservations(supabaseAdmin, socialWorkId, { limit = 200 } = {}) {
  if (!Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('branch_response_reviews')
      .select('comment,updated_at,assistant_query_log!inner(normalized_question,social_work_id)')
      .eq('verdict', 'CORRECT')
      .not('comment', 'is', null)
      .eq('assistant_query_log.social_work_id', Number(socialWorkId))
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return pickObservations(data);
  } catch {
    return [];
  }
}
