// Máximo documentado por OpenAI para consultas con bucket_width=1d.
export const MAX_DAILY_BUCKETS = 31;

export function clampDailyBucketLimit(value) {
  const requested = Number(value);
  return Number.isFinite(requested)
    ? Math.min(MAX_DAILY_BUCKETS, Math.max(1, Math.floor(requested)))
    : MAX_DAILY_BUCKETS;
}

/**
 * Obtiene todas las páginas de la API de organización sin superar el límite de
 * agrupaciones diarias. Lanza error si no puede recuperar todo el período;
 * nunca devuelve silenciosamente un gasto parcial como si fuera total.
 */
export async function collectPagedOpenAIBuckets(fetchPage, path, params = {}, maxPages = 20) {
  const data = [];
  const seenCursors = new Set();
  let cursor = null;

  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(path, {
      ...params,
      limit: clampDailyBucketLimit(params.limit),
      ...(cursor ? { page: cursor } : {}),
    });
    if (!Array.isArray(page?.data)) {
      throw new Error('OpenAI devolvió una página sin datos válidos');
    }
    data.push(...page.data);
    if (!page.has_more) return data;
    if (!page.next_page || seenCursors.has(page.next_page)) {
      throw new Error('OpenAI no devolvió un cursor válido para continuar la consulta');
    }
    seenCursors.add(page.next_page);
    cursor = page.next_page;
  }
  throw new Error('OpenAI requiere más páginas de las admitidas para este período');
}
