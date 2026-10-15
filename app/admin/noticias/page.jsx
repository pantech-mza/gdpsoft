'use client';
import { useCallback,useEffect,useState } from 'react';
import { refreshStoredSession } from '../../../lib/client/session';
const input='w-full rounded-xl border border-[#e5d9e6] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8f2a85]';
const btn='rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#72216b]';
export default function NoticiasAdmin(){
 const [branches,setBranches]=useState([]),[notices,setNotices]=useState([]),[all,setAll]=useState(true),[chosen,setChosen]=useState([]),[title,setTitle]=useState(''),[body,setBody]=useState(''),[severity,setSeverity]=useState('IMPORTANT'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('');
 const request=useCallback(async (url,options={})=>{
   let token=sessionStorage.getItem('gdpsoft_access_token')||await refreshStoredSession();
   const make=t=>fetch(url,{...options,cache:'no-store',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json',...options.headers}});
   let r=await make(token);if(r.status===401)r=await make(await refreshStoredSession());
   const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Error de comunicación');return j;
 },[]);
 const reload=useCallback(async()=>{try{const d=await request('/api/admin/noticias');setBranches(d.branches||[]);setNotices(d.notices||[]);}catch(e){setError(e.message);}},[request]);
 useEffect(()=>{reload();},[reload]);
 const toggle=id=>setChosen(x=>x.includes(id)?x.filter(v=>v!==id):[...x,id]);
 async function publish(e){e.preventDefault();if(!all&&!chosen.length){setError('Seleccioná las sucursales destinatarias.');return;}if(!confirm('¿Publicar este aviso ahora en las sucursales seleccionadas?'))return;
   setBusy(true);setError('');setInfo('');try{await request('/api/admin/noticias',{method:'POST',body:JSON.stringify({title,body,severity,all_branches:all,branch_ids:chosen})});setTitle('');setBody('');setChosen([]);setInfo('Aviso publicado. Las PCs lo verán en un máximo de 20 segundos o al abrir su pantalla.');await reload();}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function republish(id){
   if(!confirm('¿Volver a mostrar este aviso en todas las PCs destinatarias? Los cierres anteriores dejarán de aplicarse.'))return;
   setBusy(true);setError('');try{await request('/api/admin/noticias',{method:'PATCH',body:JSON.stringify({id,action:'republish'})});await reload();setInfo('Aviso reactivado: volverá a mostrarse en las PCs destinatarias.');}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function removeNotice(id){
   if(!confirm('¿Eliminar definitivamente este aviso y sus registros de cierre? Esta acción no se puede deshacer.'))return;
   setBusy(true);setError('');try{await request('/api/admin/noticias',{method:'DELETE',body:JSON.stringify({id})});await reload();setInfo('Aviso eliminado.');}catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function archive(id){if(!confirm('¿Archivar este aviso para todas las sucursales?'))return;setBusy(true);try{await request('/api/admin/noticias',{method:'PATCH',body:JSON.stringify({id,action:'archive'})});await reload();setInfo('Aviso archivado.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="mx-auto max-w-[1250px] space-y-6">
   <div><p className="text-xs font-bold uppercase tracking-widest text-[#8f2a85]">Comunicaciones internas</p><h1 className="mt-1 text-2xl font-bold text-zinc-900">Noticias y notificaciones</h1><p className="text-sm text-zinc-500">Cada dispositivo conserva sus avisos hasta que el operador los cierre. El cierre de una PC no afecta a las demás.</p></div>
   {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</div>}{info&&<div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-green-800">{info}</div>}
   <form onSubmit={publish} className="space-y-4 rounded-2xl border border-[#eaddeb] bg-white p-5 shadow-sm">
     <h2 className="text-lg font-bold">Nueva comunicación</h2>
     <div className="grid gap-3 sm:grid-cols-[1fr_200px]"><label className="text-sm font-medium">Título<input required minLength={3} maxLength={140} className={`${input} mt-1`} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: Importante — mantenimiento del validador"/></label><label className="text-sm font-medium">Prioridad<select className={`${input} mt-1`} value={severity} onChange={e=>setSeverity(e.target.value)}><option value="INFO">Información</option><option value="IMPORTANT">Importante</option><option value="URGENT">Urgente</option></select></label></div>
     <label className="block text-sm font-medium">Mensaje completo<textarea required rows={5} minLength={3} maxLength={4000} className={`${input} mt-1`} value={body} onChange={e=>setBody(e.target.value)} placeholder="Describí qué deben saber o hacer las sucursales."/></label>
     <fieldset className="space-y-3"><legend className="text-sm font-bold">Destinatarios</legend><label className="flex items-center gap-2 text-sm"><input type="radio" checked={all} onChange={()=>setAll(true)}/>Todas las sucursales actuales y futuras</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={!all} onChange={()=>setAll(false)}/>Seleccionar sucursales específicas</label>
       {!all&&<div className="grid max-h-52 grid-cols-1 gap-2 overflow-auto rounded-xl border p-3 sm:grid-cols-3">{branches.map(b=><label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(b.id)} onChange={()=>toggle(b.id)}/>{b.name}</label>)}</div>}
     </fieldset>
     <button disabled={busy} className={btn}>{busy?'Publicando…':'Publicar notificación'}</button>
   </form>
   <section className="rounded-2xl border border-[#eaddeb] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Avisos creados</h2><button onClick={reload} className="rounded-lg border px-3 py-1.5 text-sm">Actualizar</button></div>
    <div className="mt-3 space-y-3">{notices.length===0&&<p className="text-sm text-zinc-500">Todavía no hay noticias.</p>}{notices.map(n=><article key={n.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{n.title}</h3><p className="text-xs text-zinc-500">{new Date(n.created_at).toLocaleString('es-AR')} · {n.all_branches?'Todas las sucursales':`${n.branch_ids.length} sucursales`} · {n.closed_devices} dispositivos la cerraron · {n.published?'Publicada':'Archivada'}</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>republish(n.id)} className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-semibold text-[#8f2a85]">Volver a mostrar</button>{n.published&&<button disabled={busy} onClick={()=>archive(n.id)} className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800">Archivar</button>}<button disabled={busy} onClick={()=>removeNotice(n.id)} className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-800">Eliminar</button></div></div><p className="mt-2 whitespace-pre-wrap break-words text-sm">{n.body}</p></article>)}</div>
   </section>
 </div>;
}
