"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { treeApiFetch } from "../../../lib/decision-trees/client";

const TABS = [
  {
    key: "SUGGESTED",
    label: "Pendientes",
  },
  {
    key: "APPROVED",
    label: "Aprobadas",
  },
  {
    key: "REJECTED",
    label: "Rechazadas",
  },
  {
    key: "ARCHIVED",
    label: "Archivadas",
  },
];

function formatDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat(
      "es-AR",
      {
        dateStyle: "short",
        timeStyle: "short",
      }
    ).format(
      new Date(value)
    );
  } catch {
    return value;
  }
}

export default function AdminFaqsPage() {
  const [
    activeTab,
    setActiveTab,
  ] = useState(
    "SUGGESTED"
  );

  const [
    faqs,
    setFaqs,
  ] = useState([]);

  const [
    branches,
    setBranches,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    selectedFaq,
    setSelectedFaq,
  ] = useState(null);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detectMessage, setDetectMessage] = useState("");

  // v3.13.57 — analiza las consultas del piloto y propone FAQs por significado.
  const detectFromPilot = async () => {
    if (detecting) return;
    setDetecting(true);
    setDetectMessage("");
    try {
      const response = await treeApiFetch("/api/faqs/detect", { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo analizar el piloto");
      setDetectMessage(
        `Se analizaron ${result.eligible} consultas respondidas. ` +
        (result.suggested > 0
          ? `Nuevas FAQs propuestas: ${result.suggested}.`
          : `Ninguna llegó todavía a ${result.threshold} consultas parecidas.`)
      );
      await loadFaqs();
    } catch (err) {
      setDetectMessage(err?.message || "Error analizando el piloto");
    } finally {
      setDetecting(false);
    }
  };

  // =====================================================
  // CARGAR FAQs
  // =====================================================

  const loadFaqs =
    async () => {
      try {
        setLoading(true);
        setError(null);

        const response =
          await fetch(
            `/api/faqs?status=${activeTab}`,
            {
              cache:
                "no-store",
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result?.error ||
              "No se pudieron cargar las FAQs"
          );
        }

        setFaqs(
          result.faqs ||
            []
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando FAQs"
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  // =====================================================
  // CARGAR SUCURSALES
  // =====================================================

  const loadBranches =
    async () => {
      try {
        const response =
          await fetch(
            "/api/branches",
            {
              cache:
                "no-store",
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result?.error ||
              "No se pudieron cargar las sucursales"
          );
        }

        setBranches(
          result.branches ||
            []
        );
      } catch (err) {
        console.error(
          "Error cargando sucursales:",
          err
        );
      }
    };

  useEffect(() => {
    loadFaqs();
  }, [activeTab]);

  useEffect(() => {
    loadBranches();
  }, []);

  // =====================================================
  // FILTRO
  // =====================================================

  const filteredFaqs =
    useMemo(() => {
      const q =
        search
          .toLowerCase()
          .trim();

      if (!q) {
        return faqs;
      }

      return faqs.filter(
        (faq) => {
          const values = [
            faq.question,
            faq.answer,
            faq
              .social_works
              ?.name,
            faq
              .branches
              ?.name,
            faq
              .branches
              ?.code,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return values.includes(
            q
          );
        }
      );
    }, [
      faqs,
      search,
    ]);

  // =====================================================
  // ACTUALIZAR FAQ
  // =====================================================

  const updateFaq =
    async (
      id,
      payload
    ) => {
      try {
        setSaving(true);

        const response =
          await fetch(
            `/api/faqs/${id}`,
            {
              method:
                "PATCH",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify(
                  payload
                ),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result?.error ||
              "No se pudo actualizar la FAQ"
          );
        }

        setSelectedFaq(
          null
        );

        await loadFaqs();
      } catch (err) {
        alert(
          err?.message ||
            "Error actualizando FAQ"
        );
      } finally {
        setSaving(
          false
        );
      }
    };

  return (
    <main>
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}

        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500">
              Revisá, aprobá y administrá preguntas frecuentes detectadas por el asistente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={detectFromPilot}
              disabled={detecting}
              className="rounded-lg border border-[#8f2a85] px-4 py-2 text-sm font-semibold text-[#8f2a85] transition hover:bg-[#8f2a85]/5 disabled:opacity-60"
            >
              {detecting ? "Analizando…" : "Detectar FAQs del piloto"}
            </button>
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2">
            <span className="text-xs text-zinc-400">
              Resultados
            </span>

            <span className="ml-2 font-semibold text-zinc-900">
              {
                filteredFaqs.length
              }
            </span>
          </div>
          </div>
        </div>

        {detectMessage && (
          <p className="mb-4 rounded-lg bg-purple-50 px-4 py-2 text-sm text-[#8f2a85]">{detectMessage}</p>
        )}

        {/* TABS */}

        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map(
            (tab) => {
              const active =
                activeTab ===
                tab.key;

              return (
                <button
                  key={
                    tab.key
                  }
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      tab.key
                    )
                  }
                  className={[
                    "rounded-lg px-4 py-2 text-sm font-medium transition",
                    active
                      ? "bg-[#8f2a85] text-white"
                      : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
                  ].join(
                    " "
                  )}
                >
                  {
                    tab.label
                  }
                </button>
              );
            }
          )}
        </div>

        {/* SEARCH */}

        <div className="mb-5">
          <input
            type="text"
            value={
              search
            }
            onChange={(
              e
            ) =>
              setSearch(
                e.target
                  .value
              )
            }
            placeholder="Buscar por obra social, pregunta, respuesta o sucursal..."
            className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8f2a85]"
          />
        </div>

        {/* LOADING */}

        {loading && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            Cargando FAQs...
          </div>
        )}

        {/* ERROR */}

        {!loading &&
          error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {
                error
              }
            </div>
          )}

        {/* EMPTY */}

        {!loading &&
          !error &&
          filteredFaqs.length ===
            0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center">
              <p className="font-medium text-zinc-700">
                No hay FAQs en esta sección.
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                Cuando el sistema detecte nuevas preguntas frecuentes aparecerán acá.
              </p>
            </div>
          )}

        {/* TABLE */}

        {!loading &&
          !error &&
          filteredFaqs.length >
            0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">

                  <thead className="border-b border-zinc-200 bg-zinc-50/80">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Obra Social
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Pregunta
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Alcance
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Detectada
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Usos
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Estado
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Acciones
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-zinc-100">
                    {filteredFaqs.map(
                      (
                        faq
                      ) => {
                        const isGlobal =
                          faq.branch_id ==
                          null;

                        return (
                          <tr
                            key={
                              faq.id
                            }
                            className="transition hover:bg-zinc-50/70"
                          >

                            {/* OOSS */}

                            <td className="px-5 py-4 align-top">
                              <div className="flex flex-col gap-1">
                                <span className="font-semibold text-zinc-900">
                                  {faq
                                    .social_works
                                    ?.name ||
                                    `OOSS ${faq.social_work_id}`}
                                </span>

                                {faq.source_normative_id && (
                                  <span className="text-xs text-zinc-400">
                                    Normativa #
                                    {
                                      faq.source_normative_id
                                    }
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* PREGUNTA */}

                            <td className="max-w-[420px] px-5 py-4 align-top">
                              <div className="flex flex-col gap-1.5">
                                <span className="font-medium text-zinc-800">
                                  {
                                    faq.question
                                  }
                                </span>

                                <span className="line-clamp-2 text-xs leading-5 text-zinc-500">
                                  {
                                    faq.answer
                                  }
                                </span>

                                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-zinc-400">

                                  <span>
                                    Últ. detección:{" "}
                                    {formatDate(
                                      faq.last_detected_at
                                    )}
                                  </span>

                                  <span>
                                    Últ. uso:{" "}
                                    {formatDate(
                                      faq.last_used_at
                                    )}
                                  </span>

                                </div>
                              </div>
                            </td>

                            {/* ALCANCE */}

                            <td className="px-5 py-4 align-top">
                              {isGlobal ? (
                                <span className="inline-flex rounded-full bg-[#8f2a85]/10 px-2.5 py-1 text-xs font-semibold text-[#8f2a85]">
                                  Global
                                </span>
                              ) : (
                                <div className="flex flex-col gap-1">

                                  <span className="inline-flex w-fit rounded-full bg-[#93c01f]/15 px-2.5 py-1 text-xs font-semibold text-[#668500]">
                                    {faq
                                      .branches
                                      ?.code ||
                                      "Sucursal"}
                                  </span>

                                  <span className="text-xs text-zinc-400">
                                    {faq
                                      .branches
                                      ?.name ||
                                      `Sucursal ${faq.branch_id}`}
                                  </span>

                                </div>
                              )}
                            </td>

                            {/* DETECTADA */}

                            <td className="px-5 py-4 text-center align-top">
                              <span className="inline-flex min-w-9 justify-center rounded-lg bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700">
                                {
                                  faq.detected_count ||
                                  0
                                }
                              </span>
                            </td>

                            {/* USOS */}

                            <td className="px-5 py-4 text-center align-top">
                              <span className="inline-flex min-w-9 justify-center rounded-lg bg-zinc-100 px-2.5 py-1 font-semibold text-zinc-700">
                                {
                                  faq.usage_count ||
                                  0
                                }
                              </span>
                            </td>

                            {/* ESTADO */}

                            <td className="px-5 py-4 align-top">

                              {faq.status ===
                                "SUGGESTED" && (
                                <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                                  Pendiente
                                </span>
                              )}

                              {faq.status ===
                                "APPROVED" && (
                                <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                  Aprobada
                                </span>
                              )}

                              {faq.status ===
                                "REJECTED" && (
                                <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">
                                  Rechazada
                                </span>
                              )}

                              {faq.status ===
                                "ARCHIVED" && (
                                <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">
                                  Archivada
                                </span>
                              )}

                            </td>

                            {/* ACCIONES */}

                            <td className="px-5 py-4 align-top">
                              <div className="flex justify-end gap-2">

                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedFaq(
                                      faq
                                    )
                                  }
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
                                >
                                  ✏️ Editar
                                </button>

                                {faq.status ===
                                  "SUGGESTED" && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={
                                        saving
                                      }
                                      onClick={() =>
                                        updateFaq(
                                          faq.id,
                                          {
                                            status:
                                              "APPROVED",
                                          }
                                        )
                                      }
                                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                    >
                                      ✓ Aprobar
                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        saving
                                      }
                                      onClick={() =>
                                        updateFaq(
                                          faq.id,
                                          {
                                            status:
                                              "REJECTED",
                                          }
                                        )
                                      }
                                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
                                    >
                                      ✕ Rechazar
                                    </button>
                                  </>
                                )}

                                {faq.status ===
                                  "REJECTED" && (
                                  <button
                                    type="button"
                                    disabled={
                                      saving
                                    }
                                    onClick={() =>
                                      updateFaq(
                                        faq.id,
                                        {
                                          status:
                                            "APPROVED",
                                        }
                                      )
                                    }
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                  >
                                    ✓ Aprobar
                                  </button>
                                )}

                                {faq.status !==
                                  "ARCHIVED" && (
                                  <button
                                    type="button"
                                    disabled={
                                      saving
                                    }
                                    onClick={() =>
                                      updateFaq(
                                        faq.id,
                                        {
                                          status:
                                            "ARCHIVED",
                                        }
                                      )
                                    }
                                    className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 disabled:opacity-50"
                                  >
                                    📁 Archivar
                                  </button>
                                )}

                                {faq.status ===
                                  "ARCHIVED" && (
                                  <button
                                    type="button"
                                    disabled={
                                      saving
                                    }
                                    onClick={() =>
                                      updateFaq(
                                        faq.id,
                                        {
                                          status:
                                            "SUGGESTED",
                                        }
                                      )
                                    }
                                    className="rounded-lg border border-[#8f2a85]/20 bg-[#8f2a85]/5 px-3 py-2 text-xs font-semibold text-[#8f2a85] transition hover:bg-[#8f2a85]/10 disabled:opacity-50"
                                  >
                                    ↻ Reactivar
                                  </button>
                                )}

                              </div>
                            </td>

                          </tr>
                        );
                      }
                    )}
                  </tbody>

                </table>
              </div>
            </div>
          )}

      </div>

      {/* EDIT MODAL */}

      {selectedFaq && (
        <EditFaqModal
          faq={
            selectedFaq
          }
          branches={
            branches
          }
          saving={
            saving
          }
          onClose={() =>
            setSelectedFaq(
              null
            )
          }
          onSave={
            updateFaq
          }
        />
      )}

    </main>
  );
}

// =========================================================
// MODAL EDITAR FAQ
// =========================================================

function EditFaqModal({
  faq,
  branches,
  saving,
  onClose,
  onSave,
}) {
  const [question, setQuestion] =
    useState(faq.question || "");

  const [answer, setAnswer] =
    useState(faq.answer || "");

  const [scope, setScope] =
    useState(
      faq.branch_id
        ? "BRANCH"
        : "GLOBAL"
    );

  const [branchId, setBranchId] =
    useState(
      faq.branch_id
        ? String(faq.branch_id)
        : ""
    );

  const submit = async () => {
    const payload = {
      question:
        question.trim(),

      answer:
        answer.trim(),

      scope,
    };

    if (
      scope === "BRANCH"
    ) {
      payload.branchId =
        Number(branchId);
    }

    await onSave(
      faq.id,
      payload
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">

        {/* HEADER */}

        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">

          <div>
            <div className="flex items-center gap-2">

              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8f2a85]/10 text-lg">
                ❓
              </div>

              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Editar Pregunta Frecuente
                </h2>

                <p className="text-xs text-zinc-400">
                  FAQ #{faq.id}
                </p>
              </div>

            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            ✕
          </button>

        </div>

        {/* CONTENT */}

        <div className="overflow-y-auto">

          {/* CONTEXTO */}

          <div className="border-b border-zinc-100 bg-[#faf8fb] px-6 py-4">

            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8f2a85]">
              Obra Social
            </p>

            <p className="font-semibold text-zinc-900">
              {faq.social_works?.name ||
                `OOSS ${faq.social_work_id}`}
            </p>

          </div>

          <div className="space-y-6 px-6 py-5">

            {/* PREGUNTA */}

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Pregunta
              </label>

              <input
                type="text"
                value={question}
                onChange={(e) =>
                  setQuestion(
                    e.target.value
                  )
                }
                className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
              />
            </div>

            {/* RESPUESTA */}

            <div>
              <div className="mb-2 flex items-center justify-between">

                <label className="text-sm font-semibold text-zinc-700">
                  Respuesta
                </label>

                <span className="text-xs text-zinc-400">
                  Respuesta validada por administración
                </span>

              </div>

              <textarea
                value={answer}
                onChange={(e) =>
                  setAnswer(
                    e.target.value
                  )
                }
                rows={7}
                className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-sm leading-6 text-zinc-800 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
              />
            </div>

            {/* ALCANCE */}

            <div>
              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Alcance
              </label>

              <div className="grid gap-3 sm:grid-cols-2">

                <button
                  type="button"
                  onClick={() => {
                    setScope(
                      "GLOBAL"
                    );

                    setBranchId(
                      ""
                    );
                  }}
                  className={[
                    "rounded-xl border p-4 text-left transition",
                    scope === "GLOBAL"
                      ? "border-[#8f2a85] bg-[#8f2a85]/5 ring-2 ring-[#8f2a85]/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">

                    <div
                      className={[
                        "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border",
                        scope === "GLOBAL"
                          ? "border-[#8f2a85] bg-[#8f2a85]"
                          : "border-zinc-300",
                      ].join(" ")}
                    >
                      {scope ===
                        "GLOBAL" && (
                        <span className="text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-zinc-800">
                        Global
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        Disponible para todas las sucursales.
                      </p>
                    </div>

                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setScope(
                      "BRANCH"
                    )
                  }
                  className={[
                    "rounded-xl border p-4 text-left transition",
                    scope === "BRANCH"
                      ? "border-[#8f2a85] bg-[#8f2a85]/5 ring-2 ring-[#8f2a85]/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">

                    <div
                      className={[
                        "mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border",
                        scope === "BRANCH"
                          ? "border-[#8f2a85] bg-[#8f2a85]"
                          : "border-zinc-300",
                      ].join(" ")}
                    >
                      {scope ===
                        "BRANCH" && (
                        <span className="text-[10px] text-white">
                          ✓
                        </span>
                      )}
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-zinc-800">
                        Sucursal específica
                      </p>

                      <p className="mt-1 text-xs leading-5 text-zinc-400">
                        Tiene prioridad únicamente en la sucursal seleccionada.
                      </p>
                    </div>

                  </div>
                </button>

              </div>
            </div>

            {/* SUCURSAL */}

            {scope ===
              "BRANCH" && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-700">
                  Sucursal
                </label>

                <select
                  value={branchId}
                  onChange={(e) =>
                    setBranchId(
                      e.target.value
                    )
                  }
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
                >
                  <option value="">
                    Seleccionar sucursal...
                  </option>

                  {branches.map(
                    (branch) => (
                      <option
                        key={
                          branch.id
                        }
                        value={
                          branch.id
                        }
                      >
                        {
                          branch.name
                        }
                      </option>
                    )
                  )}
                </select>
              </div>
            )}

            {/* MÉTRICAS */}

            <div className="border-t border-zinc-100 pt-5">

              <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                Información de uso
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

                <div className="rounded-lg bg-zinc-50 px-3 py-3">
                  <p className="text-xs text-zinc-400">
                    Detectada
                  </p>

                  <p className="mt-1 text-lg font-semibold text-zinc-800">
                    {
                      faq.detected_count ||
                      0
                    }
                  </p>
                </div>

                <div className="rounded-lg bg-zinc-50 px-3 py-3">
                  <p className="text-xs text-zinc-400">
                    Usos
                  </p>

                  <p className="mt-1 text-lg font-semibold text-zinc-800">
                    {
                      faq.usage_count ||
                      0
                    }
                  </p>
                </div>

                <div className="rounded-lg bg-zinc-50 px-3 py-3">
                  <p className="text-xs text-zinc-400">
                    Fuente
                  </p>

                  <p className="mt-1 truncate text-sm font-semibold text-zinc-700">
                    {
                      faq.source_type ||
                      "-"
                    }
                  </p>
                </div>

                <div className="rounded-lg bg-zinc-50 px-3 py-3">
                  <p className="text-xs text-zinc-400">
                    Normativa
                  </p>

                  <p className="mt-1 text-sm font-semibold text-zinc-700">
                    {faq.source_normative_id
                      ? `#${faq.source_normative_id}`
                      : "-"}
                  </p>
                </div>

              </div>
            </div>

          </div>
        </div>

        {/* FOOTER */}

        <div className="flex items-center justify-end gap-3 border-t border-zinc-200 bg-white px-6 py-4">

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={submit}
            disabled={
              saving ||
              !question.trim() ||
              !answer.trim() ||
              (
                scope ===
                  "BRANCH" &&
                !branchId
              )
            }
            className="rounded-lg bg-[#8f2a85] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c2474] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving
              ? "Guardando..."
              : "Guardar cambios"}
          </button>

        </div>

      </div>
    </div>
  );
}