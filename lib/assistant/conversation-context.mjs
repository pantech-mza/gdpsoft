// GDPSoft v3.13.20 — estado conversacional explícito y testeable.
//
// Resuelve tres problemas observados en el piloto:
//   1. Repreguntas sobre el mismo tema («Y por dónde se registra») se buscaban
//      sin el tema anterior y terminaban en «No encuentro esa información».
//   2. Respuestas a «¿Cámara o Colegio?» («Colegio», «Pertenezco a Cámara»)
//      no continuaban la pregunta original.
//   3. La sucursal autenticada ya identifica su grupo: no hay que pedirlo.
//
// Todo es función pura salvo las dos utilidades que reciben el cliente Supabase.
// El estado vive en conversations.conversation_state (jsonb). Si la columna
// todavía no existe, TODO degrada al comportamiento anterior (nunca rompe).

import { resolveGeneralBranchMembership } from './branch-circuit-membership.mjs';

export const CONVERSATION_STATE_VERSION = 1;
// Pasado este tiempo una repregunta ya no se considera continuación.
export const FOLLOW_UP_MAX_AGE_MS = 20 * 60 * 1000;
const MAX_TEXT = 400;

export function fold(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const words = (text) => fold(text).split(' ').filter(Boolean);
const clip = (text, max = MAX_TEXT) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// ---------------------------------------------------------------------------
// Respuesta a «¿Cámara o Colegio?»
// ---------------------------------------------------------------------------
// Solo cuando el mensaje es corto y nombra UNA de las dos opciones.
// «Cámara–Colegio» (nombra las dos) es un circuito operativo, no una elección.
export function detectChannelReply(question) {
  const q = fold(question);
  if (!q || words(q).length > 10) return null;
  const camara = /\bcamara\b/.test(q);
  const colegio = /\bcolegio\b/.test(q);
  if (camara === colegio) return null;
  return camara ? 'CAMARA' : 'COLEGIO';
}

export function pickBillingChannel(channels, group) {
  const key = group === 'CAMARA' ? 'camara' : group === 'COLEGIO' ? 'colegio' : null;
  if (!key || !Array.isArray(channels)) return null;
  const other = key === 'camara' ? 'colegio' : 'camara';
  const matches = channels.filter((channel) => {
    const text = fold(`${channel?.code ?? ''} ${channel?.name ?? ''}`);
    return text.includes(key) && !text.includes(other);
  });
  // Si el catálogo es ambiguo no se adivina.
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveChannelIdForGroup(supabaseAdmin, group) {
  try {
    const { data, error } = await supabaseAdmin.from('billing_channels').select('id,code,name');
    if (error) return null;
    const channel = pickBillingChannel(data, group);
    return channel ? Number(channel.id) : null;
  } catch {
    return null;
  }
}

// Grupo de la sucursal autenticada (fuente: procedimiento Cámara–Colegio y
// registro de sucursales). Devuelve null si no se puede confirmar o hay conflicto.
export async function resolveBranchGroup(supabaseAdmin, branchId) {
  if (!Number.isInteger(Number(branchId)) || Number(branchId) <= 0) return null;
  try {
    const { data, error } = await supabaseAdmin.from('branches')
      .select('id,name,code,branch_type').eq('id', Number(branchId)).maybeSingle();
    if (error || !data) return null;
    const membership = resolveGeneralBranchMembership({
      branchName: data.name, branchCode: data.code, branchType: data.branch_type,
    });
    return membership.status === 'CONFIRMED' ? membership.group : null;
  } catch {
    return null;
  }
}

// Canal documental de la propia sucursal, sin preguntarle al usuario.
// Se desactiva con GDP_AUTO_BRANCH_CHANNEL=0.
export async function resolveBranchBillingChannelId(supabaseAdmin, branchId) {
  if (process.env.GDP_AUTO_BRANCH_CHANNEL === '0') return null;
  const group = await resolveBranchGroup(supabaseAdmin, branchId);
  return group ? resolveChannelIdForGroup(supabaseAdmin, group) : null;
}

// ---------------------------------------------------------------------------
// Repreguntas
// ---------------------------------------------------------------------------
const YES_REPLY = /^(si|sii+|dale|ok|okey|bueno|claro|por favor|mostrame|mostralo|mostramelo|ampliame|ampliala|ampliá|amplia|explicame|explicamelo|detallame|detallalo|decime|contame|mas|mas info|mas detalle|mas informacion|quiero saber mas)( .*)?$/;
const CONTINUATION_START = /^(y|e|pero|entonces|ademas|tambien|asi que|en ese caso|y si|y entonces|y eso|y en|y para|y donde|y como|y cuando|y que|y cual)\b/;
const ANAPHORA = /\b(eso|esto|ese|esa|esos|esas|mismo|misma|mismos|mismas|anterior|ahi|alli)\b/;
// «¿Cuál es el sistema?», «¿Dónde se anota?»: pregunta corta, sin sujeto propio.
const INTERROGATIVE_START = /^(cual|cuales|que|como|donde|cuando|quien|quienes|cuanto|cuantos|cuanta|cuantas|por que|para que|en que|a que|con que|se puede|se debe|hay|existe|es|son|sirve|vale|corresponde|tiene|puedo|debo)\b/;

export function isFreshState(state, now = Date.now()) {
  if (!state || typeof state !== 'object' || !state.topic_question) return false;
  const at = Date.parse(state.updated_at || '');
  return Number.isFinite(at) && now - at <= FOLLOW_UP_MAX_AGE_MS;
}

// Una repregunta es un mensaje corto que continúa el tema anterior de la
// misma obra social. Un mensaje largo o con otra obra social es una consulta nueva.
export function isFollowUpMessage(question, state, { socialWorkId = null, now = Date.now() } = {}) {
  if (!isFreshState(state, now)) return false;
  if (state.social_work_id != null && socialWorkId != null &&
      Number(state.social_work_id) !== Number(socialWorkId)) return false;
  if (state.pending?.kind === 'NEEDS_CHANNEL') return false; // lo resuelve detectChannelReply
  const q = fold(question);
  const n = words(q).length;
  if (!q || n > 12) return false;
  if (YES_REPLY.test(q) && n <= 6) return true;
  if (n > 9) return false;
  return CONTINUATION_START.test(q) || ANAPHORA.test(q) || (n <= 5 && INTERROGATIVE_START.test(q));
}

// Consulta para la búsqueda documental: incluye el tema anterior para que la
// repregunta no se busque «en el vacío».
export function buildFollowUpSearchQuestion(question, state) {
  const topic = clip(state?.topic_question, 300);
  const last = clip(state?.last_question, 200);
  const parts = [`Contexto de la consulta anterior: «${topic}».`];
  if (last && fold(last) !== fold(topic)) parts.push(`Última repregunta: «${last}».`);
  parts.push(`Repregunta del usuario: «${clip(question, 300)}».`);
  return parts.join(' ');
}

export function resolveFollowUp({ question, state, socialWorkId = null, now = Date.now() }) {
  if (!isFollowUpMessage(question, state, { socialWorkId, now })) return { isFollowUp: false };
  return { isFollowUp: true, searchQuestion: buildFollowUpSearchQuestion(question, state) };
}

// ---------------------------------------------------------------------------
// Estado persistido
// ---------------------------------------------------------------------------
export function isChannelBlock(json) {
  return json?.route === 'NORMATIVE_SCOPE_UNVERIFIED' &&
    /c[aá]mara y colegio/i.test(String(json?.answer || ''));
}

// prev: estado anterior (o null). json: cuerpo de la respuesta del asistente.
export function buildNextState({ prev, rawQuestion, json, now = Date.now() }) {
  if (!json || json.ok !== true) return null;
  const socialWorkId = json.context?.social_work_id ?? prev?.social_work_id ?? null;
  const answeredQuestion = clip(json.question || rawQuestion);
  const followUp = isFollowUpMessage(rawQuestion, prev, { socialWorkId, now });
  // El tema se mantiene mientras sigan repreguntando sobre él.
  const topic = followUp ? prev.topic_question : answeredQuestion;
  const state = {
    v: CONVERSATION_STATE_VERSION,
    updated_at: new Date(now).toISOString(),
    social_work_id: socialWorkId,
    topic_question: clip(topic),
    last_question: clip(rawQuestion),
    last_route: json.route ?? null,
    last_found: json.found ?? null,
    last_answer: clip(json.answer, 300),
    pending: null,
  };
  if (isChannelBlock(json)) state.pending = { kind: 'NEEDS_CHANNEL', question: clip(topic) };
  return state;
}

// ¿Hay una pregunta real pendiente (no solo el nombre de una obra social)?
export function pendingRealQuestion(state) {
  const pending = state?.pending;
  if (pending?.kind !== 'NEEDS_CHANNEL') return null;
  const text = clip(pending.question);
  return words(text).length >= 5 ? text : null;
}

export async function loadConversationState(supabaseAdmin, conversationId) {
  if (!conversationId) return null;
  try {
    const { data, error } = await supabaseAdmin.from('conversations')
      .select('conversation_state').eq('id', conversationId).maybeSingle();
    if (error) return null; // columna inexistente o error: comportamiento anterior
    const state = data?.conversation_state;
    return state && typeof state === 'object' ? state : null;
  } catch {
    return null;
  }
}

export async function saveConversationState(supabaseAdmin, conversationId, state) {
  if (!conversationId || !state) return false;
  try {
    const { error } = await supabaseAdmin.from('conversations')
      .update({ conversation_state: state }).eq('id', conversationId);
    return !error;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mensaje que solo nombra la obra social («Higea Salud», «OSECAC»)
// ---------------------------------------------------------------------------
const NAME_STOPWORDS = new Set([
  'obra', 'social', 'os', 'la', 'el', 'los', 'las', 'de', 'del', 'en', 'por', 'para',
  'consulta', 'es', 'sobre', 'con', 'a', 'un', 'una', 'quiero', 'consultar', 'seria',
  // saludos y presentaciones: «Hola GDPSoft, necesito ayuda con la obra social X»
  'hola', 'buen', 'buenas', 'buenos', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches',
  'gdpsoft', 'gdpsotf', 'gdp', 'soft', 'necesito', 'ayuda', 'ayudame', 'tengo', 'duda',
  'dudas', 'pregunta', 'sobre', 'respecto', 'acerca', 'me', 'podes', 'puedes',
  'ayudar', 'por', 'favor', 'gracias', 'queria', 'saber',
]);

export function isBareSocialWorkMention(question, socialWorkName) {
  const nameTokens = new Set(words(socialWorkName));
  if (!nameTokens.size) return false;
  const all = words(question);
  if (!all.length || all.length > 12) return false;
  const rest = all.filter((token) => !NAME_STOPWORDS.has(token));
  return rest.length > 0 && rest.every((token) => nameTokens.has(token));
}

export function buildBareMentionAnswer(socialWorkName) {
  return `¿Qué necesitás saber sobre ${String(socialWorkName).trim()}? Por ejemplo: requisitos de receta, validación, autorizaciones o facturación.`;
}
