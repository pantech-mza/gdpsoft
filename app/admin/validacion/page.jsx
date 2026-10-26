"use client";

import { stripMarkdown } from "../../../lib/assistant/plain-text.mjs";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";
import { refreshStoredSession } from "../../../lib/client/session";

const PAGE_SIZE = 20;

const VERDICTS = {
  CORRECT: { label: "Correcta", icon: "fluent:checkmark-circle-24-filled", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  INCORRECT: { label: "Incorrecta", icon: "fluent:dismiss-circle-24-filled", cls: "bg-red-50 text-red-700 border-red-200" },
  PARTIAL: { label: "Parcial", icon: "fluent:warning-24-filled", cls: "bg-amber-50 text-amber-700 border-amber-200" },
};

function answerText(actual) {
  return String(actual?.answer || actual?.direct_answer || actual?.response || "").trim();
}


function formatMs(value) {
  const ms = Number(value || 0);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `${(ms / 1000).toFixed(1)} s`;
}

const QA_STATUS = {
  PASS: { label: "Aprobada", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  WARNING: { label: "Atención", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  FAIL: { label: "Fallada", cls: "bg-red-50 text-red-700 border-red-200" },
  ERROR: { label: "Error", cls: "bg-red-100 text-red-800 border-red-300" },
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function SuperAdminValidationPage() {
  const router = useRouter();
  const requestSeq = useRef(0);

  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState("");
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);

  const [page, setPage] = useState(1);
  const [runId, setRunId] = useState("");
  const [socialWorkId, setSocialWorkId] = useState("");
  const [verdict, setVerdict] = useState("PENDING");
  const [qaStatus, setQaStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const [reviewVerdict, setReviewVerdict] = useState("");
  const [suggestedAnswer, setSuggestedAnswer] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    try {
      const rawUser = sessionStorage.getItem("gdpsoft_user");
      const rawModules = sessionStorage.getItem("gdpsoft_modules");
      const storedToken = sessionStorage.getItem("gdpsoft_access_token") || "";

      if (!rawUser) {
        router.replace("/");
        return;
      }

      const parsedUser = JSON.parse(rawUser);
      const modules = rawModules ? JSON.parse(rawModules) : [];
      const allowed =
        parsedUser?.is_super_admin === true ||
        modules.some((item) => item?.code === "CLIENT_REVIEW");

      if (!allowed) {
        router.replace("/");
        return;
      }

      setUser(parsedUser);

      (async () => {
        try {
          const freshToken = await refreshStoredSession();
          setToken(freshToken);
          setReady(true);
        } catch {
          if (storedToken) {
            setToken(storedToken);
            setReady(true);
          } else {
            router.replace("/");
          }
        }
      })();
    } catch {
      router.replace("/");
    }
  }, [router]);

  const load = useCallback(async () => {
    if (!ready || !user?.id || !token) return;

    const seq = ++requestSeq.current;
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        profileId: user.id,
        page: String(page),
        pageSize: String(PAGE_SIZE),
        verdict,
        qaStatus,
      });

      if (runId) params.set("runId", runId);
      if (socialWorkId) params.set("socialWorkId", socialWorkId);
      if (search) params.set("q", search);

      let currentToken = token;
      let response = await fetch(`/api/review/questions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
        cache: "no-store",
      });

      let payload = await response.json();

      if (response.status === 401) {
        currentToken = await refreshStoredSession();
        setToken(currentToken);

        response = await fetch(`/api/review/questions?${params.toString()}`, {
          headers: { Authorization: `Bearer ${currentToken}` },
          cache: "no-store",
        });
        payload = await response.json();
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || "No se pudo cargar la validación");
      }

      // Evita que una respuesta vieja pise un filtro más reciente.
      if (seq !== requestSeq.current) return;

      setData(payload);

      if (!runId && payload.activeRun?.id) {
        setRunId(payload.activeRun.id);
      }

      if (selected) {
        const current = (payload.rows || []).find((item) => item.id === selected.id);
        if (current) openRow(current);
      }
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err?.message || "No se pudo cargar la validación");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [ready, user?.id, token, page, runId, socialWorkId, verdict, qaStatus, search]);
  useEffect(() => {
    load();
  }, [load]);

  function openRow(row) {
    setSelected(row);
    setReviewVerdict(row?.review?.verdict || "");
    setSuggestedAnswer(row?.review?.suggested_answer || "");
    setComment(row?.review?.comment || "");
  }

  async function saveReview() {
    if (!selected || !reviewVerdict) return;

    setSaving(true);
    setError("");

    try {
      const body = JSON.stringify({
        profileId: user.id,
        qaResultId: selected.id,
        verdict: reviewVerdict,
        suggestedAnswer,
        comment,
      });

      let currentToken = token;
      let response = await fetch("/api/review/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body,
      });

      let payload = await response.json();

      if (response.status === 401) {
        currentToken = await refreshStoredSession();
        setToken(currentToken);

        response = await fetch("/api/review/reviews", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
          },
          body,
        });
        payload = await response.json();
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload?.error || "No se pudo guardar la validación");
      }

      setSelected(null);
      setReviewVerdict("");
      setSuggestedAnswer("");
      setComment("");
      await load();
    } catch (err) {
      setError(err?.message || "No se pudo guardar la validación");
    } finally {
      setSaving(false);
    }
  }


  function applySearch() {
    setSearch(searchDraft.trim());
    setPage(1);
  }

  function clearFilters() {
    setSocialWorkId("");
    setVerdict("PENDING");
    setQaStatus("ALL");
    setSearchDraft("");
    setSearch("");
    setPage(1);
  }

  const selectedSocialWorkName = useMemo(() => {
    if (!socialWorkId) return "";
    return (data?.socialWorks || []).find((sw) => String(sw.id) === String(socialWorkId))?.name || "";
  }, [data?.socialWorks, socialWorkId]);

  const activeFilters = useMemo(() => {
    const items = [];
    if (selectedSocialWorkName) items.push({ key: "social", label: selectedSocialWorkName });
    if (verdict !== "ALL") {
      const labels = { PENDING: "Pendientes", CORRECT: "Correctas", INCORRECT: "Incorrectas", PARTIAL: "Parciales" };
      items.push({ key: "verdict", label: labels[verdict] || verdict });
    }
    if (qaStatus !== "ALL") {
      const labels = { PASS: "QA aprobadas", WARNING: "QA atención", FAIL: "QA falladas", ERROR: "QA error" };
      items.push({ key: "qa", label: labels[qaStatus] || qaStatus });
    }
    if (search) items.push({ key: "search", label: `“${search}”` });
    return items;
  }, [selectedSocialWorkName, verdict, qaStatus, search]);


  const summary = data?.summary || {};
  const pagination = data?.pagination || {};

  const precision = useMemo(() => {
    const reviewed = Number(summary.reviewed || 0);
    const correct = Number(summary.correct || 0);
    return reviewed ? Math.round((correct / reviewed) * 100) : 0;
  }, [summary]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center">Cargando GDP Soft...</div>;
  }

  return (
    <main className="pb-28">
      <div className="w-full">
        <div className="mb-6 rounded-2xl border border-[#8f2a85]/15 bg-[#8f2a85]/[0.045] p-4 text-sm text-[#4b2c58]">
          <strong>Modo validación.</strong> Revisá la respuesta de GDPSoft según la normativa y operatoria real. Se muestra el resultado del QA automático como referencia, pero la validación humana queda registrada por separado.
        </div>

        <section className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#2d1b37]">QA automático</h2>
            <span className="text-xs text-black/40">Referencia técnica de la corrida seleccionada</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Total QA" value={summary.total || 0} />
            <Stat label="Aprobadas QA" value={summary.qa?.pass || 0} good />
            <Stat label="Atención QA" value={summary.qa?.warning || 0} warning />
            <Stat label="Falladas QA" value={(summary.qa?.fail || 0) + (summary.qa?.error || 0)} bad />
            <Stat label="Tiempo promedio" value={formatMs(summary.qa?.avg_ms)} />
          </div>
        </section>

        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#2d1b37]">Validación humana</h2>
            <span className="text-xs text-black/40">Revisión del Departamento de Obras Sociales</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat label="Revisadas" value={summary.reviewed || 0} />
            <Stat label="Pendientes" value={summary.pending || 0} accent />
            <Stat label="Correctas" value={summary.correct || 0} good />
            <Stat label="Parciales" value={summary.partial || 0} warning />
            <Stat label="Incorrectas" value={summary.incorrect || 0} bad />
            <Stat label="Precisión validada" value={`${precision}%`} />
          </div>
        </section>

        <section className="mb-5 rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[#2d1b37]">Filtros de revisión</h2>
              <p className="mt-1 text-xs text-black/40">Los selectores se aplican automáticamente. Usá Buscar o Enter para el texto.</p>
            </div>
            <div className="rounded-full bg-[#f5eff8] px-3 py-1.5 text-xs font-semibold text-[#7b2b82]">
              {Number(pagination.total || 0).toLocaleString("es-AR")} resultados
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/35">Corrida QA</span>
              <select value={runId} onChange={(e) => { setRunId(e.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]/50">
                {(data?.runs || []).map((run) => (
                  <option key={run.id} value={run.id}>{run.name} · {formatDate(run.started_at)}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/35">Obra social</span>
              <select value={socialWorkId} onChange={(e) => { setSocialWorkId(e.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]/50">
                <option value="">Todas las OOSS</option>
                {(data?.socialWorks || []).map((sw) => <option key={sw.id} value={sw.id}>{sw.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/35">Validación humana</span>
              <select value={verdict} onChange={(e) => { setVerdict(e.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]/50">
                <option value="PENDING">Pendientes</option>
                <option value="CORRECT">Correctas</option>
                <option value="INCORRECT">Incorrectas</option>
                <option value="PARTIAL">Parciales</option>
                <option value="ALL">Todas</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/35">Resultado QA</span>
              <select value={qaStatus} onChange={(e) => { setQaStatus(e.target.value); setPage(1); }} className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]/50">
                <option value="ALL">Todos los estados</option>
                <option value="PASS">Aprobadas</option>
                <option value="WARNING">Atención</option>
                <option value="FAIL">Falladas</option>
                <option value="ERROR">Error</option>
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-black/35">Buscar en preguntas</span>
              <div className="relative">
                <Icon icon="fluent:search-24-regular" width="18" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/30" />
                <input value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applySearch(); }} placeholder="Ej.: sello médico, vigencia, autorización..." className="h-11 w-full rounded-xl border border-black/10 pl-10 pr-3 text-sm outline-none focus:border-[#8f2a85]/60" />
              </div>
            </label>

            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={applySearch} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#8f2a85] px-5 text-sm font-semibold text-white transition hover:bg-[#7d2474]">
                <Icon icon="fluent:search-24-filled" width="18" /> Buscar
              </button>
              <button type="button" onClick={clearFilters} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-black/55 transition hover:bg-black/[0.025]">
                <Icon icon="fluent:arrow-reset-24-regular" width="18" /> Limpiar
              </button>
            </div>
          </div>

          {activeFilters.length ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/5 pt-4">
              <span className="mr-1 text-xs font-semibold text-black/35">Filtros activos:</span>
              {activeFilters.map((item) => (
                <span key={item.key} className="inline-flex items-center gap-1.5 rounded-full border border-[#8f2a85]/15 bg-[#8f2a85]/5 px-3 py-1.5 text-xs font-semibold text-[#7b2b82]">
                  {item.label}
                  <button
                    type="button"
                    aria-label={`Quitar ${item.label}`}
                    onClick={() => {
                      if (item.key === "social") setSocialWorkId("");
                      if (item.key === "verdict") setVerdict("ALL");
                      if (item.key === "qa") setQaStatus("ALL");
                      if (item.key === "search") { setSearch(""); setSearchDraft(""); }
                      setPage(1);
                    }}
                    className="rounded-full p-0.5 hover:bg-[#8f2a85]/10"
                  >
                    <Icon icon="fluent:dismiss-12-filled" width="12" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#2d1b37]">Respuestas a revisar</h2>
                <p className="text-xs text-black/40">{data?.activeRun?.name || "Sin corrida seleccionada"}</p>
              </div>
              <span className="rounded-full bg-[#f5eff8] px-3 py-1 text-xs font-semibold text-[#7b2b82]">{pagination.total || 0} casos</span>
            </div>
          </div>

          {loading ? (
            <div className="p-10 text-center text-sm text-black/45">Cargando respuestas...</div>
          ) : !(data?.rows || []).length ? (
            <div className="p-12 text-center">
              <Icon icon="fluent:checkmark-circle-48-regular" width="44" className="mx-auto mb-3 text-[#8f2a85]/45" />
              <p className="font-semibold text-[#35213d]">No hay respuestas en este filtro.</p>
              <p className="mt-1 text-sm text-black/40">Probá otro estado u obra social.</p>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {(data.rows || []).map((row) => (
                <button key={row.id} onClick={() => openRow(row)} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#faf8fb] lg:grid-cols-[180px_1fr_150px_110px_110px_120px] lg:items-center">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/35">Obra social</p>
                    <p className="mt-1 text-sm font-bold text-[#35213d]">{row.social_works?.name || `OOSS ${row.social_work_id}`}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/35">Pregunta</p>
                    <p className="mt-1 line-clamp-2 text-sm font-medium text-black/75">{row.question}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/35">Fuente</p>
                    <p className="mt-1 truncate text-xs text-black/60">{row.normatives?.title || row.source || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/35">QA</p>
                    <div className="mt-1"><QaStatusPill value={row.status} /></div>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/35">Tiempo</p>
                    <p className="mt-1 text-sm font-semibold text-black/65">{formatMs(row.elapsed_ms)}</p>
                  </div>
                  <div className="flex justify-end">
                    {row.review ? <VerdictPill value={row.review.verdict} /> : <span className="rounded-full border border-[#8f2a85]/20 bg-[#8f2a85]/5 px-3 py-1 text-xs font-semibold text-[#8f2a85]">Pendiente</span>}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-black/5 px-5 py-4">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-30">Anterior</button>
            <span className="text-xs text-black/45">Página {pagination.page || 1} de {Math.max(1, pagination.pages || 1)}</span>
            <button disabled={page >= (pagination.pages || 1)} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-30">Siguiente</button>
          </div>
        </section>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[500] flex items-end justify-end bg-black/35 p-0 backdrop-blur-[1px] md:items-center md:justify-start md:py-5 md:pl-[270px] md:pr-[455px]">
          <button aria-label="Cerrar" className="absolute inset-0" onClick={() => setSelected(null)} />
          <aside className="relative z-10 flex h-[94vh] w-full max-w-[720px] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl md:h-[calc(100vh-40px)] md:min-w-0 md:rounded-3xl">
            <div className="flex items-start gap-4 border-b border-black/5 px-6 py-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8f2a85]/10 text-[#8f2a85]"><Icon icon="fluent:clipboard-checkmark-24-filled" width="24" /></div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#8f2a85]">{selected.social_works?.name}</p>
                <h3 className="mt-1 text-lg font-bold text-[#2d1b37]">Validar respuesta</h3>
                <p className="mt-1 text-xs text-black/40">Podés abrir el asistente y comparar la respuesta sin cerrar esta ventana.</p>
              </div>
              <button onClick={() => setSelected(null)} className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-black/5"><Icon icon="fluent:dismiss-24-regular" width="22" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <Block label="Pregunta"><p className="text-[15px] font-semibold leading-6 text-[#2e1f35]">{selected.question}</p></Block>
              <Block label="Respuesta de GDPSoft"><p className="whitespace-pre-wrap text-[15px] leading-7 text-black/75">{stripMarkdown(answerText(selected.actual)) || "Sin respuesta registrada."}</p></Block>
              <Block label="Fuente"><p className="text-sm text-black/65">{selected.normatives?.title || selected.normatives?.original_filename || selected.source || "Sin fuente identificada"}</p></Block>
              <Block label="Resultado QA automático">
                <div className="flex flex-wrap items-center gap-3">
                  <QaStatusPill value={selected.status} />
                  <span className="text-sm font-semibold text-black/65">Tiempo: {formatMs(selected.elapsed_ms)}</span>
                </div>
                {selected.failure_reason ? <p className="mt-3 text-sm leading-6 text-black/60">{selected.failure_reason}</p> : null}
              </Block>

              <div className="mb-6">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-black/40">Tu validación</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(VERDICTS).map(([key, meta]) => (
                    <button key={key} onClick={() => setReviewVerdict(key)} className={["rounded-xl border px-3 py-3 text-sm font-semibold transition", reviewVerdict === key ? meta.cls : "border-black/10 bg-white text-black/55 hover:bg-black/[0.025]"].join(" ")}>
                      <Icon icon={meta.icon} width="20" className="mx-auto mb-1" />{meta.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mb-5 block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-black/40">Corrección sugerida</span>
                <textarea rows={4} value={suggestedAnswer} onChange={(e) => setSuggestedAnswer(e.target.value)} placeholder="Si está incorrecta o parcial, escribí cómo debería responder..." className="w-full resize-y rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-[#8f2a85]/55" />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-black/40">Comentario</span>
                <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Observaciones para el equipo de GDPSoft..." className="w-full resize-y rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-[#8f2a85]/55" />
              </label>
            </div>

            <div className="border-t border-black/5 bg-white px-6 py-4">
              <button disabled={!reviewVerdict || saving} onClick={saveReview} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#8f2a85] text-sm font-bold text-white disabled:opacity-40">
                <Icon icon={saving ? "fluent:spinner-ios-20-regular" : "fluent:save-24-filled"} width="20" />
                {saving ? "Guardando..." : "Guardar validación"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </main>
  );
}

function Stat({ label, value, accent, good, bad, warning }) {
  const cls = accent ? "border-[#8f2a85]/20 bg-[#8f2a85]/5" : good ? "border-emerald-100 bg-emerald-50/50" : warning ? "border-amber-100 bg-amber-50/60" : bad ? "border-red-100 bg-red-50/50" : "border-black/5 bg-white";
  return <div className={`rounded-2xl border p-4 shadow-sm ${cls}`}><p className="text-xs font-semibold text-black/40">{label}</p><strong className="mt-2 block text-2xl text-[#2d1b37]">{Number.isFinite(Number(value)) && typeof value !== "string" ? Number(value).toLocaleString("es-AR") : value}</strong></div>;
}


function QaStatusPill({ value }) {
  const meta = QA_STATUS[value] || { label: value || "—", cls: "border-black/10 bg-black/5 text-black/60" };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>;
}

function VerdictPill({ value }) {
  const meta = VERDICTS[value] || { label: value, cls: "border-black/10 bg-black/5 text-black/60" };
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>;
}

function Block({ label, children }) {
  return <div className="mb-6 rounded-2xl border border-black/5 bg-[#faf9fb] p-4"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-black/35">{label}</p>{children}</div>;
}


import AdminBranchValidation from "../../../components/admin/AdminBranchValidation";
export default function ValidationByRole() {
 const [superAdmin,setSuperAdmin]=useState(null);
 useEffect(()=>{try{const raw=sessionStorage.getItem("gdpsoft_user");setSuperAdmin(JSON.parse(raw||"null")?.is_super_admin===true)}catch{setSuperAdmin(false)}},[]);
 if(superAdmin===null)return <div className="p-8 text-sm text-zinc-500">Cargando validación…</div>;
 return superAdmin?<SuperAdminValidationPage/>:<AdminBranchValidation/>;
}
