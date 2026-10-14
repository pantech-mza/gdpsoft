"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { treeApiFetch } from "../../lib/decision-trees/client";

const KEY_RESULTS = "gdpsoft_tree_bulk_results_v1";
const KEY_DEMO = "gdpsoft_tree_bulk_reserved_v1";
const KEY_DEMO_COUNT = "gdpsoft_tree_bulk_reserve_count_v1";
const LIMITS = [10, 25, 50, "ALL"];
const cssButton = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#e4d5e4] bg-white px-3 py-2 text-xs font-semibold text-[#70236c] transition hover:bg-[#fbf4fb] disabled:cursor-not-allowed disabled:opacity-40";
const cssInput = "w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-[#8f2a85]";

function loadJSON(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function selectDemoDefault(ready, count) {
  const picked = [];
  const usedWorks = new Set();
  for (const item of [...ready].reverse()) {
    if (picked.length >= count) break;
    if (!usedWorks.has(item.social_work_id)) {
      picked.push(item.key);
      usedWorks.add(item.social_work_id);
    }
  }
  for (const item of [...ready].reverse()) {
    if (picked.length >= count) break;
    if (!picked.includes(item.key)) picked.push(item.key);
  }
  return picked;
}
const statusLabels = {
  DEMO: "Reservada para demostración",
  GENERATED: "Generada · pendiente de aprobación",
  GENERATED_REVIEW: "Generada · requiere completar pasos",
  NO_TREE: "Revisar: IA devolvió 0 propuestas",
  REUSED: "Ya existía propuesta",
  ERROR: "Falló · requiere reintento",
  EXISTING: "Ya tiene propuestas/árboles",
  NOT_INDEXED: "No indexada · no procesada",
  READY: "Pendiente de generar",
};
function csvEscape(value) {
  const s = String(value ?? "");
  const safe = /^[=+@-]/.test(s.trimStart()) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export default function BulkTreeGenerator({ onCompleted }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [results, setResults] = useState({});
  const [reserved, setReserved] = useState([]);
  const [reserveCount, setReserveCount] = useState(2);
  const [batchSize, setBatchSize] = useState(25);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [filter, setFilter] = useState("ALL");
  const [tablePage, setTablePage] = useState(1);
  const [notice, setNotice] = useState("");
  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const resultsRef = useRef({});

  function setStoredResults(value) {
    resultsRef.current = value;
    setResults(value);
    saveJSON(KEY_RESULTS, value);
  }

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await treeApiFetch("/api/decision-tree-candidates/bulk-plan", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Error preparando las normativas");
      setItems(payload.items || []);
      const persisted = loadJSON(KEY_RESULTS, {});
      resultsRef.current = persisted;
      setResults(persisted);
      const ready = (payload.items || []).filter(x => x.status === "READY" && !["GENERATED", "GENERATED_REVIEW", "NO_TREE", "REUSED"].includes(persisted[x.key]?.status));
      const oldReserved = loadJSON(KEY_DEMO, []);
      const validStored = Array.isArray(oldReserved) ? oldReserved.filter(key => ready.some(x => x.key === key)).slice(0, 2) : [];
      const storedCount = loadJSON(KEY_DEMO_COUNT, 2);
      const desiredCount = [0, 1, 2].includes(storedCount) ? storedCount : 2;
      const initial = [...validStored.slice(0, desiredCount), ...selectDemoDefault(ready.filter(i => !validStored.includes(i.key)), desiredCount - Math.min(desiredCount, validStored.length))].slice(0, desiredCount);
      setReserved(initial);
      setReserveCount(initial.length);
      saveJSON(KEY_DEMO, initial);
    } catch (e) {
      setLoadError(e.message || "No se pudo cargar el inventario");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadPlan(); }, [loadPlan]);
  useEffect(() => { setTablePage(1); }, [filter]);

  const available = useMemo(() => items.filter(x => x.status === "READY" && !["GENERATED", "GENERATED_REVIEW", "NO_TREE", "REUSED"].includes(results[x.key]?.status)), [items, results]);
  const demoOptions = useMemo(() => available.filter(i => results[i.key]?.status !== "ERROR"), [available, results]);
  const reservedSet = useMemo(() => new Set(reserved), [reserved]);
  const statusOf = (item) => {
    if (["GENERATED", "GENERATED_REVIEW", "NO_TREE", "REUSED"].includes(results[item.key]?.status)) return results[item.key].status;
    if (item.status === "EXISTING") return "EXISTING";
    if (item.status === "NOT_INDEXED") return "NOT_INDEXED";
    if (reservedSet.has(item.key)) return "DEMO";
    return results[item.key]?.status || "READY";
  };
  const pending = useMemo(() => available.filter(i => !reservedSet.has(i.key) && results[i.key]?.status !== "ERROR"), [available, reservedSet, results]);
  const counts = useMemo(() => {
    const out = { DEMO: 0, GENERATED: 0, GENERATED_REVIEW: 0, NO_TREE: 0, REUSED: 0, ERROR: 0, EXISTING: 0, NOT_INDEXED: 0, READY: 0 };
    for (const item of items) out[statusOf(item)]++;
    return out;
  }, [items, results, reserved]);
  const filteredItems = useMemo(() => items.filter(i => filter === "ALL" || statusOf(i) === filter), [items, results, reserved, filter]);
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / 15));
  const currentPage = Math.min(tablePage, totalPages);
  const pageItems = filteredItems.slice((currentPage - 1) * 15, currentPage * 15);

  function updateReserved(next) {
    const clean = [...new Set(next)].filter(key => demoOptions.some(i => i.key === key)).slice(0, reserveCount);
    setReserved(clean);
    saveJSON(KEY_DEMO, clean);
  }
  function changeReserveCount(value) {
    const n = Math.min(Number(value), demoOptions.length);
    const next = [...reserved.slice(0, n), ...selectDemoDefault(demoOptions.filter(i => !reserved.includes(i.key)), n - Math.min(n, reserved.length))].slice(0, n);
    setReserveCount(n);
    saveJSON(KEY_DEMO_COUNT, n);
    setReserved(next);
    saveJSON(KEY_DEMO, next);
  }
  function setReserveSlot(slot, value) {
    const next = [...reserved];
    // Keep exactly n different records. Swapping is more convenient than silently losing a reserved item.
    const duplicateSlot = next.findIndex((key, index) => index !== slot && key === value);
    if (duplicateSlot >= 0) next[duplicateSlot] = next[slot];
    next[slot] = value;
    updateReserved(next);
  }
  async function fetchGenerate(item) {
    let response;
    let payload;
    for (let attempt = 0; attempt < 2; attempt++) {
      response = await treeApiFetch("/api/decision-tree-candidates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ social_work_id: item.social_work_id, normative_id: item.normative_id, regenerate: false }),
      });
      payload = await response.json();
      if (response.ok && payload.ok) return payload;
      // Retry only when rate limited or temporarily unavailable, and never change regenerate.
      if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      const failure = new Error(payload?.error || `Error HTTP ${response.status}`);
      failure.code = payload?.code || "HTTP_ERROR";
      failure.diagnostic = payload?.diagnostic || null;
      failure.httpStatus = response.status;
      throw failure;
    }
    throw new Error("No se pudo generar la propuesta");
  }
  // Se comparte la misma ejecución para lotes nuevos y reintento exclusivo
  // de errores. Ninguna acción borra propuestas existentes o reservas.
  async function runJobs(jobs, retryOnly = false) {
    if (runningRef.current || loading || !jobs.length) return;
    const confirmed = window.confirm(retryOnly
      ? `Vas a reintentar SOLO ${jobs.length} normativa(s) que fallaron. Las propuestas ya generadas y las ${reserved.length} reservas de demo no se modifican. Esto consume créditos de OpenAI. ¿Continuar?`
      : `Vas a analizar ${jobs.length} normativa(s) con OpenAI, una a la vez. Esto consume créditos de API y puede demorar. Se reservarán ${reserved.length} sin generar para la demostración. NINGÚN árbol se aprobará ni publicará automáticamente. ¿Continuar?`
    );
    if (!confirmed) return;

    stopRef.current = false;
    runningRef.current = true;
    setWorking(true);
    setNotice("");
    setProgress({ current: 0, total: jobs.length, label: "Preparando generación..." });
    let finished = 0;
    try {
      for (const item of jobs) {
        if (stopRef.current) break;
        setProgress({ current: finished, total: jobs.length, label: `${item.social_work_name} · ${item.normative_title}` });
        const startedAt = new Date().toISOString();
        try {
          const result = await fetchGenerate(item);
          const status = result.reused ? "REUSED" : Number(result.count || 0) > 0
            ? (result.generated_with_observations ? "GENERATED_REVIEW" : "GENERATED") : "NO_TREE";
          setStoredResults({ ...resultsRef.current, [item.key]: {
            status, count: result.count || 0, completed_at: new Date().toISOString(), started_at: startedAt,
            warnings: result.warnings || [], pending_review_count: result.pending_review_count || 0,
            skipped_count: result.skipped_count || 0,
            input_tokens: result.usage?.input_tokens ?? null, output_tokens: result.usage?.output_tokens ?? null,
          } });
        } catch (e) {
          setStoredResults({ ...resultsRef.current, [item.key]: {
            status: "ERROR", error: e.message, error_code: e.code || "UNKNOWN", diagnostic: e.diagnostic || null,
            http_status: e.httpStatus ?? null, completed_at: new Date().toISOString(), started_at: startedAt,
          } });
        }
        finished++;
        setProgress({ current: finished, total: jobs.length, label: `${item.social_work_name} · ${item.normative_title}` });
      }
      setNotice(stopRef.current
        ? `Proceso detenido tras ${finished} de ${jobs.length}. Podés continuar.`
        : `${retryOnly ? "Reintento" : "Lote"} finalizado: ${finished} normativas procesadas. Las propuestas nuevas requieren aprobación.`
      );
    } finally {
      runningRef.current = false;
      setWorking(false);
      // Servidor es fuente de verdad: conserva cada propuesta insertada.
      await loadPlan();
      if (typeof onCompleted === "function") onCompleted();
    }
  }

  async function begin() {
    if (runningRef.current || loading) return;
    if (reserveCount > 0 && reserved.length !== reserveCount) {
      setNotice("Seleccioná todas las normativas de demostración antes de iniciar.");
      return;
    }
    const jobs = pending.slice(0, batchSize === "ALL" ? pending.length : Number(batchSize));
    if (!jobs.length) {
      setNotice("No hay normativas elegibles pendientes en este lote. Revisá las no indexadas o las fallidas.");
      return;
    }
    await runJobs(jobs, false);
  }

  function eligibleFailures() {
    return items.filter(i =>
      i.status === "READY" &&
      resultsRef.current[i.key]?.status === "ERROR" &&
      !reservedSet.has(i.key)
    );
  }

  async function retryFailures(oneOnly = false) {
    if (runningRef.current || loading) return;
    const failed = eligibleFailures();
    if (!failed.length) {
      setNotice("No quedan registros fallidos elegibles para reintentar.");
      return;
    }
    await runJobs(oneOnly ? failed.slice(0, 1) : failed, true);
  }

  // Las versiones anteriores guardaron "NO_TREE" en localStorage aunque la
  // búsqueda sí tuviera reglas. Permitir su reevaluación sin borrar la historia.
  async function retryEmpty(oneOnly = false) {
    if (runningRef.current || loading) return;
    const empty = items.filter(i =>
      i.status === "READY" &&
      resultsRef.current[i.key]?.status === "NO_TREE" &&
      !reservedSet.has(i.key)
    );
    if (!empty.length) return;
    await runJobs(oneOnly ? empty.slice(0, 1) : empty, true);
  }

  function exportCSV() {
    const header = ["Obra social", "ID obra social", "Normativa", "ID normativa", "Estado", "Propuestas", "Fecha", "Código error", "Etapa", "HTTP", "OpenAI response ID", "Error", "Fragmentos recuperados", "Caracteres evidencia", "Resumen IA", "Pendientes de revisión", "Omitidas", "Observaciones"];
    const rows = items.map(i => [
      i.social_work_name, i.social_work_id, i.normative_title, i.normative_id,
      statusLabels[statusOf(i)], results[i.key]?.count || 0, results[i.key]?.completed_at || "",
      results[i.key]?.error_code || "", results[i.key]?.diagnostic?.stage || "",
      results[i.key]?.http_status || "", results[i.key]?.diagnostic?.response_id || "",
      results[i.key]?.error || "",
      results[i.key]?.diagnostic?.extracted_fragments ?? "",
      results[i.key]?.diagnostic?.extracted_characters ?? "",
      results[i.key]?.diagnostic?.normative_summary ?? "",
      results[i.key]?.pending_review_count ?? 0,
      results[i.key]?.skipped_count ?? 0,
      (results[i.key]?.warnings || []).join(" | "),
    ]);
    const csv = "\uFEFF" + [header, ...rows].map(row => row.map(csvEscape).join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "GDPSoft_Arboles_Generacion_Masiva_Estado.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mb-6 overflow-hidden rounded-[17px] border border-[#ecd9ec] bg-white shadow-sm">
      <div className="border-b border-[#ecd9ec] bg-gradient-to-r from-[#fbf3fb] to-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Icon icon="fluent:sparkle-24-filled" width="22" className="text-[#8f2a85]" />
              <h2 className="text-base font-bold text-[#21142b]">Generación masiva con IA · diagnóstico v1.4</h2>
            </div>
            <p className="mt-1 max-w-[760px] text-xs leading-5 text-zinc-500">
              Genera propuestas desde normativas vigentes indexadas. Una consulta por combinación de obra social y normativa; sin regenerar propuestas ya registradas.
              Los árboles quedan <strong>pendientes de revisión</strong>: no se aprueban ni publican en lote.
            </p>
          </div>
          <button className={cssButton} type="button" onClick={exportCSV} disabled={loading || !items.length}>
            <Icon icon="fluent:arrow-download-20-regular" width="16" /> Exportar informe CSV
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {loading && <p className="text-sm text-zinc-500">Consultando normativas y árboles existentes…</p>}
        {loadError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{loadError}</p>}
        {!loading && !loadError && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {[
                ["Elegibles pendientes", counts.READY, "text-[#8f2a85]"],
                ["Reservadas demo", counts.DEMO, "text-[#8f2a85]"],
                ["Generadas ahora", counts.GENERATED, "text-emerald-700"],
                ["Con historial", counts.EXISTING + counts.REUSED, "text-zinc-800"],
                ["Sin indexar", counts.NOT_INDEXED, "text-amber-700"],
                ["Errores", counts.ERROR, "text-red-700"],
              ].map(([label, value, color]) => (
                <div key={label} className="rounded-xl border border-zinc-200 bg-[#fdfbfd] p-3">
                  <p className="text-[11px] text-zinc-500">{label}</p>
                  <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {counts.GENERATED_REVIEW > 0 && (
              <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                {counts.GENERATED_REVIEW} normativa(s) generadas con pasos pendientes de revisión. Son propuestas guardadas en Supabase, pero los tramos marcados PENDIENTE DE REVISIÓN se deben completar antes de aprobar.
              </p>
            )}

            <div className="rounded-xl border border-[#e9d6e7] bg-[#fdf9fd] p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900">Dejar normativas sin generar para la demostración</h3>
                  <p className="mt-1 text-xs text-zinc-500">Quedarán identificadas como “Reservada para demostración”. Podés elegir cuáles son antes de comenzar.</p>
                </div>
                <label className="text-xs font-semibold text-zinc-700">
                  Cantidad
                  <select className={`${cssInput} mt-1 w-[100px]`} disabled={working} value={reserveCount} onChange={e => changeReserveCount(e.target.value)}>
                    {[0, 1, 2].map(n => <option key={n} value={n} disabled={n > demoOptions.length}>{n}</option>)}
                  </select>
                </label>
              </div>
              {reserveCount > 0 && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {Array.from({ length: reserveCount }, (_, n) => (
                    <label key={n} className="text-xs font-semibold text-zinc-700">
                      Normativa para mostrar #{n + 1}
                      <select className={`${cssInput} mt-1`} value={reserved[n] || ""} disabled={working} onChange={e => setReserveSlot(n, e.target.value)}>
                        <option value="">Seleccionar normativa…</option>
                        {demoOptions.map(item => <option key={item.key} value={item.key}>{item.social_work_name} · {item.normative_title} (#{item.normative_id})</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              {reserved.length > 0 && <p className="mt-3 text-xs font-medium text-[#8f2a85]">Sin generar: {reserved.map(key => { const i = items.find(i => i.key === key); return i ? `${i.social_work_name} / ${i.normative_title}` : key; }).join(" · ")}</p>}
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-zinc-700">
                Cantidad por lote
                <select className={`${cssInput} mt-1 w-[175px]`} value={batchSize} disabled={working} onChange={e => setBatchSize(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}>
                  {LIMITS.map(v => <option key={v} value={v}>{v === "ALL" ? "Todas las pendientes" : `${v} normativas`}</option>)}
                </select>
              </label>
              <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8f2a85] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#74216c] disabled:opacity-40" type="button" disabled={working || pending.length === 0 || loadError} onClick={begin}>
                <Icon icon="fluent:play-20-filled" width="17" /> Generar lote ({Math.min(pending.length, batchSize === "ALL" ? pending.length : Number(batchSize))})
              </button>
              {working && <button className={cssButton} type="button" onClick={() => { stopRef.current = true; setNotice("Se detendrá al finalizar la normativa actual."); }}>Detener después de la actual</button>}
              {!working && counts.NO_TREE > 0 && <>
                <button className={cssButton} type="button" onClick={() => retryEmpty(true)}>Reanalizar 1 sin propuestas</button>
                <button className={cssButton} type="button" onClick={() => retryEmpty(false)}>Reanalizar sin propuestas ({counts.NO_TREE})</button>
              </>}
              {!working && counts.ERROR > 0 && <>
                <button className={cssButton} type="button" onClick={() => retryFailures(true)}>Probar 1 fallida</button>
                <button className={cssButton} type="button" onClick={() => retryFailures(false)}>Reintentar SOLO fallidas ({counts.ERROR})</button>
              </>}
              <button className={cssButton} type="button" disabled={working} onClick={loadPlan}>Actualizar inventario</button>
            </div>

            {working && (
              <div role="status" className="rounded-xl border border-[#ecd9ec] bg-[#fcf7fc] p-3">
                <div className="flex justify-between gap-2 text-xs font-semibold text-zinc-700"><span>{progress.current} / {progress.total} analizadas en este lote</span><span>{Math.round(100 * progress.current / Math.max(1, progress.total))}%</span></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#ead9e9]"><div className="h-full rounded-full bg-[#8f2a85] transition-all" style={{ width: `${Math.round(100 * progress.current / Math.max(1, progress.total))}%` }} /></div>
                <p className="mt-2 break-words text-xs text-zinc-500">Procesando: {progress.label}</p>
              </div>
            )}
            {notice && <p role="status" className="rounded-xl border border-[#eadbea] bg-[#fcf7fc] p-3 text-sm text-[#74216c]">{notice}</p>}
            <p className="text-xs leading-5 text-zinc-500">El proceso corre secuencialmente en esta pestaña: dejala abierta. Cada normativa consume créditos OpenAI. El historial de este panel y las reservas se conservan en este navegador; las propuestas generadas se guardan en Supabase. Descargá el CSV para compartir qué quedó pendiente.</p>

            <div className="overflow-hidden rounded-xl border border-zinc-200">
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fdf9fd] px-3 py-3">
                <h3 className="text-sm font-bold text-[#21142b]">Inventario de generación <span className="text-zinc-400">({filteredItems.length})</span></h3>
                <select className={`${cssInput} w-full sm:w-[270px]`} value={filter} onChange={e => setFilter(e.target.value)}>
                  <option value="ALL">Todos los estados</option>
                  {Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
                </select>
              </div>
              <div className="space-y-2 p-3 md:hidden">
                {pageItems.length === 0 && <p className="p-3 text-center text-xs text-zinc-500">No hay registros en este estado.</p>}
                {pageItems.map(item => {
                  const status = statusOf(item);
                  return (
                    <article key={item.key} className="rounded-xl border border-zinc-200 bg-white p-3">
                      <p className="text-xs font-bold text-[#21142b]">{item.social_work_name}</p>
                      <p className="mt-1 break-words text-sm text-zinc-700">{item.normative_title} <span className="text-zinc-400">#{item.normative_id}</span></p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === "DEMO" ? "bg-purple-100 text-[#8f2a85]" : status === "ERROR" ? "bg-red-50 text-red-700" : status === "NOT_INDEXED" || status === "GENERATED_REVIEW" ? "bg-amber-50 text-amber-700" : status === "GENERATED" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{statusLabels[status]}</span>
                        <span className="text-xs text-zinc-500">{results[item.key]?.count ?? item.existing_count ?? 0} propuestas</span>
                      </div>
                      {status === "GENERATED_REVIEW" && <p className="mt-2 break-words text-xs text-amber-800">{(results[item.key]?.warnings || []).slice(0, 2).join(" | ") || "Revisar los pasos pendientes antes de aprobar."}</p>}
                      {status === "ERROR" && <p className="mt-2 break-words text-xs text-red-700">{results[item.key]?.error_code && <strong>{results[item.key].error_code}: </strong>}{results[item.key]?.error}</p>}
                    </article>
                  );
                })}
              </div>
              <div className="hidden max-w-full overflow-x-auto md:block">
                <table className="w-full min-w-[660px] text-left text-xs">
                  <thead><tr className="border-y border-zinc-200 bg-zinc-50 text-zinc-600"><th className="p-3">Obra social</th><th className="p-3">Normativa</th><th className="p-3">Estado</th><th className="p-3">Propuestas</th></tr></thead>
                  <tbody>{pageItems.map(item => {
                    const status = statusOf(item);
                    return <tr key={item.key} className="border-b border-zinc-100 last:border-0 hover:bg-[#fdf9fd]"><td className="p-3 font-semibold text-zinc-800">{item.social_work_name}</td><td className="max-w-[380px] break-words p-3 text-zinc-700">{item.normative_title} <span className="text-zinc-400">#{item.normative_id}</span></td><td className="p-3"><span className={`inline-block rounded-full px-2.5 py-1 font-semibold ${status === "DEMO" ? "bg-purple-100 text-[#8f2a85]" : status === "ERROR" ? "bg-red-50 text-red-700" : status === "NOT_INDEXED" || status === "GENERATED_REVIEW" ? "bg-amber-50 text-amber-700" : status === "GENERATED" ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{statusLabels[status]}</span>{status === "GENERATED_REVIEW" && <p className="mt-1 max-w-[330px] break-words text-amber-700">{(results[item.key]?.warnings || []).slice(0, 2).join(" | ") || "Revisar los pasos pendientes antes de aprobar."}</p>}{status === "ERROR" && <p className="mt-1 max-w-[280px] break-words text-red-600">{results[item.key]?.error_code && <strong>{results[item.key].error_code}: </strong>}{results[item.key]?.error}</p>}{status === "ERROR" && results[item.key]?.diagnostic?.normative_summary && <p className="mt-1 max-w-[320px] break-words text-zinc-500">Resumen IA: {results[item.key].diagnostic.normative_summary}</p>}</td><td className="p-3">{results[item.key]?.count ?? item.existing_count ?? 0}</td></tr>;
                  })}
                  {pageItems.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-zinc-500">No hay registros en este estado.</td></tr>}</tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 bg-[#fdf9fd] p-3 text-xs text-zinc-500"><span>Página {currentPage} de {totalPages}</span><div className="flex gap-2"><button className={cssButton} disabled={currentPage <= 1} onClick={() => setTablePage(v => Math.max(1, v - 1))}>Anterior</button><button className={cssButton} disabled={currentPage >= totalPages} onClick={() => setTablePage(v => Math.min(totalPages, v + 1))}>Siguiente</button></div></div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
