"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { treeApiFetch } from "../../lib/decision-trees/client";

function formatWhen(value) {
  try {
    return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function AdminNotifications() {
  const router = useRouter();
  const boxRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await treeApiFetch("/api/admin/notifications", { cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.ok) {
        setItems(result.notifications || []);
        setUnread(result.unread || 0);
      }
    } catch {
      /* sin red: se reintenta en el próximo ciclo */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const onClick = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const markRead = async (id) => {
    try {
      await treeApiFetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id == null ? {} : { id }),
      });
    } catch {
      /* se reintenta al recargar */
    }
    load();
  };

  const openItem = async (item) => {
    if (!item.read_at) await markRead(item.id);
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  return (
    <div ref={boxRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Notificaciones"
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#faf9fc] text-lg hover:bg-zinc-100"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8f2a85] px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <p className="text-sm font-bold text-zinc-900">Notificaciones</p>
            {unread > 0 && (
              <button type="button" onClick={() => markRead(null)} className="text-xs font-semibold text-[#8f2a85]">
                Marcar todas como leídas
              </button>
            )}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-zinc-400">Sin notificaciones.</li>}
            {items.slice(0, 5).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className={`block w-full border-b border-zinc-50 px-4 py-3 text-left hover:bg-zinc-50 ${item.read_at ? "" : "bg-purple-50/60"}`}
                >
                  <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
                  {item.body && <p className="mt-0.5 text-xs text-zinc-600">{item.body}</p>}
                  <p className="mt-1 text-[10px] text-zinc-400">{formatWhen(item.created_at)}</p>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => { setOpen(false); router.push("/admin/notificaciones"); }}
            className="block w-full border-t border-zinc-100 px-4 py-3 text-center text-xs font-semibold text-[#8f2a85] hover:bg-zinc-50">
            Ver todas
          </button>
        </div>
      )}
    </div>
  );
}
