"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { validateTree } from "../../lib/decision-trees/validate";

const STEP_NAMES = { question: "Pregunta", instruction: "Instrucción", result: "Resultado final" };
const STEP_COLORS = {
  question: "bg-[#f7eaf6] text-[#8f2a85]",
  instruction: "bg-blue-50 text-blue-700",
  result: "bg-emerald-50 text-emerald-700",
};
const FIELD = "w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10";
const OUTLINE_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40";
const VIOLET_BUTTON = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#8f2a85] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#75216f] disabled:cursor-not-allowed disabled:opacity-40";

function newId(nodes) {
  const used = new Set(nodes.map(n => String(n.id)));
  let i = 1;
  while (used.has(`n${i}`)) i++;
  return `n${i}`;
}

function formatStep(node, idx) {
  return `${idx + 1}. ${node.text?.trim() || `${STEP_NAMES[node.type] || "Paso"} sin texto`}`;
}

export default function VisualTreeEditor({ value, onChange }) {
  const tree = value && typeof value === "object" && !Array.isArray(value) ? value : { nodes: [], start_node: "" };
  const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
  const [selectedId, setSelectedId] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [route, setRoute] = useState([]);
  const selectedNode = nodes.find(n => n.id === selectedId) || nodes[0] || null;
  const selectedIndex = nodes.findIndex(n => n === selectedNode);
  const errors = validateTree(tree);
  const previewId = route.length ? route[route.length - 1] : tree.start_node;
  const previewNode = nodes.find(n => n.id === previewId);

  function patchTree(patch) { onChange({ ...tree, ...patch }); }
  function patchNodes(updated) { patchTree({ nodes: updated }); }
  function patchNode(id, patch) {
    patchNodes(nodes.map(n => n.id === id ? { ...n, ...patch } : n));
  }
  function addNode(type) {
    if (nodes.length >= 100) return;
    const id = newId(nodes);
    const node = { id, type, text: "" };
    if (type === "question") node.options = [{ label: "Sí", next: "" }, { label: "No", next: "" }];
    if (type === "instruction") node.next = "";
    patchTree({ nodes: [...nodes, node], start_node: tree.start_node || id });
    setSelectedId(id);
    setPreviewOpen(false);
    setRoute([]);
  }
  function changeType(n, type) {
    const { options, next, ...rest } = n;
    const node = { ...rest, type };
    if (type === "question") node.options = [{ label: "Sí", next: "" }, { label: "No", next: "" }];
    if (type === "instruction") node.next = "";
    patchNodes(nodes.map(p => p.id === n.id ? node : p));
  }
  function deleteNode(node) {
    const dependent = nodes.filter(n => n.id !== node.id && (n.next === node.id || n.options?.some(o => o.next === node.id)));
    if (dependent.length) {
      alert(`Antes de borrar este paso, cambiá las conexiones que llegan desde: ${dependent.map(n => n.text || n.id).join(", ")}.`);
      return;
    }
    if (node.id === tree.start_node && nodes.length > 1) {
      alert("Primero seleccioná otro paso como inicio del árbol.");
      return;
    }
    if (!window.confirm("¿Eliminar este paso?")) return;
    const next = nodes.filter(n => n.id !== node.id);
    patchTree({ nodes: next, start_node: next.length ? tree.start_node : "" });
    setSelectedId(next[0]?.id || null);
    setRoute([]);
  }
  function reorderNode(index, direction) {
    const nextIdx = index + direction;
    if (nextIdx < 0 || nextIdx >= nodes.length) return;
    const reordered = [...nodes];
    [reordered[index], reordered[nextIdx]] = [reordered[nextIdx], reordered[index]];
    patchNodes(reordered);
  }
  function patchOption(node, index, changes) {
    const options = (node.options || []).map((option, i) => i === index ? { ...option, ...changes } : option);
    patchNode(node.id, { options });
  }
  function removeOption(node, index) {
    if ((node.options || []).length <= 2) {
      alert("Cada pregunta debe tener al menos dos respuestas.");
      return;
    }
    patchNode(node.id, { options: node.options.filter((_, i) => i !== index) });
  }
  function addOption(node) {
    patchNode(node.id, { options: [...(node.options || []), { label: "", next: "" }] });
  }
  function destinationSelect(currentId, selected, callback) {
    return (
      <select className={FIELD} value={selected || ""} onChange={e => callback(e.target.value)}>
        <option value="">Elegí el siguiente paso…</option>
        {nodes.filter(n => n.id !== currentId).map(n => (
          <option key={n.id} value={n.id}>{formatStep(n, nodes.indexOf(n))}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-zinc-900">Constructor de recorrido</p>
          <p className="text-xs text-zinc-500">Editá las preguntas como un formulario. El sistema guarda la estructura automáticamente al pulsar «Guardar cambios».</p>
        </div>
        <button type="button" onClick={() => { setPreviewOpen(v => !v); setRoute([]); }} className={OUTLINE_BUTTON}>
          <Icon icon="fluent:play-circle-20-regular" width="16" />
          {previewOpen ? "Volver al editor" : "Probar recorrido"}
        </button>
      </div>

      {errors.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <p className="font-bold">{errors.length} {errors.length === 1 ? "detalle pendiente" : "detalles pendientes"} antes de aprobar o publicar</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">{errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}</ul>
          <p className="mt-2 text-amber-800">Podés guardar como borrador aunque falten pasos.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">
          <Icon icon="fluent:checkmark-circle-20-filled" width="18" />
          Recorrido completo a nivel estructural. Revisá siempre el contenido contra la normativa antes de aprobar.
        </div>
      )}

      {previewOpen ? (
        <div className="rounded-[18px] border border-[#e7d5e7] bg-white p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[#8f2a85]">Vista de Sucursal</p>
              <h3 className="mt-1 text-lg font-bold">Simulación del árbol</h3>
            </div>
            <button type="button" onClick={() => setRoute([])} className={OUTLINE_BUTTON}>
              <Icon icon="fluent:arrow-counterclockwise-20-regular" width="16" /> Reiniciar
            </button>
          </div>
          {!previewNode ? (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Elegí un paso inicial válido para comenzar la prueba.</p>
          ) : (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{STEP_NAMES[previewNode.type] || "Paso"}</p>
              <p className="text-lg font-semibold leading-7 text-zinc-900">{previewNode.text || "Este paso todavía no tiene texto."}</p>
              {previewNode.type === "question" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {(previewNode.options || []).map((o, i) => (
                    <button type="button" key={i} disabled={!o.next} onClick={() => setRoute(v => [...v, o.next])} className="min-h-[46px] rounded-xl border border-[#e6cfe4] bg-[#fdf7fd] px-4 py-3 text-sm font-semibold text-[#8f2a85] hover:bg-[#f8edf7] disabled:opacity-40">
                      {o.label || `Respuesta ${i + 1}`} <span aria-hidden="true">→</span>
                    </button>
                  ))}
                </div>
              )}
              {previewNode.type === "instruction" && (
                <button type="button" disabled={!previewNode.next} onClick={() => setRoute(v => [...v, previewNode.next])} className={VIOLET_BUTTON}>
                  Continuar <Icon icon="fluent:arrow-right-20-regular" width="16" />
                </button>
              )}
              {previewNode.type === "result" && (
                <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Fin del recorrido</p>
              )}
              {route.length > 0 && (
                <button type="button" className={OUTLINE_BUTTON} onClick={() => setRoute(v => v.slice(0, -1))}>
                  <Icon icon="fluent:arrow-left-20-regular" width="15" /> Volver a la pregunta anterior
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(230px,0.82fr)_minmax(0,1.6fr)]">
          <div className="min-w-0 rounded-[18px] border border-zinc-200 bg-[#fcfafd] p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-zinc-900">Pasos ({nodes.length})</p>
              <span className="text-[11px] text-zinc-500">Máx. 100</span>
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {nodes.map((n, index) => (
                <div key={n.id} className={`flex items-center gap-1 rounded-xl border p-1 ${selectedNode?.id === n.id ? "border-[#bd7eb7] bg-[#f7eaf6]" : "border-zinc-200 bg-white"}`}>
                  <button type="button" onClick={() => setSelectedId(n.id)} className="min-w-0 flex-1 rounded-lg px-2 py-2 text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#8f2a85]">Paso {index + 1}</span>
                      {tree.start_node === n.id && <span className="rounded-full bg-[#93c01f]/20 px-1.5 py-0.5 text-[9px] font-bold text-[#64830f]">INICIO</span>}
                    </div>
                    <p className="mt-0.5 truncate text-xs font-semibold text-zinc-900">{n.text || STEP_NAMES[n.type] || "Sin título"}</p>
                    <p className="text-[10px] text-zinc-500">{STEP_NAMES[n.type] || "Paso"}</p>
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <button type="button" disabled={index === 0} onClick={() => reorderNode(index, -1)} className="rounded p-1 text-zinc-500 hover:bg-white disabled:opacity-30" aria-label="Subir paso"><Icon icon="fluent:chevron-up-16-regular" width="16" /></button>
                    <button type="button" disabled={index === nodes.length - 1} onClick={() => reorderNode(index, 1)} className="rounded p-1 text-zinc-500 hover:bg-white disabled:opacity-30" aria-label="Bajar paso"><Icon icon="fluent:chevron-down-16-regular" width="16" /></button>
                  </div>
                </div>
              ))}
              {!nodes.length && <p className="rounded-xl bg-white p-4 text-xs text-zinc-500">Agregá una pregunta para comenzar tu recorrido.</p>}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-1">
              <button type="button" disabled={nodes.length >= 100} onClick={() => addNode("question")} className={VIOLET_BUTTON}>+ Pregunta</button>
              <button type="button" disabled={nodes.length >= 100} onClick={() => addNode("instruction")} className={OUTLINE_BUTTON}>+ Instrucción</button>
              <button type="button" disabled={nodes.length >= 100} onClick={() => addNode("result")} className={OUTLINE_BUTTON}>+ Resultado final</button>
            </div>
          </div>

          <div className="min-w-0 rounded-[18px] border border-zinc-200 bg-white p-4 sm:p-5">
            {!selectedNode ? (
              <p className="text-sm text-zinc-500">Seleccioná o agregá un paso para editarlo.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-bold uppercase ${STEP_COLORS[selectedNode.type] || "bg-zinc-100 text-zinc-700"}`}>{STEP_NAMES[selectedNode.type] || "Paso"}</span>
                    <h3 className="mt-2 text-lg font-bold text-zinc-900">Editar paso {selectedIndex + 1}</h3>
                  </div>
                  <button type="button" className="rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => deleteNode(selectedNode)}>Eliminar paso</button>
                </div>
                <label className="block text-xs font-semibold text-zinc-700">
                  Tipo de paso
                  <select value={selectedNode.type || "question"} onChange={e => changeType(selectedNode, e.target.value)} className={`${FIELD} mt-1.5`}>
                    <option value="question">Pregunta con opciones</option>
                    <option value="instruction">Instrucción / indicación</option>
                    <option value="result">Resultado final</option>
                  </select>
                </label>
                <label className="block text-xs font-semibold text-zinc-700">
                  {selectedNode.type === "question" ? "Pregunta que verá la sucursal" : selectedNode.type === "result" ? "Mensaje final para la sucursal" : "Instrucción para la sucursal"}
                  <textarea className={`${FIELD} mt-1.5 resize-y`} rows={3} maxLength={2000} placeholder="Escribí el contenido de este paso" value={selectedNode.text || ""} onChange={e => patchNode(selectedNode.id, { text: e.target.value })} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 p-3 text-xs font-semibold text-zinc-700">
                  <input type="radio" name="inicio-arbol" checked={tree.start_node === selectedNode.id} onChange={() => patchTree({ start_node: selectedNode.id })} className="accent-[#8f2a85]" />
                  Este es el primer paso del árbol
                </label>

                {selectedNode.type === "question" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-bold text-zinc-900">Respuestas posibles</h4>
                      <button type="button" className={OUTLINE_BUTTON} onClick={() => addOption(selectedNode)}>+ Agregar respuesta</button>
                    </div>
                    {(selectedNode.options || []).map((o, index) => (
                      <div key={index} className="rounded-xl border border-[#ebd9e9] bg-[#fffbff] p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-[#8f2a85]">Opción {index + 1}</p>
                          <button type="button" disabled={selectedNode.options.length <= 2} onClick={() => removeOption(selectedNode, index)} className="text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-30">Quitar</button>
                        </div>
                        <label className="mt-2 block text-xs font-semibold text-zinc-700">Texto de la respuesta
                          <input value={o.label || ""} onChange={e => patchOption(selectedNode, index, { label: e.target.value })} placeholder="Ej.: Sí / No" className={`${FIELD} mt-1`} />
                        </label>
                        <label className="mt-3 block text-xs font-semibold text-zinc-700">Si elige esta respuesta, ir a…
                          <div className="mt-1">{destinationSelect(selectedNode.id, o.next, next => patchOption(selectedNode, index, { next }))}</div>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
                {selectedNode.type === "instruction" && (
                  <label className="block text-xs font-semibold text-zinc-700">Al continuar, ir a…
                    <div className="mt-1.5">{destinationSelect(selectedNode.id, selectedNode.next, next => patchNode(selectedNode.id, { next }))}</div>
                  </label>
                )}
                {selectedNode.type === "result" && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">Este paso termina el recorrido. No necesita conectarse con otro.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
