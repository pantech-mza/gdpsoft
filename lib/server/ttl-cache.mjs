// v3.13.118 — caché en memoria de corta duración para datos que casi no cambian (obras sociales, alias, grupo de sucursal).
// Solo guarda resultados sin error. Un cambio en la Ficha se ve como máximo al vencer el tiempo (por defecto 60 s).
const store = new Map();
export const DEFAULT_TTL_MS = 60_000;

/** loader devuelve {data,error} (formato Supabase) o cualquier valor; con error no se guarda. */
export async function cachedLoad(key, ttlMs, loader, now = Date.now) {
  const hit = store.get(key);
  if (hit && now() - hit.t < ttlMs) return hit.value;
  const pending = hit?.pending;
  if (pending && now() - pending.t < 15_000) return pending.promise;
  const promise = Promise.resolve().then(loader);
  store.set(key, { ...(hit || {}), pending: { t: now(), promise } });
  try {
    const value = await promise;
    const failed = value && typeof value === 'object' && 'error' in value && value.error;
    if (!failed) store.set(key, { t: now(), value }); else store.set(key, hit ? { t: hit.t, value: hit.value } : undefined);
    if (!store.get(key)) store.delete(key);
    return value;
  } catch (e) {
    if (hit) store.set(key, { t: hit.t, value: hit.value }); else store.delete(key);
    throw e;
  }
}
export const clearCache = () => store.clear();

// Clave por cliente de base de datos: la caché de una conexión nunca se mezcla con la de otra (ni con simulaciones de prueba).
const ids = new WeakMap(); let nextId = 1;
export function clientKey(client) {
  if (!client || (typeof client !== 'object' && typeof client !== 'function')) return 'x';
  if (!ids.has(client)) ids.set(client, nextId++);
  return `c${ids.get(client)}`;
}
