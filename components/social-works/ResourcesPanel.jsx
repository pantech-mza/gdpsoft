"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { refreshStoredSession } from "../../lib/client/session";
const inputStyle = "w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-800 focus:border-[#8f2a85] focus:outline-none";
const primary = "inline-flex items-center justify-center rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#72216c] disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";
const cardClass = "min-w-0 rounded-[17px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5";
const BLANK = { name: "", department: "", phone: "", email: "", notes: "" };
export default function ResourcesPanel({ socialWorkId, kind, editable = false }) {
  const [data, setData] = useState({ contacts: [], billing: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [fileData, setFileData] = useState({ title: "", description: "", file: null });
  const fileInputRef = useRef(null);
  const uploadFormRef = useRef(null);
  async function api(url, opts = {}) {
    let token = sessionStorage.getItem("gdpsoft_access_token") || await refreshStoredSession();
    const make = t => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` } });
    let response = await make(token);
    if (response.status === 401) response = await make(await refreshStoredSession());
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo completar la solicitud");
    return result;
  }
  async function uploadBillingMaterial() {
    const file = fileData.file;
    if (!file) throw new Error("Seleccioná un archivo");
    if (file.size > 100 * 1024 * 1024) throw new Error("El archivo supera el límite de 100 MB");
    const prepare = await api(`${endpoint}/upload`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", title: fileData.title,
        description: fileData.description, fileName: file.name,
        mimeType: file.type, bytes: file.size }),
    });
    // No se envían los bytes del video a Vercel: se suben a Supabase Storage.
    const upload = await fetch(prepare.signedUrl, {
      method: "PUT", headers: { "content-type": file.type || (file.name.toLowerCase().endsWith(".mp4") ? "video/mp4" : file.name.toLowerCase().endsWith(".webm") ? "video/webm" : "application/pdf"),
        "cache-control": "max-age=3600" },
      body: file,
    });
    if (!upload.ok) {
      const detail = await upload.text().catch(() => "");
      let message = "No se pudo subir el archivo a Supabase";
      try { const parsed = JSON.parse(detail); message = parsed.message || parsed.error || message; } catch { /* respuesta no JSON */ }
      throw new Error(`${message} (HTTP ${upload.status}). Verificá el límite del bucket y la conexión.`);
    }
    await api(`${endpoint}/upload`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "finalize", ticket: prepare.ticket }),
    });
    setFileData({ title: "", description: "", file: null });
  }

  async function load() {
    try {
      setLoading(true); setError("");
      setData(await api(`/api/social-works/${socialWorkId}/resources`));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (socialWorkId) load(); }, [socialWorkId]);
  async function act(fn, success) {
    setBusy(true); setError(""); setMessage("");
    try { await fn(); await load(); setEditing(null); setMessage(success); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const endpoint = `/api/social-works/${socialWorkId}/resources`;

return (
  <section className="space-y-4 sm:space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-[18px] font-bold text-zinc-900 sm:text-[20px]">
          {kind === "contact" ? "Contactos" : "Cómo facturar"}
        </h2>
        <p className="text-sm text-zinc-500">
          {kind === "contact"
            ? "Contactos y canales de autorización por obra social."
            : "Guías, PDF y videos publicados para la sucursal."}
        </p>
      </div>
      {editable && kind === "contact" && (
        <button className={primary} onClick={() => setEditing({ ...BLANK })}>
          + Agregar contacto
        </button>
      )}
      {editable && kind === "billing" && (
        <button type="button" className={primary}
          onClick={() => uploadFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
          <Icon icon="fluent:arrow-upload-20-regular" width="18" className="mr-2" />
          Subir archivo
        </button>
      )}
    </div>

    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{message}</p>}

    {loading ? (
      <div className={`${cardClass} text-sm text-zinc-500`}>Cargando…</div>
    ) : kind === "contact" ? (
      <div className="grid gap-3 lg:grid-cols-2">
        {data.contacts.length === 0 && (
          <div className={`${cardClass} text-sm text-zinc-500`}>Todavía no hay contactos cargados.</div>
        )}

        {data.contacts.map((c) => (
          <article key={c.id} className={cardClass}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 inline-flex items-center rounded-full bg-[#f8eafa] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8f2a85]">
                  Contacto
                </div>
                <h3 className="break-words text-[20px] font-bold tracking-[-0.02em] text-[#191020]">{c.name}</h3>
                {c.department && <p className="mt-1 text-sm text-zinc-500">{c.department}</p>}
              </div>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#f8eafa]">
                <Icon icon="fluent-color:phone-24" width="22" />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {c.phone && (
                <a className="inline-flex items-center gap-2 text-sm font-medium text-[#8f2a85] underline" href={`tel:${c.phone}`}>
                  <Icon icon="fluent:phone-20-regular" width="16" />
                  {c.phone}
                </a>
              )}
              {c.email && (
                <div>
                  <a className="inline-flex items-center gap-2 break-all text-sm font-medium text-[#8f2a85] underline" href={`mailto:${c.email}`}>
                    <Icon icon="fluent:mail-20-regular" width="16" />
                    {c.email}
                  </a>
                </div>
              )}
              {c.notes && <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-600">{c.notes}</p>}
            </div>

            {editable && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button className={secondary} onClick={() => setEditing({ ...c })}>Editar</button>
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar el contacto ${c.name}?`)) {
                      act(
                        () =>
                          api(endpoint, {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ kind: "contact", id: c.id }),
                          }),
                        "Contacto eliminado"
                      );
                    }
                  }}
                >
                  Eliminar
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    ) : (
      <div className="grid gap-3 lg:grid-cols-2">
        {data.billing.length === 0 && (
          <div className={`${cardClass} text-sm text-zinc-500`}>Todavía no hay material de facturación publicado.</div>
        )}
        {data.billing.map((f) => (
          <article key={f.id} className={cardClass}>
            <div className="mb-1 inline-flex items-center rounded-full bg-[#f8eafa] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#8f2a85]">
              {f.mime_type?.startsWith("video/") ? "Video" : "PDF"}
            </div>
            <h3 className="break-words text-[20px] font-bold tracking-[-0.02em] text-[#191020]">{f.title}</h3>
            {f.description && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{f.description}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noopener noreferrer" className={secondary}>
                  Abrir archivo ↗
                </a>
              ) : (
                <span className="text-xs text-red-600">No se pudo generar el enlace</span>
              )}
              {editable && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar definitivamente «${f.title}»? Se quitará de GDPSoft y de Supabase Storage. Esta acción no se puede deshacer.`)) {
                      act(
                        () =>
                          api(endpoint, {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ kind: "billing", id: f.id }),
                          }),
                        "Archivo eliminado"
                      );
                    }
                  }}
                >
                  Eliminar archivo
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    )}

    {editable && kind === "billing" && (
      <form ref={uploadFormRef} data-gdp-billing-upload-v31315="true"
        className="rounded-[17px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const formElement = e.currentTarget;
          act(async () => {
            await uploadBillingMaterial();
            formElement.reset();
          }, "Archivo publicado correctamente");
        }}
      >
        <h3 className="text-[16px] font-bold text-zinc-900">Subir archivo de facturación</h3>
        <p className="mt-1 text-sm text-zinc-500">PDF o video MP4/WebM (máx. 100 MB)</p>
        <div className="mt-4 space-y-3">
          <input className={inputStyle} required maxLength={200} placeholder="Título del material" value={fileData.title} onChange={(e) => setFileData((v) => ({ ...v, title: e.target.value }))} />
          <textarea className={inputStyle} rows={2} maxLength={1000} placeholder="Descripción opcional" value={fileData.description} onChange={(e) => setFileData((v) => ({ ...v, description: e.target.value }))} />
          <input ref={fileInputRef} className="sr-only" required type="file"
            accept=".pdf,.mp4,.webm,application/pdf,video/mp4,video/webm"
            onChange={(e) => setFileData((v) => ({ ...v, file: e.target.files?.[0] || null }))} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={secondary} disabled={busy}
              onClick={() => fileInputRef.current?.click()}>
              <Icon icon="fluent:folder-open-20-regular" width="18" className="mr-2" />
              Seleccionar archivo
            </button>
            <span className="min-w-0 break-all text-sm text-zinc-600" aria-live="polite">
              {fileData.file ? `${fileData.file.name} (${(fileData.file.size / 1024 / 1024).toFixed(1)} MB)` : "Ningún archivo seleccionado"}
            </span>
          </div>
          <button type="submit" className={primary} disabled={busy || !fileData.file || !fileData.title.trim()}>
            <Icon icon="fluent:arrow-upload-20-regular" width="18" className="mr-2" />
            {busy ? "Subiendo archivo…" : "Subir archivo"}
          </button>
        </div>
      </form>
    )}

    {editable && kind === "contact" && editing && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
        <form
          className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              () =>
                api(endpoint, {
                  method: editing.id ? "PATCH" : "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ ...editing, kind: "contact" }),
                }),
              editing.id ? "Contacto actualizado" : "Contacto creado"
            );
          }}
        >
          <h3 className="text-lg font-bold">{editing.id ? "Editar contacto" : "Agregar contacto"}</h3>
          {[["name", "Nombre / referencia"], ["department", "Área / sector"], ["phone", "Teléfono"], ["email", "Correo electrónico"]].map(([key, label]) => (
            <label key={key} className="block text-sm text-zinc-600">
              {label}
              <input className={`${inputStyle} mt-1`} required={key === "name" || key === "phone"} type={key === "email" ? "email" : "text"} value={editing[key] || ""} onChange={(e) => setEditing((v) => ({ ...v, [key]: e.target.value }))} />
            </label>
          ))}
          <label className="block text-sm text-zinc-600">
            Observaciones
            <textarea className={`${inputStyle} mt-1`} rows={3} maxLength={1500} value={editing.notes || ""} onChange={(e) => setEditing((v) => ({ ...v, notes: e.target.value }))} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setEditing(null)}>Cancelar</button>
            <button disabled={busy} className={primary}>{busy ? "Guardando…" : "Guardar contacto"}</button>
          </div>
        </form>
      </div>
    )}
  </section>
);

}
