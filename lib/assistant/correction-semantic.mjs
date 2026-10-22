// v3.13.84 — una corrección del administrador sirve para TODAS las formas de hacer la misma pregunta.
//
// 1. Se convierten en embeddings la pregunta nueva y las preguntas ya corregidas de la misma obra social.
// 2. Las más parecidas (sobre un umbral bajo) pasan a un juez corto que decide si la respuesta aprobada
//    contesta la pregunta nueva sin cambiar su sentido. Si no está seguro, no coincide.
// 3. Todo falla en silencio: ante cualquier error se responde como antes.
//
// El cliente OpenAI se recibe por parámetro (se prueba con uno simulado).

const EMBED_MODEL = 'text-embedding-3-small';
const MIN_SCORE = 0.74;
const MAX_CANDIDATES = 3;
const TIMEOUT_MS = 7000;
const cache = new Map();

const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 600);

export function cosine(a, b) {
  let dot = 0; let na = 0; let nb = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

const withTimeout = (promise, ms = TIMEOUT_MS) => Promise.race([
  promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
]);

async function embedAll(client, texts) {
  const missing = [...new Set(texts.filter((t) => !cache.has(t)))];
  if (missing.length) {
    const response = await withTimeout(client.embeddings.create({ model: EMBED_MODEL, input: missing }));
    response.data.forEach((row, index) => cache.set(missing[index], row.embedding));
    if (cache.size > 3000) for (const key of cache.keys()) { cache.delete(key); if (cache.size <= 1500) break; }
  }
  return texts.map((t) => cache.get(t));
}

export function rankBySimilarity(questionVector, corrections, vectors, minScore = MIN_SCORE) {
  return corrections
    .map((item, index) => ({ item, score: vectors[index] ? cosine(questionVector, vectors[index]) : 0 }))
    .filter((row) => row.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

export function buildJudgePrompt(question, candidates) {
  const lines = candidates.map((row, index) =>
    `${index + 1}. Pregunta ya corregida: «${String(row.item.question || row.item.normalizedQuestion).slice(0, 300)}»\n   Respuesta aprobada: ${String(row.item.suggested).replace(/\s+/g, ' ').slice(0, 600)}`);
  return `Una farmacia hace esta consulta sobre una obra social: «${String(question).slice(0, 400)}»

Estas son respuestas que el administrador ya aprobó para consultas anteriores de la MISMA obra social:
${lines.join('\n')}

¿Alguna respuesta aprobada contesta, correcta y completamente, la consulta nueva, sin cambiar su sentido?
Respondé "match": null si la consulta nueva pregunta otra cosa, agrega una condición distinta (un plan, un medicamento, un monto, una negación), depende de una conversación previa, o tenés la menor duda.
Respondé SOLO JSON: {"match": <número de la respuesta o null>}`;
}

export function parseJudge(text, max) {
  const m = String(text ?? '').match(/\{[^}]*\}/);
  if (!m) return null;
  try {
    const n = JSON.parse(m[0]).match;
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  } catch { return null; }
}

export async function matchCorrectionSemantically({ client, question, corrections, model = 'gpt-4.1-mini' }) {
  try {
    if (!client || !Array.isArray(corrections) || !corrections.length) return null;
    const q = clean(question);
    if (q.split(' ').length < 3) return null;
    const pool = corrections.slice(0, 60);
    const texts = [q, ...pool.map((item) => clean(item.question || item.normalizedQuestion))];
    const vectors = await embedAll(client, texts);
    const ranked = rankBySimilarity(vectors[0], pool, vectors.slice(1));
    if (!ranked.length) return null;
    const response = await withTimeout(client.responses.create({
      model, input: buildJudgePrompt(question, ranked), temperature: 0, max_output_tokens: 40,
    }));
    const pick = parseJudge(response.output_text, ranked.length);
    return pick ? { ...ranked[pick - 1].item, semanticScore: ranked[pick - 1].score } : null;
  } catch {
    return null;
  }
}
