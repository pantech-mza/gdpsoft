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
        branchId: log?.branch_id ?? null,
        appliesTo: ['BOTH', 'CAMARA', 'COLEGIO'].includes(String(row?.applies_to || '').toUpperCase()) ? String(row.applies_to).toUpperCase() : null,
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

// v3.13.83 — «misma pregunta» deja de ser igualdad literal. Se ignoran saludos, muletillas y datos de
// ubicación («hola», «tengo una», «en mi sucursal») y se comparan las palabras que importan.
// Es conservador a propósito: si cambia una negación, un número o una palabra de contenido, NO coincide.
const FILLER_WORDS = new Set([
  'a', 'al', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'en', 'con', 'por', 'para', 'que', 'se', 'me', 'mi', 'mis', 'su', 'lo', 'y', 'e', 'o', 'u',
  'hola', 'buenas', 'buen', 'dia', 'tarde', 'gracias', 'favor', 'porfa', 'tengo', 'tenemos', 'necesito', 'necesitamos', 'quiero', 'quisiera', 'saber',
  'consulta', 'consultar', 'duda', 'ayuda', 'pregunta', 'sucursal', 'suc', 'farmacia', 'gdp', 'gdpsoft', 'gdpsotf',
]);
const POLARITY_WORDS = new Set(['no', 'sin', 'nunca', 'solo', 'solamente', 'tampoco', 'ni']);

export function contentTokens(text, socialWorkName = '') {
  return [...new Set(canonicalQuestion(text, socialWorkName).split(' ').filter((token) => token && !FILLER_WORDS.has(token)))];
}

export function similarQuestions(a, b, socialWorkName = '') {
  const A = new Set(contentTokens(a, socialWorkName));
  const B = new Set(contentTokens(b, socialWorkName));
  if (A.size < 2 || B.size < 2) return false;
  const inter = [...A].filter((token) => B.has(token));
  if (A.size === B.size && inter.length === A.size) return true;
  const diff = [...A, ...B].filter((token) => !(A.has(token) && B.has(token)));
  if (diff.some((token) => POLARITY_WORDS.has(token) || /\d/.test(token))) return false;
  const union = new Set([...A, ...B]).size;
  return Math.min(A.size, B.size) >= 4 && inter.length / union >= 0.85;
}

// Coincidencia exacta primero; si no, la corrección más reciente de una pregunta equivalente.
export function findSimilarCorrection(corrections, normalizedQuestion, socialWorkName = '') {
  const exact = findExactCorrection(corrections, normalizedQuestion, socialWorkName);
  if (exact) return exact;
  if (!Array.isArray(corrections)) return null;
  return corrections.find((item) => similarQuestions(item.normalizedQuestion, normalizedQuestion, socialWorkName)) || null;
}

// Respuesta de la normativa que en realidad dice «no hay dato».
export function answerSaysNoInfo(answer) {
  const text = canonFold(answer).slice(0, 160);
  return /^(no se (menciona|indica|especifica|encuentra|establece|detalla)|no (figura|surge|hay informacion|encuentro|encontre|existe informacion|se halla))/.test(text);
}

// Corrección hecha para el otro circuito (alcance sin definir): se usa el mismo texto, sin avisos.
export function buildCrossCircuitAnswer(correction) {
  return String(correction?.suggested ?? '').trim();
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
    const run = (columns) => supabaseAdmin
      .from('branch_response_reviews')
      .select(`${columns},assistant_query_log!inner(question,normalized_question,social_work_id,branch_id)`)
      .in('verdict', CORRECTION_VERDICTS)
      .eq('assistant_query_log.social_work_id', Number(socialWorkId))
      .order('updated_at', { ascending: false })
      .limit(limit);
    let { data, error } = await run('verdict,suggested_answer,updated_at,applies_to');
    // Sin la migración del alcance (applies_to) se lee como antes.
    if (error) ({ data, error } = await run('verdict,suggested_answer,updated_at'));
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

// v3.13.77 — una corrección hecha desde una sucursal de Cámara no se aplica a una de Colegio (y viceversa)
// cuando la obra social trabaja con los dos circuitos. Sin circuito conocido, no se filtra nada.
export async function restrictCorrectionsToCircuit(supabaseAdmin, corrections, socialWorkId, currentGroup) {
  try {
    if (!currentGroup || !Array.isArray(corrections) || !corrections.length) return corrections;
    const branchIds = [...new Set(corrections.map((c) => Number(c.branchId)).filter((n) => Number.isInteger(n) && n > 0))];
    if (!branchIds.length) return corrections;
    const [{ data: links }, { data: profiles }, { data: branches }] = await Promise.all([
      supabaseAdmin.from('normative_social_works').select('billing_channel_id').eq('social_work_id', Number(socialWorkId)).not('billing_channel_id', 'is', null),
      supabaseAdmin.from('social_work_circuit_profiles').select('circuit_group').eq('social_work_id', Number(socialWorkId)).limit(1),
      supabaseAdmin.from('branches').select('id,branch_type').in('id', branchIds),
    ]);
    const channels = new Set((links || []).map((row) => row.billing_channel_id));
    const twoCircuits = channels.size > 1 || (profiles || []).length > 0;
    if (!twoCircuits) return corrections;
    const typeById = new Map((branches || []).map((row) => [Number(row.id), String(row.branch_type || '').toUpperCase()]));
    return corrections.filter((item) => {
      const type = typeById.get(Number(item.branchId));
      item.circuit = type || null;
      // Alcance elegido por el administrador: manda sobre el circuito de la sucursal donde se corrigió.
      if (item.appliesTo === 'BOTH') return true;
      if (item.appliesTo === 'CAMARA' || item.appliesTo === 'COLEGIO') return item.appliesTo === currentGroup;
      return !type || type === currentGroup;
    });
  } catch {
    return corrections;
  }
}
