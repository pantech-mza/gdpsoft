"use client";
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {refreshStoredSession} from '../../../lib/client/session';

const accent = '#8f2a85';
const fmtDate = x => x ? new Date(x).toLocaleString('es-AR') : '—';
const fmtNum = x => Number(x || 0).toLocaleString('es-AR');
const fmtMs = x => x == null ? '—' : (Number(x) / 1000).toFixed(1) + ' s';
const lbl = s => String(s||'').replaceAll('_',' ').toLowerCase();

async function authenticatedGet(url) {
  let token = sessionStorage.getItem('gdpsoft_access_token');
  if (!token) token = await refreshStoredSession();
  const call = accessToken => fetch(url, {
    cache:'no-store', headers:{Authorization:`Bearer ${accessToken}`}
  });
  let r = await call(token);
  // Nunca reintentar un 403 con otro usuario: es un permiso real.
  // Solo renovar ante 401 (token ausente, invalido o vencido).
  if (r.status === 401) {
    const fresh = await refreshStoredSession();
    r = await call(fresh);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `No se pudo consultar actividad (${r.status})`);
  return j;
}

function Stat({name,value,sub}) {
  return <div className="min-w-0 rounded-2xl border border-[#e9dfea] bg-white p-4 shadow-sm">
    <div className="text-xs font-semibold text-zinc-500">{name}</div>
    <div className="mt-1 text-2xl font-black tabular-nums text-[#8f2a85]">{value}</div>
    {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
  </div>;
}
function Bars({title,items,labelKey='name',maxItems=8}) {
  const data = (items||[]).slice(0,maxItems);
  const max = Math.max(1,...data.map(x=>Number(x.count)||0));
  return <section className="min-w-0 rounded-2xl border border-[#e9dfea] bg-white p-4">
    <h2 className="mb-4 text-sm font-bold text-zinc-900">{title}</h2>
    {!data.length && <p className="text-xs text-zinc-500">Sin consultas para este período.</p>}
    <div className="space-y-3">{data.map((x,i)=><div key={(x.id??x[labelKey]??i)+'_'+i}>
      <div className="mb-1 flex items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-zinc-700">{x[labelKey]||'No identificado'}</span><strong className="shrink-0 tabular-nums">{fmtNum(x.count)}</strong></div>
      <div className="h-2 overflow-hidden rounded-full bg-[#f1e7f1]"><div className="h-full rounded-full bg-[#8f2a85]" style={{width:`${Math.round((Number(x.count)||0)/max*100)}%`}}/></div>
    </div>)}</div>
  </section>;
}

export default function AdminActivityPage() {
  const [tab,setTab] = useState('live');
  const [branch,setBranch] = useState('');
  const [sw,setSw] = useState('');
  const [days,setDays] = useState('7');
  const [live,setLive] = useState(null);
  const [dashboard,setDashboard] = useState(null);
  const [liveError,setLiveError] = useState('');
  const [dashboardError,setDashboardError] = useState('');
  const [auto,setAuto] = useState(true);
  const [refreshing,setRefreshing] = useState(false);
  const [newIds,setNewIds] = useState([]);
  const seenIds = useRef(null);
  const filters=useMemo(()=>{
    const p=new URLSearchParams(); if(branch)p.set('branch_id',branch); if(sw)p.set('social_work_id',sw);return p;
  },[branch,sw]);
  const qs=filters.toString();

  const fetchLive=useCallback(async()=>{
    try {
      const j=await authenticatedGet('/api/admin/actividad'+(qs?'?'+qs:''));
      setLive(j);setLiveError('');
      const ids=new Set((j.rows||[]).map(r=>String(r.id)));
      if(seenIds.current!==null){setNewIds((j.rows||[]).filter(r=>!seenIds.current.has(String(r.id))).map(r=>String(r.id)));}
      seenIds.current=ids;
    } catch(e){setLiveError(e.message);}
  },[qs]);
  const fetchDashboard=useCallback(async()=>{
    try {
      const p=new URLSearchParams(qs);p.set('days',days);
      const j=await authenticatedGet('/api/admin/actividad/dashboard?'+p.toString());
      setDashboard(j);setDashboardError('');
    } catch(e){setDashboardError(e.message);}
  },[qs,days]);
  useEffect(()=>{seenIds.current=null;setNewIds([]);fetchLive();fetchDashboard();},[fetchLive,fetchDashboard]);
  useEffect(()=>{
    if(!auto)return;
    // Vista de actividad: refresco cada 5 segundos sin exponer filas directamente por Realtime.
    const id=setInterval(()=>{if(!document.hidden)fetchLive();},5000);
    return()=>clearInterval(id);
  },[auto,fetchLive]);
  useEffect(()=>{
    if(!auto)return;
    const id=setInterval(()=>{if(!document.hidden)fetchDashboard();},60000);
    return()=>clearInterval(id);
  },[auto,fetchDashboard]);
  const branches=useMemo(()=>Object.fromEntries((live?.branches||[]).map(x=>[x.id,x.name])),[live]);
  const works=useMemo(()=>Object.fromEntries((live?.social_works||[]).map(x=>[x.id,x.name])),[live]);
  const dash=dashboard?.dashboard||{};
  const t=dash.totals||{};
  const recent=live?.rows||[];
  const graph=days==='1' ? (dash.hourly||[]).map(x=>({name:String(x.hour).slice(11,16),count:x.count})) : (dash.daily||[]).map(x=>({name:x.day,count:x.count}));
  const freshCount=newIds.length;
  const nowFmt=live?.updated_at?new Date(live.updated_at).toLocaleTimeString('es-AR'): '—';
  async function refreshAll(){setRefreshing(true);try{await Promise.all([fetchLive(),fetchDashboard()]);}finally{setRefreshing(false);}}
  return <div className="mx-auto max-w-[1500px] space-y-5 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><div>
      <p className="text-xs font-black uppercase tracking-widest text-[#8f2a85]">Admin y Superadmin · Estadísticas</p>
      <h1 className="mt-1 text-2xl font-black text-zinc-900">Consultas de las sucursales</h1>
      <p className="mt-1 text-sm text-zinc-500">Consultas registradas en Supabase. Se excluyen las pruebas QA que estan identificadas como tales.</p>
    </div><div className="flex items-center gap-2 rounded-full border bg-white px-3 py-2 text-xs text-zinc-600"><span className={`h-2 w-2 rounded-full ${auto&&!liveError?'bg-emerald-500':'bg-amber-400'}`}/>{auto?'Actualización cada 5 s':'Pausada'} · {nowFmt}</div></header>
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4 shadow-sm">
      <label className="min-w-[180px] flex-1 text-xs font-bold text-zinc-700">Sucursal<select className="mt-1 block w-full rounded-xl border p-2.5 text-sm font-normal" value={branch} onChange={e=>setBranch(e.target.value)}><option value="">Todas las sucursales</option>{(live?.branches||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="min-w-[180px] flex-1 text-xs font-bold text-zinc-700">Obra social<select className="mt-1 block w-full rounded-xl border p-2.5 text-sm font-normal" value={sw} onChange={e=>setSw(e.target.value)}><option value="">Todas las obras sociales</option>{(live?.social_works||[]).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label className="min-w-[120px] text-xs font-bold text-zinc-700">Período del dashboard<select className="mt-1 block w-full rounded-xl border p-2.5 text-sm font-normal" value={days} onChange={e=>setDays(e.target.value)}><option value="1">24 horas</option><option value="7">7 días</option><option value="30">30 días</option></select></label>
      <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>En vivo</label>
      <button onClick={refreshAll} disabled={refreshing} className="rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{refreshing?'Actualizando…':'Actualizar'}</button>
    </div>
    <div className="flex flex-wrap gap-2"><button className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==='live'?'bg-[#8f2a85] text-white':'border bg-white text-zinc-700'}`} onClick={()=>setTab('live')}>Consultas en vivo {freshCount>0?`· ${freshCount} nuevas`:''}</button><button className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==='dashboard'?'bg-[#8f2a85] text-white':'border bg-white text-zinc-700'}`} onClick={()=>{setTab('dashboard');setNewIds([]);}}>Dashboard de datos</button></div>
    {liveError&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">Consultas: {liveError}</p>}
    {dashboardError&&<p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Dashboard: {dashboardError}</p>}
    {tab==='dashboard' && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Las pruebas QA registradas sin <code>traffic_type</code> continuan sumando al historico. Para diferenciarlas sin borrar consultas, revisa el archivo SQL de auditoria incluido en este parche.</p>}
    {tab==='live'?<>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat name="Consultas recientes" value={fmtNum(recent.length)} sub="Hasta 120, últimas 24 h"/>
        <Stat name="Nuevas desde la última revisión" value={fmtNum(freshCount)} sub="Se resaltan en el listado"/>
        <Stat name="Última actualización" value={nowFmt} sub="Refresco automático cada 5 segundos"/>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#e9dfea] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><h2 className="font-bold">Preguntas realizadas en sucursal</h2><span className="text-xs text-zinc-500">Solo consultas enviadas, no texto mientras escriben</span></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-[#f8f2f8] text-xs text-[#6f2767]"><tr>{['Fecha y hora','Sucursal','Obra social','Pregunta','Resultado','Tiempo','Respuesta'].map(x=><th className="px-3 py-3" key={x}>{x}</th>)}</tr></thead>
          <tbody>{recent.map(r=><tr key={r.id} className={`border-t align-top ${newIds.includes(String(r.id))?'bg-lime-50':''}`}>
            <td className="whitespace-nowrap px-3 py-3 text-xs">{fmtDate(r.created_at)}</td>
            <td className="px-3 py-3">{branches[r.branch_id]||'No identificada'}</td>
            <td className="px-3 py-3">{works[r.social_work_id]||'No identificada'}</td>
            <td className="max-w-[360px] whitespace-pre-wrap break-words px-3 py-3 font-semibold">{r.question||'—'}</td>
            <td className="px-3 py-3"><span className={r.error_code||r.status==='ERROR'?'font-bold text-red-700':r.found===false?'font-bold text-amber-700':'text-emerald-700'}>{r.error_code?'Error: '+r.error_code:r.found===false?'Sin respuesta':r.status==='ERROR'?'Error':'Respondida'}</span></td>
            <td className="whitespace-nowrap px-3 py-3">{fmtMs(r.elapsed_ms)}</td>
            <td className="max-w-[300px] px-3 py-3"><details><summary className="cursor-pointer text-[#8f2a85]">Ver respuesta</summary><p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed">{r.answer||'Sin respuesta registrada'}</p><p className="mt-2 text-xs text-zinc-400">{r.source||r.route||''}</p></details></td>
          </tr>)}</tbody></table></div>
        {recent.length===0&&<p className="p-5 text-sm text-zinc-500">No hay consultas registradas en las últimas 24 horas para estos filtros.</p>}
      </section>
    </>:<>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat name="Consultas" value={fmtNum(t.total)} sub={`${days} día(s)`}/>
        <Stat name="Sucursales que consultaron" value={fmtNum(t.branches_active)}/>
        <Stat name="Sin respuesta" value={fmtNum(t.no_answer)}/>
        <Stat name="Errores" value={fmtNum(t.errors)}/>
        <Stat name="Más de 6 s" value={fmtNum(t.slow)}/>
        <Stat name="Promedio" value={fmtMs(t.avg_ms)}/>
        <Stat name="P95" value={fmtMs(t.p95_ms)}/>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Bars title="Volumen de consultas" items={graph}/>
        <Bars title="Consultas por sucursal" items={dash.by_branch||[]}/>
        <Bars title="Obras sociales más consultadas" items={dash.by_social_work||[]}/>
        <Bars title="Temas / preguntas frecuentes" items={dash.frequent_questions||[]} labelKey="question" maxItems={10}/>
        <Bars title="Cómo respondió el asistente" items={dash.by_route||[]} labelKey="route"/>
        <section className="rounded-2xl border border-[#e9dfea] bg-white p-4"><h2 className="text-sm font-bold">Consumo e indicadores</h2><p className="mt-3 text-sm">Consultas con imágenes: <strong>{fmtNum(t.images)}</strong></p><p className="mt-2 text-sm">Costo estimado registrado: <strong>USD {Number(t.cost_usd||0).toFixed(4)}</strong></p><p className="mt-3 text-xs text-zinc-500">El costo aparece solo si la consulta guarda el campo de estimación. Las métricas son agregadas en Supabase sobre todo el período; no se calculan a partir de las 120 filas recientes.</p><p className="mt-2 text-xs text-zinc-500">Última actualización: {fmtDate(dashboard?.updated_at)} · automática cada 60 s.</p></section>
      </div>
    </>}
    <p className="text-xs text-zinc-500">Acceso restringido a Admin/Superadmin. El contenido puede incluir datos ingresados por operadores; evitá reproducir datos personales de pacientes en pruebas. Los registros existentes anteriores a la clasificación de QA podrían incluir pruebas.</p>
  </div>;
}
