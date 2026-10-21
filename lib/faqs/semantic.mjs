// GDPSoft v3.13.57 — lógica pura de FAQ por significado (sin base de datos).

export const FAQ_EMBEDDING_MODEL = 'text-embedding-3-small';
export const FAQ_EMBEDDING_DIMENSIONS = 256;
export const FAQ_SUGGEST_THRESHOLD_DEFAULT = 10;
export const FAQ_WINDOW_DAYS = 30;
// Misma consulta (agrupar para contar) vs. suficientemente igual para responder directo.
export const FAQ_CLUSTER_SIMILARITY = 0.84;
export const FAQ_SERVE_SIMILARITY = 0.92;

const SKIP_ROUTES = new Set([
  'COURTESY', 'CLARIFICATION_NEEDED', 'UNKNOWN_EXPLICIT_SOCIAL_WORK', 'STRUCTURED_SOCIAL_WORK_STATUS',
  'APPROVED_FAQ', 'SOCIAL_WORK_REQUIRED', 'CHANNEL_CONFIRMED', 'ADMIN_CORRECTION',
]);

export function getSuggestThreshold(env = process.env) {
  const value = Number(env?.GDP_FAQ_SUGGEST_THRESHOLD);
  return Number.isInteger(value) && value >= 2 ? value : FAQ_SUGGEST_THRESHOLD_DEFAULT;
}

export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || a.length !== b.length) return 0;
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function findBestMatch(embedding, candidates = [], minSimilarity = FAQ_CLUSTER_SIMILARITY) {
  let best = null;
  for (const candidate of candidates) {
    const similarity = cosineSimilarity(embedding, candidate.embedding);
    if (similarity >= minSimilarity && (!best || similarity > best.similarity)) best = { candidate, similarity };
  }
  return best;
}

function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/** ¿Esta consulta respondida cuenta para proponer una FAQ? */
export function isFaqEligible({ question, answer, route, found, trafficType } = {}) {
  if (found !== true || trafficType !== 'PILOT') return false;
  if (!answer || String(answer).trim().length < 20) return false;
  if (SKIP_ROUTES.has(String(route || '').toUpperCase())) return false;
  if (wordCount(question) < 3 || String(question).length > 400) return false;
  return true;
}

/** Una FAQ aprobada solo responde sola si la pregunta es completa y muy parecida. */
export function canServeSemanticFaq(question) {
  return wordCount(question) >= 4 && String(question).length <= 400;
}

export function buildFaqNotification({ socialWorkName, question, count, branches, group }) {
  const where = branches > 1 ? ` desde ${branches} sucursales` : '';
  const circuit = group === 'CAMARA' ? ' (Cámara)' : group === 'COLEGIO' ? ' (Colegio)' : '';
  return {
    type: 'FAQ_SUGGESTED',
    title: `Nueva FAQ propuesta${socialWorkName ? ` · ${socialWorkName}` : ''}${circuit}`,
    body: `«${String(question).slice(0, 160)}» se consultó ${count} veces${where}. Revisala en Preguntas frecuentes.`,
    link: '/admin/faqs',
  };
}
