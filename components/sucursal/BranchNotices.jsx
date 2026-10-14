'use client';
import { useCallback, useEffect, useState } from 'react';
import { refreshStoredSession } from '../../lib/client/session';
const severityClass={INFO:'border-sky-200 bg-sky-50 text-sky-950',IMPORTANT:'border-amber-300 bg-amber-50 text-amber-950',URGENT:'border-red-400 bg-red-50 text-red-950'};
export default function BranchNotices(){
  const [notices,setNotices]=useState([]),[error,setError]=useState(''),[closing,setClosing]=useState(null);
  const request=useCallback(async (url,opts={})=>{
    let token=sessionStorage.getItem('gdpsoft_access_token')||await refreshStoredSession();
    const make=t=>fetch(url,{...opts,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:`Bearer ${t}`,...opts.headers}});
    let r=await make(token);
    if(r.status===401) r=await make(await refreshStoredSession());
    const j=await r.json(); if(!r.ok||!j.ok) throw new Error(j.error||'Error al consultar noticias');return j;
  },[]);
  const reload=useCallback(async()=>{
    const uuid=localStorage.getItem('gdpsoft_device_uuid');
    if(!uuid){setError('No se identificó esta PC. Ingresá nuevamente para registrar el dispositivo.');return;}
    try{const j=await request(`/api/noticias?device_uuid=${encodeURIComponent(uuid)}`);setNotices(j.notices||[]);setError('');}
    catch(e){setError(e.message);}
  },[request]);
  useEffect(()=>{
    reload();
    const id=setInterval(()=>{if(!document.hidden) reload();},20000);
    const onVisible=()=>{if(!document.hidden) reload();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{clearInterval(id);document.removeEventListener('visibilitychange',onVisible);};
  },[reload]);
  async function acknowledge(id){
    setClosing(id);
    try{
      const uuid=localStorage.getItem('gdpsoft_device_uuid');
      await request('/api/noticias',{method:'POST',body:JSON.stringify({notice_id:id,device_uuid:uuid})});
      setNotices(rows=>rows.filter(x=>x.id!==id));setError('');
    }catch(e){setError('No se pudo registrar la lectura: '+e.message);}finally{setClosing(null);}
  }
  if(!notices.length&&!error)return null;
  return <aside role="region" aria-label="Avisos de Farmacias del Plata" className="pointer-events-none fixed right-3 top-20 z-[95] w-[min(410px,calc(100vw-24px))] space-y-3 sm:right-6">
    {error&&<div role="alert" className="pointer-events-auto rounded-xl border border-red-300 bg-white p-3 text-sm text-red-700 shadow-lg">{error}</div>}
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
      {notices.map(n=><div key={n.id} className={`pointer-events-auto rounded-2xl border-2 p-4 shadow-xl ${severityClass[n.severity]||severityClass.INFO}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><div className="text-[10px] font-black uppercase tracking-[.12em]">📣 {n.severity==='URGENT'?'URGENTE':n.severity==='IMPORTANT'?'IMPORTANTE':'NOTICIA'}</div><h3 className="mt-1 text-[15px] font-bold">{n.title}</h3></div>
          <button type="button" disabled={closing===n.id} title="Marcar como leído en esta PC" aria-label={`Cerrar aviso ${n.title} en este dispositivo`} onClick={()=>acknowledge(n.id)} className="shrink-0 rounded-lg border border-current/25 bg-white/75 px-2.5 py-1 text-lg font-bold hover:bg-white disabled:opacity-40">×</button>
        </div>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{n.body}</div>
        <p className="mt-3 text-[11px] opacity-70">Visible hasta que se cierre en esta PC · {new Date(n.created_at).toLocaleString('es-AR')}</p>
      </div>)}
    </div>
  </aside>;
}
