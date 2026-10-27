"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { refreshStoredSession } from "../../lib/client/session";
import { filterSegments, groupIntoSegments, summarize } from "../../lib/review/conversation-groups.mjs";
import { applyNoiseFilter, markReviewNoise, noiseCounts } from "../../lib/review/review-noise.mjs";
import { stripMarkdown } from "../../lib/assistant/plain-text.mjs";

// GDPSoft v3.13.70 — Validación de respuestas por conversación (tramo = sucursal + dispositivo + obra social + horario).

async function api(path, opts = {}) {
  const token = sessionStorage.getItem("gdpsoft_access_token") || (await refreshStoredSession());
  const call = (t) => fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${t}` }, cache: "no-store" });
  let response = await call(token);
  if (response.status === 401) response = await call(await refreshStoredSession());
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.ok) throw new Error(json.error || "Error de validación");
  return json;
}

const VERDICTS = [
  ["CORRECT", "Correcta", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  ["PARTIAL", "Parcial", "border-amber-300 bg-amber-50 text-amber-700"],
  ["INCORRECT", "Incorrecta", "border-red-300 bg-red-50 text-red-700"],
];
const PERIODS = [["TODAY", "Hoy"], ["7D", "Últimos 7 días"], ["30D", "Últimos 30 días"], ["ALL", "Todo"]];
const STATUSES = [["PENDING", "Pendientes"], ["ALERTS", "Con alertas"], ["REVIEWED", "Revisadas"], ["ALL", "Todas"]];

function periodStart(period) {
  const now = new Date();
  if (period === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (period === "7D") return Date.now() - 7 * 86400000;
  if (period === "30D") return Date.now() - 30 * 86400000;
  return null;
}
const time = (value) => new Date(value).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
const dayLabel = (value) => {
  const date = new Date(value);
  const today = new Date();
  const same = (a, b) => a.toDateString() === b.toDateString();
  const yesterday = new Date(Date.now() - 86400000);
  const text = date.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  return same(date, today) ? `Hoy · ${text}` : same(date, yesterday) ? `Ayer · ${text}` : date.toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "2-digit" });
};

function VerdictButtons({ item, active, onPick, muted = false }) {
  const current = item.review?.verdict;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {VERDICTS.map(([value, label, cls]) => (
        <button key={value} type="button" onClick={() => onPick(item, value)}
          className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${current === value ? cls : "border-zinc-200 bg-white text-zinc-600 hover:border-[#8f2a85]/40"} ${muted ? "opacity-70" : ""}`}>
          {label}
        </button>
      ))}
      {active && <span className="text-[10px] font-semibold text-[#8f2a85]">en revisión →</span>}
    </div>
  );
}

export default function AdminBranchValidation() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ status: "PENDING", period: "TODAY", branchId: "", deviceId: "", socialWorkId: "", text: "" });
  // v3.13.104 — por defecto no se muestran las pruebas internas (Nico/Admin) ni los intentos repetidos de una misma pregunta.
  const [hideInternal, setHideInternal] = useState(true);
  const [hideRepeats, setHideRepeats] = useState(true);
  const [segmentId, setSegmentId] = useState(null);
  const [itemId, setItemId] = useState(null);
  const [verdict, setVerdict] = useState("");
  const [comment, setComment] = useState("");
  const [correction, setCorrection] = useState("");
  const [appliesTo, setAppliesTo] = useState("BOTH");
  const [expanded, setExpanded] = useState({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await api("/api/admin/validacion")).rows || []);
      setError("");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const markedRows = useMemo(() => markReviewNoise(rows), [rows]);
  const noise = useMemo(() => noiseCounts(markedRows), [markedRows]);
  const viewRows = useMemo(() => applyNoiseFilter(markedRows, { hideInternal, hideRepeats }), [markedRows, hideInternal, hideRepeats]);
  const allSegments = useMemo(() => groupIntoSegments(viewRows), [viewRows]);
  const visible = useMemo(
    () => filterSegments(allSegments, { ...filters, from: periodStart(filters.period) }),
    [allSegments, filters],
  );
  const stats = useMemo(() => summarize(allSegments), [allSegments]);
  const selected = useMemo(() => allSegments.find((seg) => seg.id === segmentId) || null, [allSegments, segmentId]);
  const selectedItem = selected?.items.find((item) => item.id === itemId) || null;

  const options = useMemo(() => {
    const uniq = (list) => [...new Map(list.filter(([id]) => id != null).map(([id, name]) => [String(id), name])).entries()];
    return {
      branches: uniq(rows.map((r) => [r.branch_id ?? "admin", r.branch_name])),
      devices: uniq(rows.map((r) => [r.device_id, r.device_name || `Dispositivo ${r.device_id}`])),
      works: uniq(rows.map((r) => [r.social_work_id, r.social_work_name])),
    };
  }, [rows]);

  const grouped = useMemo(() => {
    const out = [];
    for (const seg of visible) {
      const label = dayLabel(seg.end);
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, items: [] });
      out[out.length - 1].items.push(seg);
    }
    return out;
  }, [visible]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  function openItem(seg, item, nextVerdict = "") {
    setSegmentId(seg.id);
    setItemId(item.id);
    setVerdict(nextVerdict || item.review?.verdict || "");
    setComment(item.review?.comment || "");
    setCorrection(item.review?.suggested_answer || "");
    setAppliesTo(item.review?.applies_to || "BOTH");
  }

  function applyReview(id, review) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, review } : row)));
  }

  async function submit(item, value, extra = {}) {
    await api("/api/admin/validacion", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queryId: item.id, verdict: value, comment: extra.comment || "", suggestedAnswer: extra.correction || "", appliesTo: extra.appliesTo || "BOTH" }),
    });
    applyReview(item.id, { verdict: value, comment: extra.comment || "", suggested_answer: extra.correction || "", applies_to: extra.appliesTo || "BOTH" });
  }

  // «Correcta» se guarda de inmediato; «Parcial» e «Incorrecta» abren el panel para escribir la corrección.
  async function pick(item, value) {
    const seg = allSegments.find((s) => s.items.some((i) => i.id === item.id));
    if (!seg) return;
    if (value !== "CORRECT") { openItem(seg, item, value); return; }
    setBusy(true);
    try {
      await submit(item, "CORRECT");
      setError("");
      if (item.id === itemId) { setVerdict("CORRECT"); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function nextTarget(fromSeg, fromItem) {
    const afterInSeg = fromSeg.items.find((i) => !i.followUp && !i.review && i.id !== fromItem?.id);
    if (afterInSeg) return { seg: fromSeg, item: afterInSeg };
    const list = visible.filter((s) => s.id !== fromSeg.id && s.items.some((i) => !i.followUp && !i.review));
    const withAlerts = list.find((s) => s.alerts > 0) || list[0];
    if (!withAlerts) return null;
    return { seg: withAlerts, item: withAlerts.items.find((i) => !i.followUp && !i.review && i.alerts.length) || withAlerts.items.find((i) => !i.followUp && !i.review) };
  }

  async function save() {
    if (!selected || !selectedItem || !verdict) return;
    setBusy(true);
    try {
      await submit(selectedItem, verdict, { comment, correction, appliesTo });
      setError("");
      setNotice("Revisión guardada.");
      const target = nextTarget(selected, selectedItem);
      if (target?.item) openItem(target.seg, target.item);
      else { setItemId(null); setSegmentId(selected.id); }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function markAllCorrect() {
    if (!selected) return;
    const targets = selected.items.filter((i) => !i.followUp && !i.review && !i.alerts.length);
    if (!targets.length) { setNotice("No quedan respuestas sin alertas para marcar."); return; }
    setBusy(true);
    try {
      for (const item of targets) await submit(item, "CORRECT");
      setError("");
      setNotice(`${targets.length} respuesta${targets.length === 1 ? "" : "s"} marcada${targets.length === 1 ? "" : "s"} como correcta${targets.length === 1 ? "" : "s"}. Las que tienen alerta se revisan una por una.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function jumpToNextAlert() {
    const withAlerts = visible.filter((s) => s.alerts > 0 && s.id !== segmentId);
    const target = withAlerts[0] || visible.find((s) => s.alerts > 0);
    if (!target) { setNotice("No hay conversaciones con alertas."); return; }
    const item = target.items.find((i) => i.alerts.length && !i.review) || target.items[0];
    openItem(target, item);
  }

  // v3.13.89 — abre la imagen que la sucursal adjuntó en el chat (URL temporal).
  async function openImage(imageId) {
    const tab = window.open("", "_blank");
    try {
      const json = await api(`/api/admin/validacion/imagen?id=${encodeURIComponent(imageId)}`);
      if (tab) tab.location.href = json.url; else window.location.href = json.url;
    } catch (err) {
      if (tab) tab.close();
      setError(err.message || "No se pudo abrir la imagen");
    }
  }

  // v3.13.97 — «¿Cómo llegó a esta respuesta?»: pasos que recorrió el bot, en orden.
  const TRACE_TITLES = {
    correcciones_admin: "Correcciones del administrador",
    respuesta_guardada: "Respuesta guardada",
    alcance_normativo: "Normativas consideradas",
    buscador_normativas: "Buscador de normativas",
    correccion_del_otro_circuito: "Corrección del otro circuito",
    ficha: "Ficha de la obra social",
    ficha_como_respaldo: "Ficha usada como respaldo",
    regla_de_operacion: "Regla de operación / circuito",
    protocolo_interno: "Protocolo interno",
    protocolo_ultimo_recurso: "Protocolo interno (último recurso)",
    observaciones_aprobadas: "Observaciones aprobadas",
    requisitos_ficha_y_normativa: "Requisitos: Ficha + normativa",
    respuesta_final: "Respuesta final",
  };
  const traceBox = (item) => {
    const steps = Array.isArray(item.trace) ? item.trace : [];
    if (!steps.length) return null;
    const open = !!expanded[`trace-${item.id}`];
    return (
      <div className="mt-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-1.5">
        <button type="button" className="text-[11px] font-semibold text-[#8f2a85]" onClick={() => setExpanded((p) => ({ ...p, [`trace-${item.id}`]: !p[`trace-${item.id}`] }))}>
          {open ? "Ocultar cómo llegó a esta respuesta" : "¿Cómo llegó a esta respuesta?"}
        </button>
        {open && (
          <ol className="mt-1.5 space-y-1.5 text-[11.5px] leading-4 text-zinc-600">
            {steps.map((st) => (
              <li key={st.n || st.stage}>
                <span className="font-bold text-zinc-800">{st.n ? `${st.n}. ` : ""}{TRACE_TITLES[st.stage] || st.stage}</span>
                {st.stage === "respuesta_final" ? <span> — {st.descripcion || st.ruta}{st.fuente ? ` (fuente: ${st.fuente})` : ""}</span> : null}
                {st.motivo ? <div className="text-zinc-500">Por qué: {st.motivo}</div> : null}
                {st.resultado ? <span> — {st.resultado}</span> : null}
                {st.candidatas_de_este_circuito !== undefined ? <span> · candidatas: {st.candidatas_de_este_circuito} (otro circuito: {st.candidatas_del_otro_circuito})</span> : null}
                {st.normativas_consideradas !== undefined ? <span> · {st.normativas_consideradas} normativa(s){st.ids?.length ? ` (IDs ${st.ids.join(", ")})` : ""}</span> : null}
                {st.pregunta_enviada ? <div className="text-zinc-500">Consulta enviada: «{st.pregunta_enviada}»</div> : null}
                {(st.fuentes_recuperadas || []).map((f, i) => (
                  <div key={i} className="ml-3 text-zinc-500">↳ {f.archivo || "archivo"}{f.normativa_id ? ` (#${f.normativa_id})` : ""}{f.puntaje !== null && f.puntaje !== undefined ? ` · ${f.puntaje}` : ""} — «{f.extracto}»</div>
                ))}
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  };

  const answerBox = (item) => {
    const text = stripMarkdown(String(item.answer || "")).trim() || "Sin respuesta";
    const long = text.length > 420 && !expanded[item.id];
    return (
      <>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-zinc-700">{long ? `${text.slice(0, 420)}…` : text}</p>
        {text.length > 420 && (
          <button type="button" className="mt-1 text-[11px] font-semibold text-[#8f2a85]" onClick={() => setExpanded((p) => ({ ...p, [item.id]: !p[item.id] }))}>
            {expanded[item.id] ? "Ver menos" : "Ver completa"}
          </button>
        )}
      </>
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 pb-24">
      <header>
        <p className="text-xs font-bold uppercase tracking-widest text-[#8f2a85]">Control de calidad · Administración</p>
        <h1 className="mt-1 text-3xl font-black text-[#2e1935]">Validación de respuestas</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">Revisá las respuestas del bot conversación por conversación: misma sucursal y obra social, en orden de horario.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Conversaciones pendientes", stats.pending, "text-[#2e1935]"],
          ["Con alertas", stats.alerts, "text-red-600"],
          ["Respuestas revisadas", stats.reviewed, "text-[#2e1935]"],
          ["Correctas", stats.correctPct == null ? "—" : `${stats.correctPct}%`, "text-emerald-600"],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
            <strong className={`block text-2xl ${cls}`}>{value}</strong>
            <span className="text-xs text-zinc-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm">
        {STATUSES.map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter("status", value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${filters.status === value ? "border-[#8f2a85] bg-[#faf0f9] text-[#8f2a85]" : "border-zinc-200 text-zinc-600"}`}>
            {label}
          </button>
        ))}
        <select aria-label="Período" value={filters.period} onChange={(e) => setFilter("period", e.target.value)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs">
          {PERIODS.map(([value, label]) => <option key={value} value={value}>Período: {label}</option>)}
        </select>
        <select aria-label="Sucursal" value={filters.branchId} onChange={(e) => setFilter("branchId", e.target.value === "admin" ? "" : e.target.value)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs">
          <option value="">Sucursal: todas</option>
          {options.branches.filter(([id]) => id !== "admin").map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Dispositivo" value={filters.deviceId} onChange={(e) => setFilter("deviceId", e.target.value)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs">
          <option value="">Dispositivo: todos</option>
          {options.devices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Obra social" value={filters.socialWorkId} onChange={(e) => setFilter("socialWorkId", e.target.value)} className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs">
          <option value="">Obra social: todas</option>
          {options.works.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input aria-label="Buscar texto" placeholder="Buscar texto…" value={filters.text} onChange={(e) => setFilter("text", e.target.value)} className="min-w-[160px] flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs" />
        <label className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700" title="Dispositivos del equipo (Nico, Mica, Admin) y tráfico de administración">
          <input type="checkbox" checked={hideInternal} onChange={(e) => setHideInternal(e.target.checked)} />
          Ocultar pruebas internas{noise.internal ? ` (${noise.internal})` : ""}
        </label>
        <label className="flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-700" title="Si la misma pregunta se repite desde el mismo dispositivo en 24 h, solo queda la última">
          <input type="checkbox" checked={hideRepeats} onChange={(e) => setHideRepeats(e.target.checked)} />
          Solo la última si se repite{noise.repeats ? ` (${noise.repeats} ocultas)` : ""}
        </label>
        <button type="button" onClick={reload} className="rounded-lg bg-[#8f2a85] px-3 py-1.5 text-xs font-bold text-white">Actualizar</button>
      </div>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && !error && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        {/* LISTA DE CONVERSACIONES */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 text-xs font-extrabold uppercase tracking-wide text-zinc-600">
            <span>Conversaciones</span><span>{visible.length}</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {loading && <p className="p-4 text-sm text-zinc-500">Cargando consultas…</p>}
            {!loading && visible.length === 0 && <p className="p-6 text-center text-sm text-zinc-500">No hay conversaciones para este filtro.</p>}
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="bg-[#faf9fc] px-4 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wider text-zinc-400">{group.label}</div>
                {group.items.map((seg) => {
                  const first = seg.items.find((i) => !i.followUp) || seg.items[0];
                  return (
                    <button key={seg.id} type="button" onClick={() => openItem(seg, seg.items.find((i) => !i.followUp && !i.review) || seg.items[0])}
                      className={`block w-full border-b border-zinc-100 px-4 py-3 text-left hover:bg-zinc-50 ${seg.id === segmentId ? "border-l-4 border-l-[#8f2a85] bg-[#f8eef7]" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[13px] font-extrabold text-[#2e1935]">{seg.branch_name} · {seg.social_work_name}</span>
                        {seg.alerts > 0
                          ? <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">{seg.alerts} alerta{seg.alerts === 1 ? "" : "s"}</span>
                          : <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${seg.pending ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{seg.pending ? "pendiente" : "revisada"}</span>}
                      </div>
                      <div className="mt-0.5 flex justify-between text-[11px] text-zinc-500">
                        <span>{time(seg.start)} → {time(seg.end)}{seg.device_name ? ` · ${seg.device_name}` : ""}</span>
                        <span>{seg.reviewed}/{seg.answerCount} revisadas</span>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-zinc-600">“{first.question}”</p>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>

        {/* HILO DE LA CONVERSACIÓN */}
        <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {!selected ? (
            <div className="p-10 text-center text-sm text-zinc-500">Elegí una conversación de la lista para ver el hilo completo.</div>
          ) : (
            <>
              <div className="border-b border-zinc-100 px-5 py-3">
                <h2 className="text-[15px] font-extrabold text-[#2e1935]">{selected.branch_name} · {selected.social_work_name}</h2>
                <p className="text-xs text-zinc-500">
                  {new Date(selected.start).toLocaleDateString("es-AR")} {time(selected.start)} → {time(selected.end)}
                  {selected.device_name ? ` · ${selected.device_name}` : ""} · {selected.answerCount} respuesta{selected.answerCount === 1 ? "" : "s"} del bot
                  {selected.followUpCount ? ` · ${selected.followUpCount} mensaje${selected.followUpCount === 1 ? "" : "s"} de seguimiento` : ""}
                </p>
              </div>
              <div className="max-h-[70vh] space-y-2 overflow-y-auto bg-[#faf9fc] p-4">
                {selected.items.map((item) => {
                  const active = item.id === itemId;
                  return (
                    <div key={item.id}>
                      <div className="ml-auto w-max max-w-[78%] rounded-2xl rounded-br-sm bg-[#8f2a85] px-3.5 py-2 text-[13px] text-white">
                        {item.question}
                        {(item.images || []).length > 0 && (
                          <span className="mt-1 flex flex-wrap gap-1.5">
                            {item.images.map((img) => (
                              <button key={img.id} type="button" onClick={() => openImage(img.id)} className="rounded-md bg-white/20 px-2 py-0.5 text-[10.5px] font-bold text-white underline">
                                📎 Ver imagen adjunta{item.images.length > 1 ? ` (${img.name})` : ""}
                              </button>
                            ))}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[10px] opacity-70">{time(item.created_at)}{item.followUp ? " · seguimiento" : ""}</span>
                      </div>
                      <div className={`mt-1.5 max-w-[88%] rounded-2xl rounded-bl-sm border px-3.5 py-2.5 ${active ? "border-2 border-[#8f2a85]" : item.alerts.length && !item.review ? "border-red-200 bg-red-50/60" : "border-zinc-200 bg-white"} ${item.followUp ? "bg-zinc-50" : ""}`}>
                        <div className="mb-1 flex flex-wrap gap-1.5">
                          {item.followUp && <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase text-zinc-500">Seguimiento · no hace falta validar</span>}
                          {item.alerts.map((alert) => <span key={alert} className="rounded-md bg-red-100 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase text-red-700">⚠ {alert}</span>)}
                          {item.review && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase text-emerald-700">Revisada</span>}
                        </div>
                        {answerBox(item)}
                        {traceBox(item)}
                        <VerdictButtons item={item} active={active} onPick={pick} muted={item.followUp} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-2 text-[11px] font-semibold text-zinc-400"><span className="h-px flex-1 border-t border-dashed border-zinc-300" />fin del tramo · {time(selected.end)}<span className="h-px flex-1 border-t border-dashed border-zinc-300" /></div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={markAllCorrect} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 disabled:opacity-50">✓ Marcar todo el tramo como correcto</button>
                  <button type="button" onClick={jumpToNextAlert} className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700">Siguiente con alertas →</button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* PANEL DE REVISIÓN */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 lg:col-span-2 xl:col-span-1">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-zinc-600">
            {selectedItem ? `Revisar respuesta ${selected.items.filter((i) => !i.followUp).findIndex((i) => i.id === selectedItem.id) + 1 || ""} de ${selected.answerCount}` : "Revisión"}
          </h3>
          {!selectedItem ? (
            <p className="mt-3 text-sm text-zinc-500">Tocá <strong>Parcial</strong> o <strong>Incorrecta</strong> en una respuesta para escribir la corrección. <strong>Correcta</strong> se guarda al instante.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <p className="text-xs text-zinc-500">{selected.branch_name}{selected.device_name ? ` · ${selected.device_name}` : ""} · {new Date(selectedItem.created_at).toLocaleString("es-AR")}</p>
              <p className="rounded-xl bg-purple-50 p-3 text-[13px] font-semibold text-purple-900">{selectedItem.question}</p>
              {selectedItem.alerts.length > 0 && <p className="text-xs font-bold text-red-700">⚠ {selectedItem.alerts.join(" · ")}</p>}
              <div>
                <p className="mb-1 text-xs font-bold text-zinc-600">Veredicto</p>
                <div className="flex gap-1.5">
                  {VERDICTS.map(([value, label, cls]) => (
                    <button key={value} type="button" onClick={() => setVerdict(value)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold ${verdict === value ? cls : "border-zinc-200 text-zinc-600"}`}>{label}</button>
                  ))}
                </div>
              </div>
              <label className="block text-xs font-bold text-zinc-600">Corrección sugerida
                <textarea value={correction} onChange={(e) => setCorrection(e.target.value)} rows={12} placeholder="Escribí la respuesta correcta tal como debería darla el bot…" className="mt-1 min-h-[16rem] w-full resize-y rounded-xl border border-zinc-200 p-2.5 text-[13px] font-normal" />
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">Si marcás Incorrecta o Parcial y escribís una corrección, el bot la usa: ante esta misma pregunta sobre {selected.social_work_name} responde con este texto, y en preguntas parecidas la toma como fuente prioritaria.</span>
              </label>
              {verdict !== "CORRECT" && correction.trim() && (
                <div>
                  <p className="mb-1 text-xs font-bold text-zinc-600">¿Dónde aplica esta corrección?</p>
                  <div className="flex gap-1.5">
                    {[["BOTH", "Cámara y Colegio"], ["CAMARA", "Solo Cámara"], ["COLEGIO", "Solo Colegio"]].map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setAppliesTo(value)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-bold ${appliesTo === value ? "border-[#8f2a85] bg-purple-50 text-[#8f2a85]" : "border-zinc-200 text-zinc-600"}`}>{label}</button>
                    ))}
                  </div>
                  <span className="mt-1 block text-[11px] font-normal text-zinc-500">Esta consulta se hizo en {selected.branch_name}. Si {selected.social_work_name} trabaja distinto en Cámara y en Colegio, elegí el circuito; si la regla es la misma, dejá «Cámara y Colegio».</span>
                </div>
              )}
              <label className="block text-xs font-bold text-zinc-600">Observaciones
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="mt-1 min-h-[6rem] w-full resize-y rounded-xl border border-zinc-200 p-2.5 text-[13px] font-normal" />
                <span className="mt-1 block text-[11px] font-normal text-zinc-500">Si la respuesta es Correcta, la observación se agrega debajo de la respuesta del bot cuando consulten lo mismo sobre {selected.social_work_name}. La respuesta no se modifica.</span>
              </label>
              <button type="button" disabled={!verdict || busy} onClick={save} className="w-full rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">{busy ? "Guardando…" : "Guardar y pasar a la siguiente"}</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
