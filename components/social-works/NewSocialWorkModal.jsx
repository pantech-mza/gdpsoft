"use client";

import { useState } from "react";
import Link from "next/link";
import { treeApiFetch } from "../../lib/decision-trees/client";

const EMPTY = {
  name: "", active: true, plan: "", recipe_type: "", recipe_validity_days: "", rp: "",
  letterhead: "", diagnosis: "", monodrug: "", commercial_name: "", tys_code: "", substitution: "",
  validator_name: "", validator_type: "", observations: "",
};

const inputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#8f2a85]";

function Field({ label, children, full }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

async function postJson(url, options = {}) {
  const response = await treeApiFetch(url, { method: "POST", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Error HTTP ${response.status}`);
  return payload;
}

export default function NewSocialWorkModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  function addFiles(event) {
    const picked = Array.from(event.target.files || []).map((file) => ({
      file, title: file.name.replace(/\.[^.]+$/, ""),
    }));
    setFiles((prev) => [...prev, ...picked]);
    event.target.value = "";
  }

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (form.name.trim().length < 2) { setError("El nombre es obligatorio"); return; }
    setBusy(true);
    try {
      setProgress("Creando obra social...");
      const created = await postJson("/api/social-works", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const socialWork = created.social_work;
      const outcomes = [];
      for (let index = 0; index < files.length; index += 1) {
        const { file, title } = files[index];
        const label = title.trim() || file.name;
        try {
          setProgress(`Subiendo ${index + 1}/${files.length}: ${label}`);
          const data = new FormData();
          data.append("file", file);
          data.append("title", label);
          data.append("documentKind", "INITIAL");
          data.append("isPrimary", index === 0 ? "true" : "false");
          const uploaded = await postJson(`/api/social-works/${socialWork.id}/normatives/upload`, { body: data });
          const normativeId = Number(uploaded.normative?.id);
          if (!Number.isInteger(normativeId)) throw new Error("No se recibió el ID de la normativa");
          setProgress(`Analizando ${label}...`);
          const analysis = await postJson(`/api/normatives/analyze?normativeId=${normativeId}`);
          if (analysis.recommendation && analysis.recommendation !== "DIRECT") {
            outcomes.push({ label, ok: false, message: `Cargada, pero requiere OCR/revisión (${analysis.recommendation}). Continuá desde la ficha de la obra social.` });
            continue;
          }
          await postJson("/api/normatives/confirm-processing", {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ normativeId, mode: "DIRECT" }),
          });
          setProgress(`Indexando ${label} en OpenAI...`);
          await postJson(`/api/normatives/process?normativeId=${normativeId}`);
          outcomes.push({ label, ok: true, message: "Indexada" });
        } catch (fileError) {
          outcomes.push({ label, ok: false, message: fileError.message || "Error al procesar" });
        }
      }
      setResult({ socialWork, outcomes });
      setProgress("");
      onCreated?.(socialWork);
    } catch (submitError) {
      setError(submitError.message || "No se pudo crear la obra social");
      setProgress("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4">
      <form onSubmit={submit} className="my-6 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-900">Nueva obra social</h2>
          <button type="button" onClick={onClose} disabled={busy} className="text-slate-500 hover:text-slate-800">✕</button>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              Obra social «{result.socialWork.name}» creada.
            </p>
            {result.outcomes.length > 0 && (
              <ul className="space-y-1 text-sm">
                {result.outcomes.map((item, i) => (
                  <li key={i} className={item.ok ? "text-emerald-700" : "text-amber-700"}>
                    {item.ok ? "✓" : "⚠"} {item.label}: {item.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <Link href={`/admin/obras-sociales/${result.socialWork.id}`} className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white">
                Abrir ficha
              </Link>
              <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cerrar</button>
            </div>
          </div>
        ) : (
          <>
            <section className="grid gap-3 md:grid-cols-2">
              <Field label="Nombre *" full><input className={inputClass} value={form.name} onChange={set("name")} required maxLength={160} /></Field>
              <Field label="Plan"><input className={inputClass} value={form.plan} onChange={set("plan")} /></Field>
              <label className="flex items-center gap-2 pt-6 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} />
                {form.active ? "Activa" : "Inactiva"}
              </label>
            </section>

            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Receta</h3>
            <section className="grid gap-3 md:grid-cols-2">
              <Field label="Tipo de receta"><input className={inputClass} value={form.recipe_type} onChange={set("recipe_type")} /></Field>
              <Field label="Vigencia (días)"><input type="number" min="0" className={inputClass} value={form.recipe_validity_days} onChange={set("recipe_validity_days")} /></Field>
              <Field label="RP"><input type="number" min="0" className={inputClass} value={form.rp} onChange={set("rp")} /></Field>
              <Field label="Membrete"><input className={inputClass} value={form.letterhead} onChange={set("letterhead")} /></Field>
              <Field label="Diagnóstico"><input className={inputClass} value={form.diagnosis} onChange={set("diagnosis")} /></Field>
              <Field label="Monodroga"><input className={inputClass} value={form.monodrug} onChange={set("monodrug")} /></Field>
              <Field label="Nombre comercial"><input className={inputClass} value={form.commercial_name} onChange={set("commercial_name")} /></Field>
              <Field label="Código TYS (opcional)"><input className={inputClass} value={form.tys_code} onChange={set("tys_code")} /></Field>
              <Field label="Sustitución"><input className={inputClass} value={form.substitution} onChange={set("substitution")} /></Field>
            </section>

            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Validación</h3>
            <section className="grid gap-3 md:grid-cols-2">
              <Field label="Validador"><input className={inputClass} value={form.validator_name} onChange={set("validator_name")} /></Field>
              <Field label="Tipo de validador"><input className={inputClass} value={form.validator_type} onChange={set("validator_type")} /></Field>
            </section>

            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Observaciones</h3>
            <textarea className={`${inputClass} min-h-24`} value={form.observations} onChange={set("observations")} maxLength={8000} />

            <h3 className="mb-2 mt-5 text-sm font-bold uppercase tracking-wide text-slate-500">Normativas iniciales</h3>
            <input type="file" multiple onChange={addFiles} disabled={busy} className="text-sm"
              accept=".pdf,.doc,.docx,.txt,.md,.html,.xls,.xlsx,.csv" />
            {files.length > 0 && (
              <ul className="mt-3 space-y-2">
                {files.map((item, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input className={inputClass} value={item.title} disabled={busy}
                      onChange={(e) => setFiles((prev) => prev.map((f, j) => (j === i ? { ...f, title: e.target.value } : f)))} />
                    <button type="button" disabled={busy} className="text-sm text-red-600"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>Quitar</button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-slate-500">Se suben, analizan e indexan en OpenAI al crear. El circuito de facturación se puede asignar luego desde la ficha.</p>

            {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {progress && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{progress}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={busy} className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Procesando..." : "Crear obra social"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
