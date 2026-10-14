"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Icon } from "@iconify/react";
import { treeApiFetch } from "../../../lib/decision-trees/client";
import VisualTreeEditor from "../../../components/decision-trees/VisualTreeEditor";
import BulkTreeGenerator from "../../../components/decision-trees/BulkTreeGenerator";

const EMPTY_TREE = {
  start_node: "",
  nodes: [],
};

export default function AdminDecisionTreesPage() {
  const [tab, setTab] =
    useState("SUGGESTED");

const [treePage, setTreePage] = useState(1);
const [circuitFilter, setCircuitFilter] = useState("");
const [normatives, setNormatives] = useState([]);
const [manualNormatives, setManualNormatives] = useState([]);
const [normativeId, setNormativeId] = useState("");
const [generateMessage, setGenerateMessage] = useState("");
const [generatorError, setGeneratorError] = useState("");
const [generating, setGenerating] = useState(false);


  const [
    candidates,
    setCandidates,
  ] = useState([]);

  const [
    trees,
    setTrees,
  ] = useState([]);

  const [
    socialWorks,
    setSocialWorks,
  ] = useState([]);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    socialWorkFilter,
    setSocialWorkFilter,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(null);

  const [
    error,
    setError,
  ] = useState("");

  const [
    selectedCandidate,
    setSelectedCandidate,
  ] = useState(null);

  const [
    selectedTree,
    setSelectedTree,
  ] = useState(null);

  const [
    candidateEditor,
    setCandidateEditor,
  ] = useState(null);

  const [
    treeEditor,
    setTreeEditor,
  ] = useState(null);

  const [
    newTreeOpen,
    setNewTreeOpen,
  ] = useState(false);

  const [
    newTree,
    setNewTree,
  ] = useState({
    social_work_id: "",
    normative_id: "",
    title: "",
    description: "",
    tree_json: {
      ...EMPTY_TREE,
    },
  });

  /* =========================================================
     CARGA
     ========================================================= */

  async function loadAll() {
    try {
      setLoading(true);
      setError("");

      const [
        candidatesRes,
        treesRes,
        socialWorksRes,
      ] =
        await Promise.all([
          treeApiFetch(
            "/api/decision-tree-candidates",
            {
              cache:
                "no-store",
            }
          ),

          treeApiFetch(
            "/api/decision-trees",
            {
              cache:
                "no-store",
            }
          ),

          treeApiFetch(
            "/api/social-works",
            {
              cache:
                "no-store",
            }
          ),
        ]);

      const [
        candidatesData,
        treesData,
        socialWorksData,
      ] =
        await Promise.all([
          candidatesRes.json(),
          treesRes.json(),
          socialWorksRes.json(),
        ]);

      if (
        !candidatesRes.ok ||
        !candidatesData?.ok
      ) {
        throw new Error(
          candidatesData?.error ||
            "No se pudieron cargar los candidatos"
        );
      }

      if (
        !treesRes.ok ||
        !treesData?.ok
      ) {
        throw new Error(
          treesData?.error ||
            "No se pudieron cargar los árboles"
        );
      }

      if (
        !socialWorksRes.ok ||
        !socialWorksData?.ok
      ) {
        throw new Error(
          socialWorksData?.error ||
            "No se pudieron cargar las Obras Sociales"
        );
      }

      setCandidates(
        candidatesData.candidates ||
          []
      );

      setTrees(
        treesData.trees || []
      );

      setSocialWorks(
        (
          socialWorksData.social_works ||
          []
        )
          .filter(
            (item) =>
              item.active ===
              true
          )
          .sort(
            (a, b) =>
              String(
                a.name
              ).localeCompare(
                String(
                  b.name
                ),
                "es"
              )
          )
      );
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "No se pudo cargar el módulo de árboles."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

useEffect(() => {
  const query = new URLSearchParams(window.location.search);
  const socialWorkId = query.get("social_work_id");
  if (socialWorkId && /^\d+$/.test(socialWorkId)) setSocialWorkFilter(socialWorkId);
  if (query.get("tree_id")) setTab("TREES");
}, []);

useEffect(() => {
  setTreePage(1);
}, [socialWorkFilter, circuitFilter, search]);

useEffect(() => {
  let active = true;
  setNormativeId("");
  setNormatives([]);
  if (!socialWorkFilter) return;
  (async () => {
    try {
      const response = await treeApiFetch(`/api/social-works/${socialWorkFilter}/normatives`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Error al cargar normativas");
      if (active) setNormatives((data.normatives || []).filter(n => n.is_current !== false));
    } catch (err) { if (active) setGeneratorError(err.message); }
  })();
  return () => { active = false; };
}, [socialWorkFilter]);

useEffect(() => {
  let active = true;
  setManualNormatives([]);
  if (!newTreeOpen || !newTree.social_work_id) return;
  (async () => {
    try {
      const response = await treeApiFetch(`/api/social-works/${newTree.social_work_id}/normatives`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Error cargando normativas");
      if (active) setManualNormatives((data.normatives || []).filter(n => n.is_current !== false));
    } catch(err) { if(active) setGeneratorError(err.message); }
  })();
  return () => { active = false; };
}, [newTreeOpen, newTree.social_work_id]);

useEffect(() => {
  if (!trees.length) return;
  const query = new URLSearchParams(window.location.search);
  const id = query.get("tree_id");
  if (!id) return;
  const tree = trees.find(item => String(item.id) === id);
  if (!tree) return;
  const editRequested = query.get("edit") === "1";
  query.delete("tree_id");
  query.delete("edit");
  window.history.replaceState(null, "", `${window.location.pathname}?${query.toString()}`);
  if (editRequested) {
    if (tree.status === "DRAFT" && !tree.published) openTreeEditor(tree);
    else duplicateTree(tree, true);
  } else setSelectedTree(tree);
}, [trees]);

async function generateFromNormative() {
  if (!socialWorkFilter || !normativeId) return;
  setGenerating(true);
  setGenerateMessage("");
  setGeneratorError("");
  try {
    const response = await treeApiFetch("/api/decision-tree-candidates/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ social_work_id: Number(socialWorkFilter), normative_id: Number(normativeId) }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "No se pudieron generar las sugerencias");
    setGenerateMessage(data.count ? `${data.count} propuestas ${data.reused ? "existentes" : "generadas"}. Revisalas antes de aprobar.` : "La IA no encontró decisiones suficientes para proponer un árbol en esa normativa.");
    await loadAll();
    setTab("SUGGESTED");
  } catch (err) { setGeneratorError(err.message || "Error generando sugerencias"); }
  finally { setGenerating(false); }
}


  /* =========================================================
     FILTROS
     ========================================================= */

  const availableCircuits = useMemo(() => {
    const items = [...candidates, ...trees].filter(item => !socialWorkFilter || String(item.social_work_id) === String(socialWorkFilter));
    const found = new Map();
    for (const item of items) {
      if (item.billing_channel_id != null) found.set(String(item.billing_channel_id), { id: String(item.billing_channel_id), name: item.billing_channel_name || `Circuito ${item.billing_channel_id}` });
    }
    return [...found.values()].sort((a,b) => a.name.localeCompare(b.name, "es"));
  }, [candidates, trees, socialWorkFilter]);

  const circuitMatches = (item) => !circuitFilter || (circuitFilter === "UNASSIGNED" ? item.billing_channel_id == null : String(item.billing_channel_id) === circuitFilter);

  const filteredCandidates =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return candidates.filter(
        (item) => {
          if (!circuitMatches(item)) return false;
          if (
            socialWorkFilter &&
            String(
              item.social_work_id
            ) !==
              String(
                socialWorkFilter
              )
          ) {
            return false;
          }

          if (
            tab ===
              "SUGGESTED" &&
            item.status !==
              "SUGGESTED"
          ) {
            return false;
          }

          if (!q) {
            return true;
          }

          const text = [
            item.title,
            item.description,
            item
              .social_works
              ?.name,
            item
              .normatives
              ?.title,
            item
              .normatives
              ?.original_filename,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            q
          );
        }
      );
    }, [
      candidates,
      search,
      socialWorkFilter,
      circuitFilter,
      tab,
    ]);

  const filteredTrees =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return trees.filter(
        (item) => {
          if (!circuitMatches(item)) return false;
          if (
            socialWorkFilter &&
            String(
              item.social_work_id
            ) !==
              String(
                socialWorkFilter
              )
          ) {
            return false;
          }

          if (!q) {
            return true;
          }

          const text = [
            item.title,
            item.description,
            item
              .social_works
              ?.name,
            item
              .normatives
              ?.title,
            item.origin,
            item.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return text.includes(
            q
          );
        }
      );
    }, [
      trees,
      search,
      socialWorkFilter,
      circuitFilter,
    ]);


const treePageCount = Math.max(1, Math.ceil(filteredTrees.length / 10));
const safeTreePage = Math.min(treePage, treePageCount);
const visibleTrees = filteredTrees.slice((safeTreePage - 1) * 10, safeTreePage * 10);

  const suggestedCount =
    candidates.filter(
      (item) =>
        item.status ===
        "SUGGESTED"
    ).length;

  const publishedCount =
    trees.filter(
      (item) =>
        item.published ===
          true &&
        item.active === true
    ).length;

  /* =========================================================
     CANDIDATOS
     ========================================================= */

  async function candidateAction(
    id,
    action,
    extra = {}
  ) {
    try {
      setActionLoading(
        `candidate-${id}-${action}`
      );

      const res =
        await treeApiFetch(
          `/api/decision-tree-candidates/${id}`,
          {
            method:
              "PATCH",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                action,
                ...extra,
              }),
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "No se pudo realizar la acción"
        );
      }

      await loadAll();

      setSelectedCandidate(
        null
      );

      setCandidateEditor(
        null
      );

      return data;
    } catch (err) {
      alert(
        err?.message ||
          "Ocurrió un error"
      );

      return null;
    } finally {
      setActionLoading(
        null
      );
    }
  }

  function openCandidateEditor(
    candidate
  ) {
    setCandidateEditor({
      ...candidate,

      generated_json:
        JSON.parse(JSON.stringify(candidate.generated_json || EMPTY_TREE)),
    });
  }

  async function saveCandidateEditor() {
    if (
      !candidateEditor
    ) {
      return;
    }

    const parsedTree = candidateEditor.generated_json;
    if (!parsedTree || typeof parsedTree !== "object" || Array.isArray(parsedTree)) {
      alert("La estructura del árbol no es válida. Revisá sus pasos.");
      return;
    }

    await candidateAction(
      candidateEditor.id,
      "EDIT",
      {
        title:
          candidateEditor.title,

        description:
          candidateEditor.description,

        source_pages:
          candidateEditor.source_pages,

        generated_json:
          parsedTree,
      }
    );
  }

  /* =========================================================
     ÁRBOLES
     ========================================================= */

  async function updateTree(
    id,
    payload
  ) {
    try {
      setActionLoading(
        `tree-${id}`
      );

      const res =
        await treeApiFetch(
          `/api/decision-trees/${id}`,
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

      const data =
        await res.json();

      if (
        !res.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "No se pudo actualizar el árbol"
        );
      }

      await loadAll();

      setSelectedTree(
        null
      );

      setTreeEditor(
        null
      );

      return data;
    } catch (err) {
      alert(
        err?.message ||
          "Ocurrió un error"
      );

      return null;
    } finally {
      setActionLoading(
        null
      );
    }
  }

  async function archiveTree(
    id
  ) {
    const confirmed =
      window.confirm(
        "¿Querés archivar este árbol? Dejará de estar disponible para sucursales."
      );

    if (!confirmed) {
      return;
    }

    try {
      setActionLoading(
        `tree-${id}`
      );

      const res =
        await treeApiFetch(
          `/api/decision-trees/${id}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "No se pudo archivar el árbol"
        );
      }

      await loadAll();

      setSelectedTree(
        null
      );
    } catch (err) {
      alert(
        err?.message ||
          "Ocurrió un error"
      );
    } finally {
      setActionLoading(
        null
      );
    }
  }

  function openTreeEditor(
    tree
  ) {
    setTreeEditor({
      ...tree,

      tree_json:
        JSON.parse(JSON.stringify(tree.tree_json || EMPTY_TREE)),
    });
  }

  async function saveTreeEditor() {
    if (!treeEditor) {
      return;
    }

    const parsedTree = treeEditor.tree_json;
    if (!parsedTree || typeof parsedTree !== "object" || Array.isArray(parsedTree)) {
      alert("La estructura del árbol no es válida. Revisá sus pasos.");
      return;
    }

    await updateTree(
      treeEditor.id,
      {
        title:
          treeEditor.title,

        description:
          treeEditor.description,

        tree_json:
          parsedTree,

        source_pages:
          treeEditor.source_pages,
      }
    );
  }

  async function duplicateTree(
    tree,
    editAfter = false
  ) {
    try {
      setActionLoading(
        `duplicate-${tree.id}`
      );

      const res =
        await treeApiFetch(
          "/api/decision-trees",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                social_work_id:
                  tree.social_work_id,

                normative_id:
                  tree.normative_id,

                title:
                  `${tree.title} - Copia`,

                description:
                  tree.description,

                origin:
                  "MANUAL",

                tree_json: {
                  ...tree.tree_json,
                  _meta: {
                    ...(tree.tree_json?._meta || {}),
                    based_on_tree_id: tree.id,
                    revision: Number(tree.tree_json?._meta?.revision || 1) + 1,
                  },
                },

                source_pages:
                  tree.source_pages,

                confidence:
                  tree.confidence,
              }),
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "No se pudo duplicar el árbol"
        );
      }

      await loadAll();
      if (editAfter && data?.tree) {
        openTreeEditor(data.tree);
        setTab("TREES");
      }
    } catch (err) {
      alert(
        err?.message ||
          "Ocurrió un error"
      );
    } finally {
      setActionLoading(
        null
      );
    }
  }

  /* =========================================================
     NUEVO ÁRBOL MANUAL
     ========================================================= */

  async function createManualTree() {
    if (
      !newTree.social_work_id
    ) {
      alert(
        "Seleccioná una Obra Social."
      );

      return;
    }

    if (
      !newTree.title.trim()
    ) {
      alert(
        "Ingresá un título."
      );

      return;
    }

    try {
      setActionLoading(
        "new-tree"
      );

      const res =
        await treeApiFetch(
          "/api/decision-trees",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                social_work_id:
                  Number(
                    newTree.social_work_id
                  ),

                normative_id: newTree.normative_id ? Number(newTree.normative_id) : null,

                title:
                  newTree.title,

                description:
                  newTree.description,

                origin:
                  "MANUAL",

                tree_json:
                  newTree.tree_json,
              }),
          }
        );

      const data =
        await res.json();

      if (
        !res.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.error ||
            "No se pudo crear el árbol"
        );
      }

      setNewTree({
        social_work_id:
          "",
        normative_id: "",

        title:
          "",

        description:
          "",

        tree_json: {
          ...EMPTY_TREE,
        },
      });

      setNewTreeOpen(
        false
      );

      setTab("TREES");

      await loadAll();
      if (data.tree) {
        openTreeEditor(data.tree);
      }
    } catch (err) {
      alert(
        err?.message ||
          "Ocurrió un error"
      );
    } finally {
      setActionLoading(
        null
      );
    }
  }

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="min-w-0 pb-12">

      {/* HEADER */}

      <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

        <div>

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">

              <Icon
                icon="fluent:branch-fork-24-regular"
                width="24"
              />

            </div>

            <div>

              <h1 className="text-[29px] font-bold tracking-[-0.7px] text-[#21142b]">
                Árboles de Decisión
              </h1>

              <p className="mt-1 text-sm text-zinc-500">
                Generá, revisá y publicá procedimientos operativos para sucursales.
              </p>

            </div>

          </div>

        </div>

        <div className="flex flex-wrap gap-2">

          <button
            type="button"
            onClick={() =>
              setNewTreeOpen(
                true
              )
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#8f2a85] px-4 text-sm font-semibold text-white transition hover:bg-[#782171]"
          >
            <Icon
              icon="fluent:add-20-regular"
              width="18"
            />

            Nuevo árbol
          </button>

        </div>

      </div>


<section className="mb-6 rounded-[17px] border border-[#ecd9ec] bg-gradient-to-r from-[#fbf3fb] to-white p-4 sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h2 className="text-base font-bold text-zinc-900">Generar árboles desde una normativa</h2>
      <p className="mt-1 text-xs leading-5 text-zinc-500">La IA analiza la normativa seleccionada y prepara propuestas para revisar. Nunca se publican automáticamente.</p>
    </div>
    <Icon icon="fluent:sparkle-24-filled" width="25" className="text-[#8f2a85]" />
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(200px,1.5fr)_auto]">
    <select className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]" value={socialWorkFilter} onChange={e => { setSocialWorkFilter(e.target.value); setCircuitFilter(""); }}>
      <option value="">Elegir obra social…</option>
      {socialWorks.map(sw => <option key={sw.id} value={sw.id}>{sw.name}</option>)}
    </select>
    <select className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]" value={normativeId} onChange={e => setNormativeId(e.target.value)} disabled={!socialWorkFilter}>
      <option value="">Elegir normativa vigente…</option>
      {normatives.map(n => <option key={n.id} value={n.id} disabled={n.openai_status !== "completed"}>{n.title || n.original_filename || `Normativa ${n.id}`} · {n.relation?.billing_channel?.name || "Circuito no indicado"} · {n.original_filename || `#${n.id}`}{n.openai_status !== "completed" ? " · sin indexar" : ""}</option>)}
    </select>
    <button type="button" className="h-11 rounded-xl bg-[#8f2a85] px-4 text-sm font-semibold text-white disabled:opacity-40" disabled={generating || !normativeId} onClick={generateFromNormative}>
      {generating ? "Analizando…" : "Generar con IA"}
    </button>
  </div>
  {generatorError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{generatorError}</p>}
  {generateMessage && <p role="status" className="mt-3 rounded-lg bg-[#f2f8e9] p-3 text-sm text-[#527319]">{generateMessage}</p>}
</section>

      <BulkTreeGenerator onCompleted={loadAll} />

      {/* STATS */}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

        <StatCard
          label="Sugeridos por IA"
          value={
            suggestedCount
          }
          icon="fluent:sparkle-24-regular"
        />

        <StatCard
          label="Árboles activos"
          value={
            trees.filter(
              (item) =>
                item.active
            ).length
          }
          icon="fluent:branch-fork-24-regular"
        />

        <StatCard
          label="Publicados"
          value={
            publishedCount
          }
          icon="fluent:globe-24-regular"
        />

        <StatCard
          label="Borradores"
          value={
            trees.filter(
              (item) =>
                item.status ===
                "DRAFT"
            ).length
          }
          icon="fluent:edit-24-regular"
        />

      </div>

      {/* TABS */}

      <div className="mb-5 flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-1">

        <TabButton
          active={
            tab ===
            "SUGGESTED"
          }
          onClick={() =>
            setTab(
              "SUGGESTED"
            )
          }
          icon="fluent:sparkle-20-regular"
        >
          Sugeridos por IA

          {suggestedCount >
            0 && (
            <span className="ml-1 rounded-full bg-[#8f2a85] px-2 py-0.5 text-[10px] font-bold text-white">
              {
                suggestedCount
              }
            </span>
          )}
        </TabButton>

        <TabButton
          active={
            tab ===
            "TREES"
          }
          onClick={() =>
            setTab(
              "TREES"
            )
          }
          icon="fluent:branch-fork-20-regular"
        >
          Árboles creados
        </TabButton>

      </div>

      {/* FILTROS */}

      <div className="mb-5 grid gap-3 rounded-[16px] border border-zinc-200 bg-white p-4 lg:grid-cols-[1fr_260px_240px]">

        <div className="relative min-w-0">

          <Icon
            icon="fluent:search-20-regular"
            width="19"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
          />

          <input
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar árbol, normativa u Obra Social..."
            className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm outline-none transition focus:border-[#8f2a85]"
          />

        </div>

        <select
          value={
            socialWorkFilter
          }
          onChange={(event) => { setSocialWorkFilter(event.target.value); setCircuitFilter(""); }}
          className="h-11 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-[#8f2a85]"
        >
          <option value="">
            Todas las Obras Sociales
          </option>

          {socialWorks.map(
            (item) => (
              <option
                key={
                  item.id
                }
                value={
                  item.id
                }
              >
                {item.name}
              </option>
            )
          )}
        </select>

        <select value={circuitFilter} onChange={(event) => setCircuitFilter(event.target.value)} className="h-11 min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]" aria-label="Filtrar por circuito">
          <option value="">Todos los circuitos</option>
          {availableCircuits.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
          <option value="UNASSIGNED">Sin circuito asignado</option>
        </select>

      </div>

      {/* ESTADOS */}

      {loading && (
        <LoadingState />
      )}

      {!loading &&
        error && (
          <ErrorState
            message={
              error
            }
          />
        )}

      {/* SUGERIDOS */}

      {!loading &&
        !error &&
        tab ===
          "SUGGESTED" && (
          <>

            {filteredCandidates.length ===
            0 ? (
              <EmptyState
                title="No hay sugerencias pendientes"
                description="Cuando analices normativas con IA, los posibles árboles aparecerán acá."
              />
            ) : (
              <div className="grid min-w-0 gap-4 xl:grid-cols-2">

                {filteredCandidates.map(
                  (
                    candidate
                  ) => (
                    <CandidateCard
                      key={
                        candidate.id
                      }
                      candidate={
                        candidate
                      }
                      loading={
                        actionLoading
                      }
                      onView={() =>
                        setSelectedCandidate(
                          candidate
                        )
                      }
                      onEdit={() =>
                        openCandidateEditor(
                          candidate
                        )
                      }
                      onApprove={() =>
                        candidateAction(
                          candidate.id,
                          "APPROVE"
                        )
                      }
                      onReject={() => {
                        const confirmed =
                          window.confirm(
                            `¿Rechazar "${candidate.title}"?`
                          );

                        if (
                          confirmed
                        ) {
                          candidateAction(
                            candidate.id,
                            "REJECT"
                          );
                        }
                      }}
                    />
                  )
                )}

              </div>
            )}

          </>
        )}

      {/* ÁRBOLES */}

      {!loading &&
        !error &&
        tab ===
          "TREES" && (
          <>

            {filteredTrees.length ===
            0 ? (
              <EmptyState
                title="Todavía no hay árboles"
                description="Podés aprobar una sugerencia de IA o crear un árbol manual."
              />
            ) : (

<>
  {filteredTrees.length <= 4 ? (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      {filteredTrees.map(tree => (
        <TreeCard
          key={tree.id} tree={tree} loading={actionLoading}
          onView={() => setSelectedTree(tree)}
          onEdit={() => tree.published || tree.status === "APPROVED" ? duplicateTree(tree, true) : openTreeEditor(tree)}
          onApprove={() => updateTree(tree.id, { status: "APPROVED" })}
          onPublish={() => updateTree(tree.id, { published: !tree.published })}
          onDuplicate={() => duplicateTree(tree)}
          onArchive={() => archiveTree(tree.id)}
        />
      ))}
    </div>
  ) : (
    <div className="overflow-visible rounded-[17px] border border-zinc-200 bg-white shadow-sm">
      {visibleTrees.map(tree => (
        <div key={tree.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 sm:px-5">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-sm font-bold text-zinc-900">{tree.title}</h3>
            <p className="mt-1 text-xs text-zinc-500">{tree.social_works?.name} · {tree.billing_channel_name || "Circuito sin definir"} · {tree.status}</p>
          </div>
          <details className="relative shrink-0">
            <summary aria-label={`Acciones de ${tree.title}`} className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl border border-zinc-200 bg-white hover:bg-[#faf5fa]">
              <Icon icon="fluent:more-horizontal-24-regular" width="22" />
            </summary>
            <div className="absolute right-0 top-11 z-20 w-[200px] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => setSelectedTree(tree)}>Ver recorrido</button>
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => tree.status === "DRAFT" ? openTreeEditor(tree) : duplicateTree(tree, true)}>{tree.status === "DRAFT" ? "Editar" : "Crear nueva versión"}</button>
              {tree.status === "DRAFT" && <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => updateTree(tree.id, { status: "APPROVED" })}>Aprobar</button>}
              {tree.status !== "DRAFT" && <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => updateTree(tree.id, { published: !tree.published })}>{tree.published ? "Despublicar" : "Publicar"}</button>}
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => duplicateTree(tree, true)}>Duplicar</button>
              <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={() => archiveTree(tree.id)}>Archivar</button>
            </div>
          </details>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fcf8fc] p-4 text-xs text-zinc-500">
        <span>Página {safeTreePage} de {treePageCount} · {filteredTrees.length} árboles</span>
        <div className="flex gap-2">
          <button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={safeTreePage === 1} onClick={() => setTreePage(p => Math.max(1,p-1))}>Anterior</button>
          <button className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" disabled={safeTreePage >= treePageCount} onClick={() => setTreePage(p => Math.min(treePageCount,p+1))}>Siguiente</button>
        </div>
      </div>
    </div>
  )}
</>

            )}

          </>
        )}

      {/* MODAL CANDIDATO */}

      {selectedCandidate && (
        <TreePreviewModal
          title={
            selectedCandidate.title
          }
          subtitle={
            `${selectedCandidate.social_works?.name || "Obra Social"} · ${selectedCandidate.billing_channel_name || "Circuito sin definir"}`
          }
          tree={
            selectedCandidate.generated_json
          }
          source={
            selectedCandidate
              .normatives
              ?.title
          }
          sourcePages={
            selectedCandidate.source_pages
          }
          confidence={
            selectedCandidate.confidence
          }
          onClose={() =>
            setSelectedCandidate(
              null
            )
          }
        />
      )}

      {/* MODAL TREE */}

      {selectedTree && (
        <TreePreviewModal
          title={
            selectedTree.title
          }
          subtitle={
            `${selectedTree.social_works?.name || "Obra Social"} · ${selectedTree.billing_channel_name || "Circuito sin definir"}`
          }
          tree={
            selectedTree.tree_json
          }
          source={
            selectedTree
              .normatives
              ?.title
          }
          sourcePages={
            selectedTree.source_pages
          }
          confidence={
            selectedTree.confidence
          }
          onClose={() =>
            setSelectedTree(
              null
            )
          }
        />
      )}

      {/* EDITAR CANDIDATO */}

      {candidateEditor && (
        <EditorModal
          title="Editar sugerencia"
          value={
            candidateEditor
          }
          jsonField="generated_json"
          onChange={
            setCandidateEditor
          }
          onClose={() =>
            setCandidateEditor(
              null
            )
          }
          onSave={
            saveCandidateEditor
          }
          saving={
            actionLoading !=
            null
          }
        />
      )}

      {/* EDITAR ÁRBOL */}

      {treeEditor && (
        <EditorModal
          title="Editar árbol"
          value={
            treeEditor
          }
          jsonField="tree_json"
          onChange={
            setTreeEditor
          }
          onClose={() =>
            setTreeEditor(
              null
            )
          }
          onSave={
            saveTreeEditor
          }
          saving={
            actionLoading !=
            null
          }
        />
      )}

      {/* NUEVO */}

      {newTreeOpen && (
        <NewTreeModal
          value={
            newTree
          }
          socialWorks={
            socialWorks
          }
          normatives={manualNormatives}
          onChange={
            setNewTree
          }
          onClose={() =>
            setNewTreeOpen(
              false
            )
          }
          onSave={
            createManualTree
          }
          saving={
            actionLoading ===
            "new-tree"
          }
        />
      )}

    </div>
  );
}

/* =========================================================
   CANDIDATE CARD
   ========================================================= */

function CircuitBadge({ item }) {
  const label = item.circuit_ambiguous ? "Circuitos múltiples · revisar" : item.billing_channel_name || "Circuito sin definir";
  return <span className={"rounded-full px-2 py-1 text-[10px] font-semibold " + (item.billing_channel_name && !item.circuit_ambiguous ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800")}>{label}</span>;
}

function CandidateCard({
  candidate,
  loading,
  onView,
  onEdit,
  onApprove,
  onReject,
}) {
  return (
    <div className="min-w-0 rounded-[18px] border border-zinc-200 bg-white p-5 shadow-[0_5px_20px_rgba(40,25,55,.04)]">

      <div className="flex min-w-0 items-start gap-3">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">
          <Icon
            icon="fluent:sparkle-24-regular"
            width="22"
          />
        </div>

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap gap-2">

            <Badge
              type="purple"
            >
              SUGERIDO IA
            </Badge>

            <CircuitBadge item={candidate} />
            {candidate.confidence !=
              null && (
              <Badge
                type="green"
              >
                {Math.round(
                  Number(
                    candidate.confidence
                  ) *
                    100
                )}
                % confianza
              </Badge>
            )}

          </div>

          <h2 className="mt-3 break-words text-[16px] font-bold leading-5 text-[#21142b]">
            {
              candidate.title
            }
          </h2>

          <p className="mt-1 text-[13px] font-semibold text-[#8f2a85]">
            {candidate
              .social_works
              ?.name ||
              "Obra Social"}
          </p>

        </div>

      </div>

      {candidate.description && (
        <p className="mt-4 text-[13px] leading-5 text-zinc-600">
          {
            candidate.description
          }
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">

        <MetaBox
          label="Normativa"
          value={
            candidate
              .normatives
              ?.title ||
            "-"
          }
        />

        <MetaBox
          label="Fuente"
          value={
            candidate.source_pages
              ? `Pág./sección ${candidate.source_pages}`
              : "-"
          }
        />

      </div>

      <div className="mt-4 flex flex-wrap gap-2">

        <SecondaryButton
          onClick={
            onView
          }
          icon="fluent:eye-20-regular"
        >
          Ver árbol
        </SecondaryButton>

        <SecondaryButton
          onClick={
            onEdit
          }
          icon="fluent:edit-20-regular"
        >
          Editar sugerencia
        </SecondaryButton>

        <button
          type="button"
          disabled={
            Boolean(
              loading
            )
          }
          onClick={
            onApprove
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-[12px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Icon
            icon="fluent:checkmark-20-regular"
            width="15"
          />
          Aprobar
        </button>

        <button
          type="button"
          disabled={
            Boolean(
              loading
            )
          }
          onClick={
            onReject
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-[12px] font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
        >
          <Icon
            icon="fluent:dismiss-20-regular"
            width="15"
          />
          Rechazar
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   TREE CARD
   ========================================================= */

function TreeCard({
  tree,
  loading,
  onView,
  onEdit,
  onPublish,
  onApprove,
  onDuplicate,
  onArchive,
}) {
  return (
    <div className="min-w-0 rounded-[18px] border border-zinc-200 bg-white p-5 shadow-[0_5px_20px_rgba(40,25,55,.04)]">

      <div className="flex min-w-0 items-start gap-3">

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">
          <Icon
            icon="fluent:branch-fork-24-regular"
            width="22"
          />
        </div>

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap gap-2">

            <StatusBadge
              status={
                tree.status
              }
            />
            <CircuitBadge item={tree} />

            <Badge
              type={
                tree.origin ===
                "MANUAL"
                  ? "gray"
                  : "purple"
              }
            >
              {tree.origin ===
              "MANUAL"
                ? "MANUAL"
                : "DESDE NORMATIVA"}
            </Badge>

          </div>

          <h2 className="mt-3 break-words text-[16px] font-bold text-[#21142b]">
            {tree.title}
          </h2>

          <p className="mt-1 text-[13px] font-semibold text-[#8f2a85]">
            {tree
              .social_works
              ?.name ||
              "Obra Social"}
          </p>

        </div>

      </div>

      {tree.description && (
        <p className="mt-4 text-[13px] leading-5 text-zinc-600">
          {tree.description}
        </p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">

        <MetaBox
          label="Origen"
          value={
            tree.normatives
              ?.title ||
            (tree.origin ===
            "MANUAL"
              ? "Creación manual"
              : "-")
          }
        />

        <MetaBox
          label="Publicación"
          value={
            tree.published
              ? "Visible en sucursal"
              : "No publicado"
          }
        />

      </div>

      <div className="mt-4 flex flex-wrap gap-2">

        <SecondaryButton
          onClick={
            onView
          }
          icon="fluent:eye-20-regular"
        >
          Ver
        </SecondaryButton>

        <SecondaryButton
          onClick={
            onEdit
          }
          icon="fluent:edit-20-regular"
        >
          Editar
        </SecondaryButton>


{tree.status === "DRAFT" && (
  <SecondaryButton onClick={onApprove} icon="fluent:checkmark-20-regular">Aprobar</SecondaryButton>
)}
        <button
          type="button"
          disabled={
            Boolean(loading) || tree.status === "DRAFT"
          }
          onClick={
            onPublish
          }
          className={[
            "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[12px] font-semibold transition disabled:opacity-50",

            tree.published
              ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "bg-[#8f2a85] text-white hover:bg-[#782171]",
          ].join(" ")}
        >
          <Icon
            icon={
              tree.published
                ? "fluent:eye-off-20-regular"
                : "fluent:globe-20-regular"
            }
            width="15"
          />

          {tree.published
            ? "Despublicar"
            : "Publicar"}
        </button>

        <SecondaryButton
          onClick={
            onDuplicate
          }
          icon="fluent:copy-20-regular"
        >
          Duplicar
        </SecondaryButton>

        <button
          type="button"
          disabled={
            Boolean(
              loading
            )
          }
          onClick={
            onArchive
          }
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-50 px-3 text-[12px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
        >
          <Icon
            icon="fluent:archive-20-regular"
            width="15"
          />
          Archivar
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   TREE PREVIEW
   ========================================================= */

function TreePreviewModal({
  title,
  subtitle,
  tree,
  source,
  sourcePages,
  confidence,
  onClose,
}) {
  const nodes =
    Array.isArray(
      tree?.nodes
    )
      ? tree.nodes
      : [];

  return (
    <ModalShell
      onClose={
        onClose
      }
      maxWidth="max-w-3xl"
    >

      <div className="border-b border-zinc-200 px-5 py-4 sm:px-6">

        <div className="flex items-start justify-between gap-4">

          <div className="min-w-0">

            <p className="text-[12px] font-bold uppercase tracking-[.08em] text-[#8f2a85]">
              {subtitle ||
                "Árbol de decisión"}
            </p>

            <h2 className="mt-1 break-words text-xl font-bold text-[#21142b]">
              {title}
            </h2>

          </div>

          <CloseButton
            onClick={
              onClose
            }
          />

        </div>

      </div>

      <div className="max-h-[72vh] overflow-y-auto px-5 py-5 sm:px-6">

        <div className="mb-5 grid gap-2 sm:grid-cols-3">

          <MetaBox
            label="Fuente"
            value={
              source || "-"
            }
          />

          <MetaBox
            label="Página / sección"
            value={
              sourcePages ||
              "-"
            }
          />

          <MetaBox
            label="Confianza IA"
            value={
              confidence != null
                ? `${Math.round(
                    Number(
                      confidence
                    ) * 100
                  )}%`
                : "-"
            }
          />

        </div>

        {nodes.length ===
        0 ? (
          <EmptyState
            title="El árbol no tiene nodos"
            description="Editá el árbol para agregar decisiones e instrucciones."
          />
        ) : (
          <div className="space-y-3">

            {nodes.map(
              (
                node,
                index
              ) => (
                <NodePreview
                  key={
                    node.id ||
                    index
                  }
                  node={
                    node
                  }
                  index={
                    index
                  }
                  isStart={
                    node.id ===
                    tree.start_node
                  }
                />
              )
            )}

          </div>
        )}

      </div>

    </ModalShell>
  );
}

function NodePreview({
  node,
  index,
  isStart,
}) {
  const typeData = {
    question: {
      label:
        "Pregunta",
      icon:
        "fluent:question-circle-20-regular",
      className:
        "bg-[#f4ecf9] text-[#8f2a85]",
    },

    instruction: {
      label:
        "Instrucción",
      icon:
        "fluent:arrow-step-in-right-20-regular",
      className:
        "bg-blue-50 text-blue-700",
    },

    result: {
      label:
        "Resultado",
      icon:
        "fluent:checkmark-circle-20-regular",
      className:
        "bg-emerald-50 text-emerald-700",
    },
  };

  const meta =
    typeData[
      node.type
    ] ||
    typeData.instruction;

  return (
    <div className="rounded-[14px] border border-zinc-200 bg-white p-4">

      <div className="flex items-start gap-3">

        <div
          className={[
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            meta.className,
          ].join(" ")}
        >
          <Icon
            icon={
              meta.icon
            }
            width="18"
          />
        </div>

        <div className="min-w-0 flex-1">

          <div className="flex flex-wrap items-center gap-2">

            <span className="text-[10px] font-bold uppercase tracking-[.06em] text-zinc-400">
              Paso{" "}
              {index +
                1}
            </span>

            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-bold text-zinc-600">
              {
                meta.label
              }
            </span>

            {isStart && (
              <span className="rounded-full bg-[#93c01f]/15 px-2 py-0.5 text-[9px] font-bold text-[#648608]">
                INICIO
              </span>
            )}

          </div>

          <p className="mt-2 break-words text-[14px] font-semibold leading-5 text-zinc-800">
            {node.text ||
              "Sin contenido"}
          </p>

          {Array.isArray(
            node.options
          ) &&
            node.options
              .length >
              0 && (
              <div className="mt-3 flex flex-wrap gap-2">

                {node.options.map(
                  (
                    option,
                    optionIndex
                  ) => (
                    <div
                      key={
                        optionIndex
                      }
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600"
                    >
                      <strong className="text-zinc-800">
                        {
                          option.label
                        }
                      </strong>

                      {option.next && (
                        <>
                          {" "}
                          →{" "}
                          {
                            option.next
                          }
                        </>
                      )}
                    </div>
                  )
                )}

              </div>
            )}

          {!node.options &&
            node.next && (
            <p className="mt-2 text-[11px] text-zinc-400">
              Continúa en:{" "}
              <strong>
                {node.next}
              </strong>
            </p>
          )}

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   EDITOR MODAL
   ========================================================= */

function EditorModal({
  title,
  value,
  jsonField,
  onChange,
  onClose,
  onSave,
  saving,
}) {
  return (
    <ModalShell onClose={onClose} maxWidth="max-w-6xl">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8f2a85]">Editor visual · Sin JSON</p>
          <h2 className="mt-1 text-lg font-bold text-[#21142b]">{title}</h2>
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className="max-h-[calc(92vh-155px)] min-w-0 space-y-4 overflow-y-auto p-4 sm:p-6">
        <FormField label="Título">
          <input
            value={value.title || ""}
            onChange={event => onChange({ ...value, title: event.target.value })}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-[#8f2a85] focus:outline-none"
            maxLength={200}
          />
        </FormField>
        <FormField label="Descripción">
          <textarea
            value={value.description || ""}
            onChange={event => onChange({ ...value, description: event.target.value })}
            rows={2}
            className="w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-[#8f2a85] focus:outline-none"
          />
        </FormField>
        <FormField label="Páginas / sección fuente">
          <input
            value={value.source_pages || ""}
            onChange={event => onChange({ ...value, source_pages: event.target.value })}
            placeholder="Ej.: pág. 3 y 4"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm focus:border-[#8f2a85] focus:outline-none"
          />
        </FormField>

        <VisualTreeEditor
          value={value[jsonField]}
          onChange={tree => onChange(current => ({ ...current, [jsonField]: tree }))}
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-200 bg-white p-3 sm:p-4">
        <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
        <button
          type="button"
          disabled={saving}
          onClick={onSave}
          className="h-10 rounded-xl bg-[#8f2a85] px-4 text-sm font-semibold text-white hover:bg-[#75216f] disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </ModalShell>
  );
}

/* =========================================================
   NEW TREE
   ========================================================= */

function NewTreeModal({
  value,
  socialWorks,
  normatives = [],
  onChange,
  onClose,
  onSave,
  saving,
}) {
  return (
    <ModalShell
      onClose={
        onClose
      }
      maxWidth="max-w-xl"
    >

      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">

        <div>

          <p className="text-[11px] font-bold uppercase tracking-[.07em] text-[#8f2a85]">
            Creación manual
          </p>

          <h2 className="mt-1 text-lg font-bold text-[#21142b]">
            Nuevo árbol
          </h2>

        </div>

        <CloseButton
          onClick={
            onClose
          }
        />

      </div>

      <div className="space-y-4 p-5">

        <FormField
          label="Obra Social"
        >
          <select
            value={
              value.social_work_id
            }
            onChange={(event) =>
              onChange({
                ...value,
                social_work_id:
                  event.target
                    .value,
                normative_id: "",
              })
            }
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]"
          >
            <option value="">
              Seleccionar...
            </option>

            {socialWorks.map(
              (item) => (
                <option
                  key={
                    item.id
                  }
                  value={
                    item.id
                  }
                >
                  {item.name}
                </option>
              )
            )}

          </select>
        </FormField>

        <FormField label="Normativa de origen (para identificar el circuito)">
          <select value={value.normative_id || ""} onChange={event => onChange({ ...value, normative_id: event.target.value })}
            className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-[#8f2a85]">
            <option value="">Sin normativa · solo para reglas generales de un circuito único</option>
            {normatives.map(n => <option key={`${n.id}-${n.relation?.billing_channel_id}`} value={n.id}>
              {n.relation?.billing_channel?.name || "Circuito sin asignar"} · {n.original_filename || n.title} (#{n.id})
            </option>)}
          </select>
          <p className="mt-1 text-xs text-amber-700">Si la obra social tiene Cámara y Colegio, elegí la normativa del circuito. El servidor impedirá publicar un árbol ambiguo.</p>
        </FormField>

        <FormField
          label="Título"
        >
          <input
            value={
              value.title
            }
            onChange={(event) =>
              onChange({
                ...value,
                title:
                  event.target
                    .value,
              })
            }
            placeholder="Ej: ¿Cómo validar una receta?"
            className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-[#8f2a85]"
          />
        </FormField>

        <FormField
          label="Descripción"
        >
          <textarea
            value={
              value.description
            }
            onChange={(event) =>
              onChange({
                ...value,
                description:
                  event.target
                    .value,
              })
            }
            rows={4}
            className="w-full resize-none rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#8f2a85]"
          />
        </FormField>

        <div className="rounded-xl border border-[#8f2a85]/15 bg-[#faf6fb] p-4">

          <div className="flex gap-3">

            <Icon
              icon="fluent:info-20-regular"
              width="20"
              className="shrink-0 text-[#8f2a85]"
            />

            <p className="text-[12px] leading-5 text-zinc-600">
              El árbol se creará como borrador. Después podrás editar su estructura antes de publicarlo.
            </p>

          </div>

        </div>

      </div>

      <div className="flex justify-end gap-2 border-t border-zinc-200 p-4">

        <SecondaryButton
          onClick={
            onClose
          }
        >
          Cancelar
        </SecondaryButton>

        <button
          type="button"
          disabled={
            saving
          }
          onClick={
            onSave
          }
          className="h-10 rounded-xl bg-[#8f2a85] px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          Crear árbol
        </button>

      </div>

    </ModalShell>
  );
}

/* =========================================================
   UI HELPERS
   ========================================================= */

function StatCard({
  label,
  value,
  icon,
}) {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white p-4">

      <div className="flex items-center justify-between">

        <div>

          <p className="text-[11px] font-semibold text-zinc-400">
            {label}
          </p>

          <p className="mt-1 text-[25px] font-bold text-[#21142b]">
            {value}
          </p>

        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4ecf9] text-[#8f2a85]">
          <Icon
            icon={icon}
            width="21"
          />
        </div>

      </div>

    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-4 text-[13px] font-semibold transition",

        active
          ? "bg-[#8f2a85] text-white"
          : "text-zinc-500 hover:bg-zinc-50",
      ].join(" ")}
    >
      <Icon
        icon={icon}
        width="17"
      />

      {children}
    </button>
  );
}

function Badge({
  children,
  type = "gray",
}) {
  const map = {
    purple:
      "bg-[#f4ecf9] text-[#8f2a85]",

    green:
      "bg-emerald-50 text-emerald-700",

    gray:
      "bg-zinc-100 text-zinc-600",

    amber:
      "bg-amber-50 text-amber-700",
  };

  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-[9px] font-bold tracking-[.03em]",
        map[type],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function StatusBadge({
  status,
}) {
  const map = {
    DRAFT: {
      text:
        "BORRADOR",
      type:
        "gray",
    },

    APPROVED: {
      text:
        "APROBADO",
      type:
        "green",
    },

    PUBLISHED: {
      text:
        "PUBLICADO",
      type:
        "purple",
    },
  };

  const item =
    map[status] || {
      text:
        status,
      type:
        "gray",
    };

  return (
    <Badge
      type={
        item.type
      }
    >
      {item.text}
    </Badge>
  );
}

function MetaBox({
  label,
  value,
}) {
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

function SecondaryButton({
  onClick,
  icon,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-[12px] font-semibold text-zinc-600 transition hover:border-[#8f2a85]/20 hover:text-[#8f2a85]"
    >
      {icon && (
        <Icon
          icon={icon}
          width="15"
        />
      )}

      {children}
    </button>
  );
}

function ModalShell({
  children,
  maxWidth,
  onClose,
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-3 sm:p-5"
      onMouseDown={
        onClose
      }
    >
      <div
        className={[
          "max-h-[92vh] w-full overflow-hidden rounded-[18px] bg-white shadow-2xl",
          maxWidth ||
            "max-w-2xl",
        ].join(" ")}
        onMouseDown={(
          event
        ) =>
          event.stopPropagation()
        }
      >
        {children}
      </div>
    </div>
  );
}

function CloseButton({
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
    >
      <Icon
        icon="fluent:dismiss-20-regular"
        width="19"
      />
    </button>
  );
}

function FormField({
  label,
  children,
}) {
  return (
    <label className="block">

      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[.05em] text-zinc-500">
        {label}
      </span>

      {children}

    </label>
  );
}

function LoadingState() {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white py-16 text-center">

      <Icon
        icon="fluent:spinner-ios-20-regular"
        width="27"
        className="mx-auto animate-spin text-[#8f2a85]"
      />

      <p className="mt-3 text-sm text-zinc-500">
        Cargando árboles...
      </p>

    </div>
  );
}

function ErrorState({
  message,
}) {
  return (
    <div className="rounded-[16px] border border-red-200 bg-red-50 p-5">

      <p className="font-semibold text-red-700">
        No se pudo cargar el módulo
      </p>

      <p className="mt-1 text-sm text-red-600">
        {message}
      </p>

    </div>
  );
}

function EmptyState({
  title,
  description,
}) {
  return (
    <div className="rounded-[16px] border border-dashed border-zinc-300 bg-white px-5 py-12 text-center">

      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400">
        <Icon
          icon="fluent:branch-fork-24-regular"
          width="24"
        />
      </div>

      <p className="mt-3 font-semibold text-zinc-700">
        {title}
      </p>

      <p className="mx-auto mt-1 max-w-md text-[13px] leading-5 text-zinc-400">
        {description}
      </p>

    </div>
  );
}