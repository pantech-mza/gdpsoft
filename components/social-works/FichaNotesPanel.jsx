"use client";
import { useCallback, useEffect, useState } from "react";
import { refreshStoredSession } from "../../lib/client/session";

async function noteFetch(socialWorkId, path = "", options = {}) {
  const token = sessionStorage.getItem("gdpsoft_access_token") || await refreshStoredSession();
  const send = (value) => fetch(`/api/social-works/${socialWorkId}/notes${path}`, {
    ...options, cache:"no-store",
    headers:{...options.headers, "Content-Type":"application/json", Authorization:`Bearer ${value}`},
  });
  let response=await send(token);
  if (response.status===401) response=await send(await refreshStoredSession());
  const result=await response.json().catch(()=>({}));
  if (!response.ok || !result.ok) throw Error(result.error || "No se pudo consultar observaciones");
  return result;
}
const isProtected = n => n.kind === "ACCESS";

export default function FichaNotesPanel({socialWorkId,editable=false,legacyObservations=null}) {
  const [notes,setNotes]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [editor,setEditor]=useState(null),[busy,setBusy]=useState(false),[visible,setVisible]=useState({});
  const load=useCallback(async()=>{
    if (!socialWorkId) return;
    setLoading(true);setError("");
    try {setNotes((await noteFetch(socialWorkId)).notes||[]);}catch(e){setError(e.message)}finally{setLoading(false)}
  },[socialWorkId]);
  useEffect(()=>{load();setVisible({});},[load]);
  const reveal=async(note)=>{
    if (visible[note.id]) {setVisible(v=>({...v,[note.id]:null}));return;}
    try {const j=await noteFetch(socialWorkId,`?reveal=${note.id}`);setVisible(v=>({...v,[note.id]:j.body}));}
    catch(e){setError(e.message)}
  };
  const beginEdit=async note=>{
    setError("");
    if (!note) {setEditor({id:null,kind:"GENERAL",body:""});return;}
    let body=note.body;
    if (isProtected(note)) {
      try {body=(await noteFetch(socialWorkId,`?reveal=${note.id}`)).body;}
      catch(e){setError(e.message);return;}
    }
    setEditor({id:note.id,kind:note.kind,body:body||""});
  };
  const save=async()=>{
    if (!editor?.body?.trim()) {setError("Escribí el contenido de la observación.");return;}
    setBusy(true);setError("");
    try {
      await noteFetch(socialWorkId,"",{method:editor.id?"PATCH":"POST",body:JSON.stringify(editor)});
      setEditor(null);setVisible({});await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  };
  const remove=async note=>{
    if (!window.confirm("¿Eliminar esta observación? Esta acción no se puede deshacer."))return;
    setBusy(true);setError("");
    try {await noteFetch(socialWorkId,"",{method:"DELETE",body:JSON.stringify({id:note.id})});setVisible({});await load();}
    catch(e){setError(e.message)}finally{setBusy(false)}
  };
  return <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-amber-950">Observaciones y accesos</h3>
        <p className="text-xs text-amber-800">Notas históricas pendientes de validar o instrucciones aprobadas por Administración.</p></div>
      {editable&&<button type="button" onClick={()=>beginEdit(null)} className="rounded-lg bg-[#8f2a85] px-3 py-2 text-xs font-semibold text-white">+ Agregar observación</button>}
    </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {loading&&<p className="text-xs text-amber-800">Cargando observaciones…</p>}
    {!loading&&!notes.length&&!legacyObservations&&<p className="text-sm text-amber-800">No hay observaciones cargadas.</p>}
    {legacyObservations&&<div className="rounded-xl border border-amber-200 bg-white p-3"><p className="text-[11px] font-semibold uppercase text-amber-800">Observación de ficha existente</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-700">{legacyObservations}</p></div>}
    {notes.map(note=><article key={note.id} className="rounded-xl border border-amber-200 bg-white p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2"><p className="text-[11px] font-bold uppercase tracking-wide text-zinc-600">
        {isProtected(note)?"Acceso al sistema":"Observación operativa"}
        {note.review_status === "PENDING"&&<span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 normal-case text-amber-800">Histórica · pendiente de revisión</span>}
      </p>{editable&&<div className="flex gap-3"><button type="button" className="text-xs font-semibold text-[#8f2a85]" onClick={()=>beginEdit(note)}>Editar</button><button type="button" className="text-xs font-semibold text-red-700" disabled={busy} onClick={()=>remove(note)}>Eliminar</button></div>}</div>
      {isProtected(note) ? <div className="space-y-2"><p className="text-xs text-zinc-500">Información restringida. No se envía al asistente IA.</p>
        {visible[note.id]&&<p className="whitespace-pre-wrap break-words rounded-lg bg-zinc-50 p-3 text-sm text-zinc-800">{visible[note.id]}</p>}
        <button type="button" onClick={()=>reveal(note)} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700">{visible[note.id]?"Ocultar acceso":"Mostrar acceso"}</button></div>
        : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-800">{note.body}</p>}
    </article>)}
    {editable&&editor&&<div role="dialog" aria-modal="true" aria-label="Editar observación" className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <h3 className="font-semibold text-zinc-900">{editor.id?"Editar observación":"Nueva observación"}</h3>
      <label className="block text-xs font-semibold text-zinc-700">Tipo
        <select className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" value={editor.kind} onChange={e=>setEditor(v=>({...v,kind:e.target.value}))}>
          <option value="GENERAL">Observación operativa</option><option value="ACCESS">Datos de acceso / credenciales</option>
        </select></label>
      <label className="block text-xs font-semibold text-zinc-700">Contenido
        <textarea autoComplete="off" spellCheck={false} rows={7} maxLength={10000} value={editor.body} onChange={e=>setEditor(v=>({...v,body:e.target.value}))} className="mt-1 block w-full resize-y rounded-lg border border-zinc-200 p-3 text-sm" />
      </label>
      <p className="text-xs text-zinc-500">Las notas de acceso solo se muestran a usuarios autenticados bajo demanda. No las copies a campos generales de Ficha.</p>
      <div className="flex justify-end gap-2"><button type="button" onClick={()=>setEditor(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?"Guardando…":"Guardar"}</button></div>
    </div></div>}
  </section>;
}
