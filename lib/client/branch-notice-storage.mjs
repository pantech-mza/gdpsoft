// Avisos cerrados por sucursal y dispositivo de este navegador.
// Es una copia local de respaldo; el servidor sigue guardando el ACK definitivo.
const PREFIX = 'gdpsoft_notices_closed_v1';

export function noticeStorageKey(branchId, deviceUuid) {
  const branch = String(branchId ?? '').trim();
  const uuid = String(deviceUuid ?? '').trim();
  if (!/^\d+$/.test(branch) || !/^[0-9a-f-]{36}$/i.test(uuid)) return null;
  return `${PREFIX}:${branch}:${uuid.toLowerCase()}`;
}

export function readClosedNotices(storage, branchId, deviceUuid) {
  const key = noticeStorageKey(branchId, deviceUuid);
  if (!key) return new Set();
  try {
    const value = JSON.parse(storage.getItem(key) || '[]');
    return new Set(Array.isArray(value)
      ? value.filter(id => (typeof id === 'string' || typeof id === 'number') && /^\d+$/.test(String(id))).map(String)
      : []);
  } catch {
    // localStorage puede estar deshabilitado o contener datos de una versión vieja.
    return new Set();
  }
}

export function closeNoticeLocally(storage, branchId, deviceUuid, noticeId) {
  const key = noticeStorageKey(branchId, deviceUuid);
  const id = String(noticeId ?? '');
  if (!key || !/^\d+$/.test(id)) return false;
  try {
    const ids = readClosedNotices(storage, branchId, deviceUuid);
    ids.delete(id);
    ids.add(id);
    // Limitar crecimiento sin afectar publicaciones recientes.
    storage.setItem(key, JSON.stringify([...ids].slice(-500)));
    return true;
  } catch {
    return false;
  }
}

export function filterClosedNotices(notices, storage, branchId, deviceUuid) {
  const closed = readClosedNotices(storage, branchId, deviceUuid);
  return (notices || []).filter(n => !closed.has(String(n.id)));
}
