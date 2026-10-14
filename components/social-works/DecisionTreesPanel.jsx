"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { treeApiFetch } from "../../lib/decision-trees/client";

const PAGE_SIZE = 10;
export default function DecisionTreesPanel({ socialWorkId, editable = false }) {
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [circuitFilter, setCircuitFilter] = useState("");
  const [menu, setMenu] = useState(null);
  const base = editable ? "/admin/arboles" : "/sucursal/arboles";

  useEffect(() => {
    setCircuitFilter("");
    setPage(1);
    setQuery("");
  }, [socialWorkId]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoading(true);
        setError("");
        const url = `/api/decision-trees?social_work_id=${encodeURIComponent(socialWorkId)}${editable ? "" : "&published=true"}`;
        const response = await treeApiFetch(url, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "No se pudieron consultar los árboles");
        if (mounted) setTrees(result.trees || []);
      } catch (err) {
        if (mounted) setError(err.message || "Error de carga");
      } finally { if (mounted) setLoading(false); }
    }
    if (socialWorkId) load();
    return () => { mounted = false; };
  }, [socialWorkId, editable]);

  const circuits = useMemo(() => [...new Map(trees.flatMap(t => t.social_work_circuits || []).map(ch => [String(ch.id), { id: String(ch.id), name: ch.name || `Circuito ${ch.id}` }])).values()], [trees]);
  // Al ingresar se muestran TODOS los árboles publicados de la obra social.
  // El circuito es un filtro opcional: nunca ocultar Colegio/Cámara por defecto.
  // Por seguridad, no mostrar en Sucursal árboles sin circuito inequívoco
  // cuando la obra social tiene múltiples circuitos.
  const safeTrees = useMemo(() => editable ? trees : trees.filter(t =>
    !t.circuit_ambiguous && !(t.social_work_has_multiple_channels && t.billing_channel_id == null)
  ), [trees, editable]);
  const filtered = useMemo(() => safeTrees.filter(t =>
    (!circuitFilter || (circuitFilter === "UNASSIGNED"
      ? t.billing_channel_id == null
      : String(t.billing_channel_id) === circuitFilter)) &&
    `${t.title} ${t.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())
  ), [safeTrees, query, circuitFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const shown = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const link = (tree, edit = false) => `${base}?social_work_id=${encodeURIComponent(socialWorkId)}&tree_id=${tree.id}${tree.billing_channel_id != null ? `&billing_channel_id=${tree.billing_channel_id}` : ""}${edit ? "&edit=1" : ""}`;

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-bold text-zinc-900">Árboles de decisión</h2>
          <p className="mt-1 text-[13px] text-zinc-500">
            {editable ? "Procedimientos específicos de esta obra social, pendientes de revisión o publicados." : "Procedimientos aprobados para resolver consultas paso a paso."}
          </p>
        </div>
        {editable && <Link href={`${base}?social_work_id=${encodeURIComponent(socialWorkId)}`} className="inline-flex items-center gap-2 rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#76216f]"><Icon icon="fluent:branch-fork-24-regular" width="18"/> Gestionar árboles</Link>}
      </div>
      {loading && <div className="rounded-2xl border bg-white p-5 text-sm text-zinc-500">Cargando árboles…</div>}
      {error && <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {!loading && !error && trees.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#ead4e9] bg-white p-8 text-center text-sm text-zinc-500">
          {editable ? "Esta obra social todavía no tiene árboles. Generá una propuesta desde una normativa o creá un borrador manual." : "Todavía no hay árboles publicados para esta obra social."}
        </div>
      )}
      {!loading && !error && trees.length > 0 && (
        <>
          {circuits.length > 1 && <div className="rounded-xl border border-[#e7d8e6] bg-[#fcf7fb] p-3">
            <label className="mb-2 block text-sm font-semibold text-[#4c2252]" htmlFor={`tree-circuit-${socialWorkId}`}>Filtrar por circuito</label>
            <select id={`tree-circuit-${socialWorkId}`} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm" value={circuitFilter} onChange={event => { setCircuitFilter(event.target.value); setPage(1); }}>
              <option value="">Todos los circuitos</option>
              {circuits.map(ch => <option key={ch.id} value={ch.id}>{ch.name}</option>)}
              {editable && <option value="UNASSIGNED">Sin circuito asignado</option>}
            </select>
          </div>}
          {!editable && circuits.length > 1 && !circuitFilter && <p className="text-xs text-zinc-500">Se muestran los procedimientos de todos los circuitos. Comprobá la etiqueta Colegio/Cámara antes de iniciar cada árbol.</p>}
          {filtered.length > 4 && (
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Buscar árbol…"
              className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-[#8f2a85]"
            />
          )}
          {!filtered.length && <p className="rounded-xl border bg-white p-4 text-sm text-zinc-600">No hay árboles para ese circuito o búsqueda.</p>}
          {filtered.length <= 4 ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {filtered.map(tree => (
                <article key={tree.id} className="min-w-0 rounded-[17px] border border-zinc-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-2"><Icon icon="fluent-emoji:herb" width="26"/><Status tree={tree}/></div>
                  <h3 className="mt-3 break-words font-semibold text-zinc-900">{tree.title}</h3>
                  <p className="mt-1 text-xs font-semibold text-[#8f2a85]">{tree.billing_channel_name || "Circuito sin definir · verificar"}</p>
                  {tree.description && <p className="mt-1 text-sm leading-5 text-zinc-500">{tree.description}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link className="rounded-lg border border-[#e8d8e6] px-3 py-2 text-xs font-semibold text-[#8f2a85] hover:bg-[#fcf6fb]" href={link(tree)}>Ver árbol</Link>
                    {editable && <Link className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50" href={link(tree, true)}>{tree.published ? "Crear nueva versión" : "Editar"}</Link>}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="overflow-visible rounded-[17px] border border-zinc-200 bg-white shadow-sm">
              {shown.map(tree => (
                <div key={tree.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-4 last:border-0 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-bold text-zinc-900">{tree.title}</h3><Status tree={tree}/></div>
                    <p className="mt-1 text-xs font-semibold text-[#8f2a85]">{tree.billing_channel_name || "Circuito sin definir · verificar"}</p>
                    {tree.description && <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{tree.description}</p>}
                  </div>
                  {editable ? (
                    <div className="relative shrink-0">
                      <button type="button" aria-label={`Acciones de ${tree.title}`} aria-expanded={menu === tree.id} className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 hover:bg-zinc-50" onClick={() => setMenu(menu === tree.id ? null : tree.id)}><Icon icon="fluent:more-horizontal-24-regular" width="22"/></button>
                      {menu === tree.id && <div className="absolute right-0 top-11 z-20 min-w-[200px] rounded-xl border border-zinc-200 bg-white p-1 shadow-xl">
                        <Link href={link(tree)} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-50">Ver recorrido</Link>
                        <Link href={link(tree, true)} className="block rounded-lg px-3 py-2 text-sm hover:bg-zinc-50">{tree.published ? "Nueva versión" : "Editar / gestionar"}</Link>
                        <Link href={`${base}?social_work_id=${encodeURIComponent(socialWorkId)}`} className="block rounded-lg px-3 py-2 text-sm text-[#8f2a85] hover:bg-[#fcf6fb]">Aprobar / publicar / archivar</Link>
                      </div>}
                    </div>
                  ) : <Link href={link(tree)} className="shrink-0 rounded-xl bg-[#8f2a85] px-4 py-2.5 text-xs font-semibold text-white">Recorrer →</Link>}
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-[#fcf9fc] px-4 py-3 text-xs text-zinc-600">
                <span>Página {currentPage} de {totalPages} · {filtered.length} árboles</span>
                <div className="flex gap-2">
                  <button disabled={currentPage === 1} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</button>
                  <button disabled={currentPage === totalPages} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40" onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Status({ tree }) {
  return <span className={["shrink-0 rounded-full px-2 py-1 text-[10px] font-bold", tree.published ? "bg-emerald-50 text-emerald-700" : tree.status === "APPROVED" ? "bg-[#f4e6f2] text-[#8f2a85]" : "bg-zinc-100 text-zinc-500"].join(" ")}>{tree.published ? "Publicado" : tree.status === "APPROVED" ? "Aprobado" : "Borrador"}</span>;
}
