'use client';
import { useEffect, useState } from 'react';
import { fetchNoticeHistory, SEVERITY_CLASS, SEVERITY_LABEL } from '../../../lib/client/branch-notice-history.mjs';

export default function AvisosPage() {
  const [notices, setNotices] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetchNoticeHistory(150).then((r) => setNotices(r.notices || [])).catch((e) => setError(e.message));
  }, []);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold text-zinc-900">Avisos</h1>
      <p className="mb-5 text-sm text-zinc-500">Todos los avisos de Farmacias del Plata, del más reciente al más antiguo.</p>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {notices === null && !error && <p className="text-sm text-zinc-400">Cargando…</p>}
      {notices?.length === 0 && <p className="text-sm text-zinc-400">No hay avisos.</p>}
      <div className="space-y-3">
        {(notices || []).map((n) => (
          <article key={n.id} className={`rounded-2xl border-2 p-4 ${SEVERITY_CLASS[n.severity] || SEVERITY_CLASS.INFO}`}>
            <div className="text-[10px] font-black uppercase tracking-[.12em]">📣 {SEVERITY_LABEL[n.severity] || 'NOTICIA'}{n.read ? ' · leído' : ' · nuevo'}</div>
            <h2 className="mt-1 text-[15px] font-bold">{n.title}</h2>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{n.body}</div>
            <p className="mt-3 text-[11px] opacity-70">{new Date(n.created_at).toLocaleString('es-AR')}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
