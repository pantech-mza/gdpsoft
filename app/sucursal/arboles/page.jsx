"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { treeApiFetch } from "../../../lib/decision-trees/client";

export default function SucursalArbolesPage() {
  const [trees, setTrees] = useState([]);
  const [socialWorks, setSocialWorks] = useState([]);

  const [search, setSearch] = useState("");
  const [socialWorkFilter, setSocialWorkFilter] = useState("");
  const [circuitFilter, setCircuitFilter] = useState("");
  const [page, setPage] = useState(1);

  const [selectedTree, setSelectedTree] = useState(null);
  const [currentNodeId, setCurrentNodeId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const scopedId = params.get("social_work_id");
  if (scopedId && /^\d+$/.test(scopedId)) setSocialWorkFilter(scopedId);
  const requestedCircuit = params.get("billing_channel_id");
  if (requestedCircuit && /^\d+$/.test(requestedCircuit)) setCircuitFilter(requestedCircuit);
}, []);

useEffect(() => {
  if (!trees.length) return;
  const target = new URLSearchParams(window.location.search).get("tree_id");
  if (!target) return;
  const tree = trees.find(item => String(item.id) === target);
  if (tree && socialWorkFilter && String(tree.social_work_id) === socialWorkFilter &&
     (!circuitFilter || String(tree.billing_channel_id) === circuitFilter)) openTree(tree);
}, [trees, socialWorkFilter, circuitFilter]);


  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [treesRes, socialWorksRes] = await Promise.all([
          treeApiFetch("/api/decision-trees?published=true", {
            cache: "no-store",
          }),

          fetch("/api/social-works", {
            cache: "no-store",
          }),
        ]);

        const treesData = await treesRes.json();
        const socialWorksData = await socialWorksRes.json();

        if (!treesRes.ok || !treesData?.ok) {
          throw new Error(
            treesData?.error ||
              "No se pudieron cargar los árboles publicados"
          );
        }

        setTrees(
          (treesData.trees || []).filter(
            (item) =>
              item.active === true &&
              item.published === true &&
              item.status === "PUBLISHED"
          )
        );

        if (socialWorksRes.ok && socialWorksData?.ok) {
          setSocialWorks(
            (socialWorksData.social_works || [])
              .filter((item) => item.active === true)
              .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), "es")
              )
          );
        }
      } catch (err) {
        console.error("Error cargando árboles:", err);

        setError(
          err?.message ||
            "No se pudieron cargar los árboles de decisión."
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const availableCircuits = useMemo(() => {
    if (!socialWorkFilter) return [];
    return [...new Map(trees.filter(item => String(item.social_work_id) === String(socialWorkFilter))
      .flatMap(item => item.social_work_circuits || [])
      .map(ch => [String(ch.id), { id: String(ch.id), name: ch.name || `Circuito ${ch.id}` }])).values()];
  }, [trees, socialWorkFilter]);

  const filteredTrees = useMemo(() => {
    const q = search.trim().toLowerCase();

    return trees.filter((item) => {
      if (!socialWorkFilter || item.circuit_ambiguous) return false;
      if (item.social_work_has_multiple_channels && item.billing_channel_id == null) return false;
      if (circuitFilter && String(item.billing_channel_id) !== circuitFilter) return false;
      if (
        socialWorkFilter &&
        String(item.social_work_id) !== String(socialWorkFilter)
      ) {
        return false;
      }

      if (!q) {
        return true;
      }

      const text = [
        item.title,
        item.description,
        item.social_works?.name,
        item.normatives?.title,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [trees, search, socialWorkFilter, circuitFilter]);

  useEffect(() => { setPage(1); }, [search, socialWorkFilter, circuitFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredTrees.length / 10));
  const visibleTrees = filteredTrees.slice((Math.min(page, pageCount) - 1) * 10, Math.min(page, pageCount) * 10);

  function openTree(tree) {
    const startNode =
      tree?.tree_json?.start_node ||
      tree?.tree_json?.nodes?.[0]?.id ||
      null;

    setSelectedTree(tree);
    setCurrentNodeId(startNode);
  }

  function closeTree() {
    setSelectedTree(null);
    setCurrentNodeId(null);
  }

  function goToNode(nodeId) {
    if (!nodeId) {
      return;
    }

    setCurrentNodeId(nodeId);
  }

  return (
    <div className="min-w-0 pb-12">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">
            <Icon
              icon="fluent:branch-fork-24-regular"
              width="24"
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-[26px] font-bold tracking-[-0.5px] text-[#21142b] sm:text-[30px]">
              Árboles de Decisión
            </h1>

            <p className="mt-1 text-[13px] text-zinc-500 sm:text-[14px]">
              Resolvé procedimientos paso a paso según la Obra Social.
            </p>
          </div>
        </div>
      </div>

      {/* FILTROS */}
      <div className="mb-5 grid gap-3 rounded-[16px] border border-zinc-200 bg-white p-4 lg:grid-cols-[1fr_320px]">
        <div className="relative min-w-0">
          <Icon
            icon="fluent:search-20-regular"
            width="19"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />

          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar árbol u Obra Social..."
            className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm outline-none transition focus:border-[#8f2a85]"
          />
        </div>

        <select
          value={socialWorkFilter}
          onChange={(event) => { setSocialWorkFilter(event.target.value); setCircuitFilter(""); setSelectedTree(null); }}
          className="h-11 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-[#8f2a85]"
        >
          <option value="">
            Todas las Obras Sociales
          </option>

          {socialWorks.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>

      {!loading && socialWorkFilter && availableCircuits.length > 1 && <div className="mb-5 rounded-xl border border-[#e9d5e7] bg-[#fcf7fb] p-4">
        <label htmlFor="branch-tree-circuit" className="mb-2 block text-sm font-semibold text-[#4b2351]">Filtrar por circuito</label>
        <select id="branch-tree-circuit" value={circuitFilter} onChange={event => { setCircuitFilter(event.target.value); setSelectedTree(null); }} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm">
          <option value="">Todos los circuitos</option>
          {availableCircuits.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
        </select>
      </div>}
      {!loading && !socialWorkFilter && <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Seleccioná primero la obra social para ver todos sus procedimientos publicados.</p>}
      {!loading && socialWorkFilter && availableCircuits.length > 1 && !circuitFilter && <p className="mb-5 text-xs text-zinc-500">Se muestran los árboles de todos los circuitos. Comprobá Colegio/Cámara antes de comenzar cada recorrido.</p>}

      {/* LOADING */}
      {loading && (
        <div className="rounded-[16px] border border-zinc-200 bg-white py-14 text-center">
          <Icon
            icon="fluent:spinner-ios-20-regular"
            width="27"
            className="mx-auto animate-spin text-[#8f2a85]"
          />

          <p className="mt-3 text-sm text-zinc-500">
            Cargando árboles...
          </p>
        </div>
      )}

      {/* ERROR */}
      {!loading && error && (
        <div className="rounded-[16px] border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-700">
            No pudimos cargar los árboles
          </p>

          <p className="mt-1 text-sm text-red-600">
            {error}
          </p>
        </div>
      )}

      {/* CONTENT */}
      {!loading && !error && (
        <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-[13px] text-zinc-500">
              <strong className="text-zinc-700">
                {filteredTrees.length}
              </strong>{" "}
              árboles disponibles
            </p>
          </div>

          {filteredTrees.length === 0 ? (
            <div className="rounded-[16px] border border-dashed border-zinc-300 bg-white px-5 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
                <Icon
                  icon="fluent:branch-fork-24-regular"
                  width="24"
                />
              </div>

              <p className="mt-3 font-semibold text-zinc-700">
                {!socialWorkFilter ? "Seleccioná una obra social" : "No hay árboles publicados para este filtro"}
              </p>

              <p className="mx-auto mt-1 max-w-lg text-[13px] leading-5 text-zinc-400">
                Los árboles aparecerán acá cuando sean publicados desde administración.
              </p>
            </div>
          ) : (
            filteredTrees.length <= 4 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredTrees.map(tree => <TreeCard key={tree.id} tree={tree} onOpen={() => openTree(tree)} />)}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
                {visibleTrees.map(tree => <div key={tree.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4 last:border-0">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[#21142b]">{tree.title}</h3>
                    <p className="mt-1 text-xs text-[#8f2a85]">{tree.social_works?.name} · {tree.billing_channel_name || "Circuito sin definir"}</p>
                    {tree.description && <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{tree.description}</p>}
                  </div>
                  <button onClick={() => openTree(tree)} type="button" className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white">Recorrer →</button>
                </div>)}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-[#fcf9fc] px-4 py-3 text-xs text-zinc-600">
                  <span>Página {Math.min(page,pageCount)} de {pageCount} · {filteredTrees.length} árboles</span>
                  <div className="flex gap-2">
                    <button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))}>Anterior</button>
                    <button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount,p+1))}>Siguiente</button>
                  </div>
                </div>
              </div>
            )
          )}
        </>
      )}

      {/* MODAL EJECUCIÓN */}
      {selectedTree && (
        <TreeExecutionModal
          tree={selectedTree}
          currentNodeId={currentNodeId}
          onGoToNode={goToNode}
          onClose={closeTree}
        />
      )}
    </div>
  );
}

/* =========================================================
   CARD
   ========================================================= */

function TreeCard({ tree, onOpen }) {
  const nodeCount =
    Array.isArray(tree?.tree_json?.nodes)
      ? tree.tree_json.nodes.length
      : 0;

  return (
    <div className="min-w-0 rounded-[17px] border border-zinc-200 bg-white p-5 shadow-[0_5px_18px_rgba(40,25,55,.04)]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">
          <Icon
            icon="fluent:branch-fork-24-regular"
            width="21"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">
              PUBLICADO
            </span>

            {tree.origin === "GENERATED_FROM_NORMATIVE" && (
              <span className="rounded-full bg-[#f4ecf9] px-2.5 py-1 text-[9px] font-bold text-[#8f2a85]">
                DESDE NORMATIVA
              </span>
            )}
          </div>

          <h2 className="mt-3 break-words text-[16px] font-bold leading-5 text-[#21142b]">
            {tree.title}
          </h2>

          <p className="mt-1 text-[12px] font-semibold text-[#8f2a85]">
            {tree.social_works?.name || "Obra Social"} · {tree.billing_channel_name || "Circuito sin asignar"}
          </p>
        </div>
      </div>

      {tree.description && (
        <p className="mt-4 text-[13px] leading-5 text-zinc-600">
          {tree.description}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <InfoBox
          label="Pasos"
          value={nodeCount || "-"}
        />

        <InfoBox
          label="Origen"
          value={
            tree.normatives?.title ||
            (tree.origin === "MANUAL"
              ? "Manual"
              : "-")
          }
        />
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#8f2a85] px-4 text-[12px] font-semibold text-white transition hover:bg-[#782171]"
      >
        <Icon
          icon="fluent:play-20-regular"
          width="17"
        />

        Iniciar árbol
      </button>
    </div>
  );
}

/* =========================================================
   EXECUTION MODAL
   ========================================================= */

function TreeExecutionModal({
  tree,
  currentNodeId,
  onGoToNode,
  onClose,
}) {
  const nodes =
    Array.isArray(tree?.tree_json?.nodes)
      ? tree.tree_json.nodes
      : [];

  const currentNode =
    nodes.find(
      (node) =>
        String(node.id) ===
        String(currentNodeId)
    ) || null;

  const currentIndex =
    currentNode
      ? nodes.findIndex(
          (node) =>
            String(node.id) ===
            String(currentNode.id)
        )
      : -1;

  const currentStep =
    currentIndex >= 0
      ? currentIndex + 1
      : null;

  const totalSteps =
    nodes.length;

  function restartTree() {
    const startNode =
      tree?.tree_json?.start_node ||
      nodes?.[0]?.id ||
      null;

    if (startNode) {
      onGoToNode(startNode);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-5"
      onMouseDown={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-[18px] bg-white shadow-2xl"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        {/* HEADER */}

        <div className="border-b border-zinc-200 px-5 py-4">
          <div className="flex items-start justify-between gap-4">

            <div className="min-w-0">

              <p className="text-[11px] font-bold uppercase tracking-[.06em] text-[#8f2a85]">
                {tree.social_works?.name ||
                  "Obra Social"}
              </p>

              <h2 className="mt-1 break-words text-xl font-bold text-[#21142b]">
                {tree.title}
              </h2>

              {currentStep &&
                totalSteps > 0 && (
                  <div className="mt-2 flex items-center gap-2">

                    <span className="text-[11px] font-semibold text-zinc-400">
                      Paso {currentStep} de {totalSteps}
                    </span>

                    <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-[#8f2a85] transition-all"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (currentStep / totalSteps) * 100
                            )
                          )}%`,
                        }}
                      />
                    </div>

                  </div>
                )}

            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
            >
              <Icon
                icon="fluent:dismiss-20-regular"
                width="19"
              />
            </button>

          </div>
        </div>

        {/* BODY */}

        <div className="max-h-[72vh] overflow-y-auto p-5">

          {!currentNode ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">

              <p className="font-semibold text-red-700">
                No se pudo encontrar el paso actual del árbol.
              </p>

              <button
                type="button"
                onClick={restartTree}
                className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-red-600 px-3 text-[12px] font-semibold text-white"
              >
                <Icon
                  icon="fluent:arrow-counterclockwise-20-regular"
                  width="16"
                />

                Reiniciar árbol
              </button>

            </div>
          ) : (
            <CurrentNode
              node={currentNode}
              tree={tree}
              onGoToNode={onGoToNode}
              onClose={onClose}
              onRestart={restartTree}
              currentStep={currentStep}
              totalSteps={totalSteps}
            />
          )}

        </div>
      </div>
    </div>
  );
}

function CurrentNode({
  node,
  tree,
  onGoToNode,
  onClose,
  onRestart,
  currentStep,
  totalSteps,
}) {
  /* =========================================================
     QUESTION
     ========================================================= */

  if (node.type === "question") {
    return (
      <div>

        <div className="rounded-[16px] border border-[#8f2a85]/15 bg-[#faf6fb] p-5">

          <div className="flex items-center justify-between gap-3">

            <p className="text-[10px] font-bold uppercase tracking-[.07em] text-[#8f2a85]">
              Pregunta
            </p>

            {currentStep &&
              totalSteps && (
                <span className="text-[10px] font-semibold text-zinc-400">
                  {currentStep}/{totalSteps}
                </span>
              )}

          </div>

          <h3 className="mt-2 text-[20px] font-bold leading-7 text-[#21142b]">
            {node.text}
          </h3>

        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">

          {(node.options || []).map(
            (option, index) => (
              <button
                key={index}
                type="button"
                onClick={() =>
                  onGoToNode(
                    option.next
                  )
                }
                className="min-h-12 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-[14px] font-semibold text-zinc-700 transition hover:border-[#8f2a85] hover:bg-[#faf6fb] hover:text-[#8f2a85]"
              >
                <div className="flex items-center justify-between gap-3">

                  <span>
                    {option.label}
                  </span>

                  <Icon
                    icon="fluent:arrow-right-20-regular"
                    width="16"
                    className="shrink-0 text-zinc-400"
                  />

                </div>
              </button>
            )
          )}

        </div>

      </div>
    );
  }

  /* =========================================================
     INSTRUCTION
     ========================================================= */

  if (node.type === "instruction") {
    return (
      <div>

        <div className="rounded-[16px] border border-blue-100 bg-blue-50 p-5">

          <div className="flex items-start gap-3">

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700">
              <Icon
                icon="fluent:arrow-step-in-right-20-regular"
                width="18"
              />
            </div>

            <div className="min-w-0 flex-1">

              <div className="flex items-center justify-between gap-3">

                <p className="text-[10px] font-bold uppercase tracking-[.07em] text-blue-600">
                  Instrucción
                </p>

                {currentStep &&
                  totalSteps && (
                    <span className="text-[10px] font-semibold text-zinc-400">
                      {currentStep}/{totalSteps}
                    </span>
                  )}

              </div>

              <p className="mt-2 text-[16px] font-semibold leading-6 text-zinc-800">
                {node.text}
              </p>

            </div>
          </div>

        </div>

        <button
          type="button"
          disabled={!node.next}
          onClick={() =>
            onGoToNode(
              node.next
            )
          }
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8f2a85] px-4 text-sm font-semibold text-white transition hover:bg-[#782171] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continuar

          <Icon
            icon="fluent:arrow-right-20-regular"
            width="17"
          />
        </button>

      </div>
    );
  }

  /* =========================================================
     RESULT
     ========================================================= */

  if (node.type === "result") {
    return (
      <div>

        <div className="rounded-[16px] border border-emerald-100 bg-emerald-50 p-5">

          <div className="flex items-start gap-3">

            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600">
              <Icon
                icon="fluent:checkmark-circle-24-regular"
                width="22"
              />
            </div>

            <div className="min-w-0 flex-1">

              <div className="flex items-center justify-between gap-3">

                <p className="text-[10px] font-bold uppercase tracking-[.07em] text-emerald-600">
                  Resultado
                </p>

                {currentStep &&
                  totalSteps && (
                    <span className="text-[10px] font-semibold text-emerald-600/60">
                      {currentStep}/{totalSteps}
                    </span>
                  )}

              </div>

              <p className="mt-2 text-[16px] font-semibold leading-6 text-zinc-800">
                {node.text}
              </p>

            </div>
          </div>

        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">

          <button
            type="button"
            onClick={onRestart}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-[#8f2a85]/30 hover:bg-[#faf6fb] hover:text-[#8f2a85]"
          >
            <Icon
              icon="fluent:arrow-counterclockwise-20-regular"
              width="17"
            />

            Reiniciar árbol
          </button>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#21142b] px-4 text-sm font-semibold text-white transition hover:bg-[#160b1d]"
          >
            <Icon
              icon="fluent:checkmark-20-regular"
              width="17"
            />

            Finalizar
          </button>

        </div>

      </div>
    );
  }

  /* =========================================================
     UNKNOWN
     ========================================================= */

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">

      <p className="text-sm text-zinc-600">
        Tipo de nodo no reconocido.
      </p>

      <button
        type="button"
        onClick={onRestart}
        className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-semibold text-zinc-600"
      >
        <Icon
          icon="fluent:arrow-counterclockwise-20-regular"
          width="16"
        />

        Reiniciar árbol
      </button>

    </div>
  );
}

/* =========================================================
   INFO
   ========================================================= */

function InfoBox({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f8f7fa] px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-[.06em] text-zinc-400">
        {label}
      </p>

      <p className="mt-1 break-words text-[12px] font-semibold leading-4 text-zinc-700">
        {value}
      </p>
    </div>
  );
}