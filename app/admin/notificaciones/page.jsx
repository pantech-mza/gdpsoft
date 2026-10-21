"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { treeApiFetch } from "../../../lib/decision-trees/client";

export default function NotificacionesPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const response = await treeApiFetch("/api/admin/notifications?all=1", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "No se pudieron cargar las notificaciones");
        setItems(result.notifications || []);
      } catch (e) { setError(e.message); }
    })();
  }, []);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold text-zinc-900">Notificaciones</h1>
      <p className="mb-5 text-sm text-zinc-500">Todas, de la más reciente a la más antigua.</p>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
      {items === null && !error && <p className="text-sm text-zinc-400">Cargando…</p>}
      {items?.length === 0 && <p className="text-sm text-zinc-400">Sin notificaciones.</p>}
      <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white">
        {(items || []).map((item) => (
          <li key={item.id} className={`px-4 py-3 ${item.read_at ? "" : "bg-purple-50/60"}`}>
            <p className="text-sm font-semibold text-zinc-900">{item.title}</p>
            {item.body && <p className="mt-0.5 text-xs text-zinc-600">{item.body}</p>}
            <p className="mt-1 text-[10px] text-zinc-400">
              {new Date(item.created_at).toLocaleString("es-AR")}
              {item.link && <> · <Link href={item.link} className="font-semibold text-[#8f2a85]">Abrir</Link></>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
