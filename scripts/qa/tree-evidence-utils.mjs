/**
 * Funciones puras de la auditoría de GDPSoft.
 * OpenAI Vector Store Search acepta como máximo 5 consultas en query[].
 * No ejecuta ninguna operación de red ni modifica datos.
 */
export const MAX_OPENAI_SEARCH_QUERIES = 5;

export function batchSearchQueries(queries, max = MAX_OPENAI_SEARCH_QUERIES) {
  if (!Array.isArray(queries)) throw new TypeError('Las consultas deben ser un arreglo');
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_OPENAI_SEARCH_QUERIES) {
    throw new RangeError('El tamaño del lote debe estar entre 1 y 5');
  }
  const batches = [];
  for (let i = 0; i < queries.length; i += max) {
    batches.push(queries.slice(i, i + max));
  }
  return batches;
}

/**
 * Intercala resultados para que una búsqueda de los primeros nodos no llene
 * todo el presupuesto de evidencia e impida citar los últimos nodos.
 * La API ya ordena cada lote por relevancia.
 */
export function interleaveSearchResults(resultsByBatch) {
  if (!Array.isArray(resultsByBatch)) throw new TypeError('Resultados inválidos');
  const merged = [];
  let maxLen = 0;
  for (const group of resultsByBatch) maxLen = Math.max(maxLen, (group || []).length);
  for (let i = 0; i < maxLen; i++) {
    for (const group of resultsByBatch) {
      if (group?.[i]) merged.push(group[i]);
    }
  }
  return merged;
}
