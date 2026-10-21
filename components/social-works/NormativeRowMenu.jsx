"use client";

import { useEffect, useRef, useState } from "react";
import { treeApiFetch } from "../../lib/decision-trees/client";

// Menú «⋯» de una normativa: Editar o Eliminar.
export default function NormativeRowMenu({ normative, onChanged, onMessage }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", effective_from: "", effective_to: "" });
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) });
    setOpen((value) => !value);
  };

  const startEdit = () => {
    setForm({
      title: normative.title || "",
      effective_from: String(normative.effective_from || "").slice(0, 10),
      effective_to: String(normative.effective_to || "").slice(0, 10),
    });
    setOpen(false);
    setEditing(true);
  };

  const call = async (method, body) => {
    const response = await treeApiFetch(`/api/normatives/${normative.id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) throw new Error(payload.error || `Error HTTP ${response.status}`);
    return payload;
  };

  const save = async () => {
    setSaving(true);
    try {
      await call("PATCH", {
        title: form.title,
        effective_from: form.effective_from || null,
        effective_to: form.effective_to || null,
      });
      setEditing(false);
      onMessage?.("Normativa actualizada.");
      await onChanged?.();
    } catch (error) {
      onMessage?.(`No se pudo guardar la normativa: ${error?.message || "error desconocido"}`);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setOpen(false);
    if (!window.confirm(`¿Eliminar la normativa «${normative.title}»?\n\nSe quita del índice del bot y de la obra social. Esta acción no se puede deshacer.`)) return;
    try {
      const result = await call("DELETE");
      onMessage?.(result.archived ? "La normativa tiene registros asociados: se archivó y ya no está vigente." : "Normativa eliminada.");
      await onChanged?.();
    } catch (error) {
      onMessage?.(`No se pudo eliminar la normativa: ${error?.message || "error desconocido"}`);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[#8f2a85]";
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Más acciones"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#8f2a85]/20 bg-[#8f2a85]/5 text-lg font-bold leading-none text-[#8f2a85] transition hover:bg-[#8f2a85]/10"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div role="menu" style={{ position: "fixed", top: position.top, right: position.right }} className="z-50 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <button type="button" role="menuitem" onClick={startEdit} className="block w-full px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50">Editar normativa</button>
            <button type="button" role="menuitem" onClick={remove} className="block w-full px-4 py-2 text-left text-sm text-rose-700 hover:bg-rose-50">Eliminar normativa</button>
          </div>
        </>
      )}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !saving && setEditing(false)}>
          <div role="dialog" aria-modal="true" aria-label="Editar normativa" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-base font-bold text-zinc-900">Editar normativa</h3>
            <label className="mt-4 block text-xs font-semibold text-zinc-600">Título
              <input className={field} value={form.title} maxLength={200} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold text-zinc-600">Vigente desde
                <input type="date" className={field} value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} />
              </label>
              <label className="block text-xs font-semibold text-zinc-600">Vigente hasta
                <input type="date" className={field} value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600">Cancelar</button>
              <button type="button" disabled={saving || form.title.trim().length < 3} onClick={save} className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
