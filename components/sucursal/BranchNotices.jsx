'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshStoredSession } from '../../lib/client/session';
import { closeNoticeLocally, filterClosedNotices, readClosedNotices } from '../../lib/client/branch-notice-storage.mjs';

const severityClass = {
  INFO: 'border-sky-200 bg-sky-50 text-sky-950',
  IMPORTANT: 'border-amber-300 bg-amber-50 text-amber-950',
  URGENT: 'border-red-400 bg-red-50 text-red-950',
};

function getNoticeContext() {
  try {
    const branch = JSON.parse(sessionStorage.getItem('gdpsoft_branch') || 'null');
    const uuid = localStorage.getItem('gdpsoft_device_uuid');
    return branch?.id && uuid ? { branchId: branch.id, uuid } : null;
  } catch { return null; }
}

// v3.13.102r — Solo la noticia más reciente aparece como tarjeta; el resto queda pendiente en la campanita.
const popupKey = (c) => `gdpsoft_notice_popup_ts_v1:${c.branchId}:${c.uuid}`;
const ts = (n) => { const v = Date.parse(n?.created_at); return Number.isNaN(v) ? 0 : v; };
function readPopupTs(context) { try { return Number(localStorage.getItem(popupKey(context)) || 0); } catch { return 0; } }
function writePopupTs(context, value) { try { localStorage.setItem(popupKey(context), String(value)); } catch { /* sin almacenamiento: no se recuerda */ } }
export function pickPopupNotice(rows, lastSeenTs = 0) {
  const sorted = [...(rows || [])].sort((a, b) => ts(b) - ts(a));
  const newest = sorted[0];
  return newest && ts(newest) > lastSeenTs ? newest : null;
}

export default function BranchNotices() {
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const pendingSync = useRef(new Set());

  const request = useCallback(async (url, opts = {}) => {
    let token = sessionStorage.getItem('gdpsoft_access_token') || await refreshStoredSession();
    const make = t => fetch(url, {
      ...opts,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}`, ...opts.headers },
    });
    let response = await make(token);
    if (response.status === 401) response = await make(await refreshStoredSession());
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Error al consultar noticias');
    return result;
  }, []);

  const acknowledgeOnServer = useCallback((id, context) => {
    const key = `${context.branchId}:${context.uuid}:${id}`;
    if (pendingSync.current.has(key)) return;
    pendingSync.current.add(key);
    request('/api/noticias', {
      method: 'POST',
      body: JSON.stringify({ notice_id: id, device_uuid: context.uuid }),
    }).catch(() => {
      // El cierre local persiste. Se vuelve a intentar cuando GET lo reporte pendiente.
    }).finally(() => { pendingSync.current.delete(key); });
  }, [request]);

  const reload = useCallback(async () => {
    const context = getNoticeContext();
    if (!context) {
      setNotices([]);
      setError('No se identificó esta PC. Ingresá nuevamente para registrar el dispositivo.');
      return;
    }
    try {
      const result = await request(`/api/noticias?device_uuid=${encodeURIComponent(context.uuid)}`);
      // No mezclar consultas si la sucursal/dispositivo cambió mientras llegaba la respuesta.
      const current = getNoticeContext();
      if (!current || current.branchId !== context.branchId || current.uuid !== context.uuid) return;
      const rows = result.notices || [];
      setNotices(filterClosedNotices(rows, localStorage, context.branchId, context.uuid));
      setError('');

      // Si el servidor todavía no recibió un cierre local (caída de red/token), reintentarlo.
      const closed = readClosedNotices(localStorage, context.branchId, context.uuid);
      rows.filter(n => closed.has(String(n.id))).slice(0, 20)
        .forEach(n => acknowledgeOnServer(n.id, context));
    } catch (err) {
      setError(err.message);
    }
  }, [request, acknowledgeOnServer]);

  // Con el chat abierto, el aviso se corre a la izquierda para no quedar detrás de él.
  useEffect(() => {
    const onState = (e) => setChatOpen(!!e?.detail?.open);
    window.addEventListener('gdpsoft:assistant-state', onState);
    return () => window.removeEventListener('gdpsoft:assistant-state', onState);
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 20000);
    const onVisible = () => { if (!document.hidden) reload(); };
    const onStorage = e => { if (e.key?.startsWith('gdpsoft_notices_closed_v1:')) reload(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, [reload]);

  function acknowledge(id) {
    const context = getNoticeContext();
    if (!context) {
      setError('No se pudo identificar la sucursal y esta PC. Volvé a iniciar sesión.');
      return;
    }
    setClosing(id);
    // Al cerrar la tarjeta, lo que ya estaba pendiente deja de salir como emergente (sigue en la campanita).
    writePopupTs(context, Math.max(readPopupTs(context), ...notices.map(ts)));
    // Guardar ANTES del POST. Si falla Supabase o se actualiza la pantalla,
    // este mismo aviso no vuelve a mostrarse en esta PC.
    const saved = closeNoticeLocally(localStorage, context.branchId, context.uuid, id);
    if (saved) {
      setNotices(rows => rows.filter(n => String(n.id) !== String(id)));
      setError('');
      acknowledgeOnServer(id, context);
    } else {
      // Sin almacenamiento local, intentar el ACK remoto y dejar explícito el error.
      setError('No se pudo guardar el cierre en este navegador. Revisá el almacenamiento del sitio.');
    }
    setClosing(null);
  }

  const popupContext = getNoticeContext();
  const popup = popupContext ? pickPopupNotice(notices, readPopupTs(popupContext)) : (notices[0] || null);
  const others = Math.max(0, notices.length - (popup ? 1 : 0));
  if (!popup && !error) return null;
  return <aside role="region" aria-label="Avisos de Farmacias del Plata" className={`pointer-events-none fixed right-3 top-20 lg:top-[130px] z-[95] w-[min(410px,calc(100vw-24px))] space-y-3 sm:right-6 ${chatOpen ? "md:right-[620px]" : ""}`}>
    {error && <div role="alert" className="pointer-events-auto rounded-xl border border-red-300 bg-white p-3 text-sm text-red-700 shadow-lg">{error}</div>}
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      {popup && [popup].map(n => <div key={n.id} className={`pointer-events-auto rounded-2xl border-2 p-4 shadow-xl ${severityClass[n.severity] || severityClass.INFO}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.12em]">📣 {n.severity === 'URGENT' ? 'URGENTE' : n.severity === 'IMPORTANT' ? 'IMPORTANTE' : 'NOTICIA'}</div><h3 className="mt-1 text-[15px] font-bold">{n.title}</h3></div>
          <button type="button" disabled={closing === n.id} title="Marcar como leído en esta PC" aria-label={`Cerrar aviso ${n.title} en este dispositivo`} onClick={() => acknowledge(n.id)} className="shrink-0 rounded-lg border border-current/25 bg-white/75 px-2.5 py-1 text-lg font-bold hover:bg-white disabled:opacity-40">×</button>
        </div>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{n.body}</div>
        <p className="mt-3 text-[11px] opacity-70">Visible hasta que se cierre en esta PC · {new Date(n.created_at).toLocaleString('es-AR')}</p>
        {others > 0 && <p className="mt-1 text-[11px] font-semibold">🔔 Hay {others} aviso{others === 1 ? '' : 's'} más en la campanita.</p>}
      </div>)}
    </div>
  </aside>;
}
