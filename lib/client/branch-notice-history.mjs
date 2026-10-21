// Historial de avisos de la sucursal (incluye los ya cerrados en esta PC).
import { refreshStoredSession } from './session';

export function getNoticeDeviceContext() {
  try {
    const branch = JSON.parse(sessionStorage.getItem('gdpsoft_branch') || 'null');
    const uuid = localStorage.getItem('gdpsoft_device_uuid');
    return branch?.id && uuid ? { branchId: branch.id, uuid } : null;
  } catch { return null; }
}

export async function fetchNoticeHistory(limit = 5) {
  const context = getNoticeDeviceContext();
  if (!context) throw new Error('No se identificó esta PC. Ingresá nuevamente.');
  const url = `/api/noticias?history=1&limit=${limit}&device_uuid=${encodeURIComponent(context.uuid)}`;
  const make = (token) => fetch(url, { cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
  let response = await make(sessionStorage.getItem('gdpsoft_access_token') || await refreshStoredSession());
  if (response.status === 401) response = await make(await refreshStoredSession());
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudieron cargar los avisos');
  return result;
}

export const SEVERITY_LABEL = { URGENT: 'URGENTE', IMPORTANT: 'IMPORTANTE', INFO: 'NOTICIA' };
export const SEVERITY_CLASS = {
  INFO: 'border-sky-200 bg-sky-50 text-sky-950',
  IMPORTANT: 'border-amber-300 bg-amber-50 text-amber-950',
  URGENT: 'border-red-400 bg-red-50 text-red-950',
};
