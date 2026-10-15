"use client";
import { useState } from "react";
import { refreshStoredSession } from "../../lib/client/session";
const TEXT_FIELDS=[
  ["plan","Plan"],["recipe_type","Tipo de receta"],["validator_name","Validador"],
  ["validator_type","¿Por dónde valida?"],["letterhead","Membrete"],
  ["diagnosis","Diagnóstico"],["monodrug","Monodroga"],
  ["commercial_name","Nombre comercial"],["substitution","Sustitución"],
];
export default function FichaEditor({socialWork,onClose,onSaved}) {
  const [values,setValues]=useState(()=>Object.fromEntries([
    ...TEXT_FIELDS.map(([key])=>[key,socialWork[key]??""]),
    ["recipe_validity_days",socialWork.recipe_validity_days??""],["rp",socialWork.rp??""],
  ]));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const save=async()=>{
    setBusy(true);setError("");
    try {
      const send=token=>fetch(`/api/social-works/${socialWork.id}`,{
        method:"PATCH",cache:"no-store",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},
        body:JSON.stringify(values),
      });
      let token=sessionStorage.getItem("gdpsoft_access_token")||await refreshStoredSession();
      let response=await send(token);
      if (response.status===401)response=await send(await refreshStoredSession());
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw Error(result.error||"No se pudo guardar la ficha");
      onSaved(result.social_work);
    }catch(e){setError(e.message)}finally{setBusy(false)}
  };
  return <div role="dialog" aria-modal="true" aria-label="Editar ficha" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-6">
    <div className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-[#301a3a]">Editar Recordá / Ficha</h2><p className="mt-1 text-xs text-zinc-500">{socialWork.name} · App ID {socialWork.id} · ID cliente {socialWork.id_soft??"—"}</p></div><button type="button" onClick={onClose} aria-label="Cerrar" className="text-lg text-zinc-500">×</button></div>
      {error&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map(([field,label])=><label key={field} className="block text-xs font-semibold text-zinc-600">{label}
          <input value={values[field]} onChange={e=>setValues(v=>({...v,[field]:e.target.value}))} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-800"/>
        </label>)}
        {[["recipe_validity_days","Vigencia (días)"],["rp","Cantidad RP"]].map(([field,label])=><label key={field} className="block text-xs font-semibold text-zinc-600">{label}
          <input type="number" min="0" step="1" value={values[field]} onChange={e=>setValues(v=>({...v,[field]:e.target.value}))} className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2.5 text-sm text-zinc-800"/>
        </label>)}
      </div>
      <p className="mt-4 text-xs text-zinc-500">El nombre de la obra social, sus identificadores, estado y normativas asociadas no se modifican desde este formulario. Las observaciones se gestionan por separado.</p>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={busy} onClick={save} className="rounded-lg bg-[#8f2a85] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy?"Guardando…":"Guardar cambios"}</button></div>
    </div>
  </div>;
}
