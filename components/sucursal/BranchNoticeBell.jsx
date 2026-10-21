'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchNoticeHistory, SEVERITY_LABEL } from '../../lib/client/branch-notice-history.mjs';

const when = (v) => { try { return new Date(v).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };

export default function BranchNoticeBell() {
  const router = useRouter();
  const box = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchNoticeHistory(5);
      setItems(r.notices || []); setTotal(r.total || 0); setError('');
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const unread = items.filter((n) => !n.read).length;
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-label="Avisos anteriores" onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#faf9fc] text-lg hover:bg-zinc-100">
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8f2a85] px-1 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="border-b border-zinc-100 px-4 py-3"><p className="text-sm font-bold text-zinc-900">Avisos</p></div>
          {error && <p className="px-4 py-3 text-xs text-red-600">{error}</p>}
          <ul className="max-h-[420px] overflow-y-auto">
            {!error && items.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-400">Sin avisos.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => setExpanded(expanded === n.id ? null : n.id)}
                  className={`block w-full border-b border-zinc-50 px-4 py-3 text-left hover:bg-zinc-50 ${n.read ? '' : 'bg-purple-50/60'}`}>
                  <p className="text-[10px] font-black uppercase tracking-wide text-zinc-500">{SEVERITY_LABEL[n.severity] || 'NOTICIA'}</p>
                  <p className="text-sm font-semibold text-zinc-900">{n.title}</p>
                  {expanded === n.id && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-zinc-600">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-zinc-400">{when(n.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setOpen(false); router.push('/sucursal/avisos'); }}
            className="block w-full border-t border-zinc-100 px-4 py-3 text-center text-xs font-semibold text-[#8f2a85] hover:bg-zinc-50">
            Ver todas{total > 5 ? ` (${total})` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
