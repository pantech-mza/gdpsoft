"use client";
import {useCallback,useEffect,useState} from 'react';
import {refreshStoredSession} from '../../../lib/client/session';
import OpenAiPilotSpend from '../../../components/admin/OpenAiPilotSpend';
async function getBranches(days,day){let token=sessionStorage.getItem('gdpsoft_access_token')||await refreshStoredSession();const q=`/api/admin/openai-usage/branches?days=${days}${day?`&day=${day}`:''}`;const req=t=>fetch(q,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});let r=await req(token);if(r.status===401)r=await req(await refreshStoredSession());const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||(r.status===404?'Falta publicar la ruta del gasto por sucursal (parche v3.13.108). Código 404.':`Error calculando el gasto por sucursal (código ${r.status})`));return j;}
async function getFull(fresh){let token=sessionStorage.getItem('gdpsoft_access_token')||await refreshStoredSession();const q=`/api/admin/openai-usage?days=350&usage_days=120${fresh?'&fresh=1':''}`;const req=t=>fetch(q,{headers:{Authorization:`Bearer ${t}`},cache:'no-store'});let r=await req(token);if(r.status===401)r=await req(await refreshStoredSession());const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw Error(j.error||'Error consultando OpenAI');return j;}
async function getAll(fresh){const [d,u]=await Promise.all([getFull(fresh),getBranches(350,'')]);return [d,u]}
export default function CostDashboard(){
 const [data,setData]=useState(null),[usage,setUsage]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async(fresh)=>{setLoading(true);setError('');try{const [d,u]=await getAll(fresh);setData(d);setUsage(u)}catch(e){setError(e.message)}finally{setLoading(false)}},[]);
 useEffect(()=>{load(false)},[load]);
 return <div className="mx-auto max-w-[1450px] space-y-4 pb-24"><header><p className="text-xs font-bold uppercase tracking-widest text-[#8f2a85]">Control de gastos · organización OpenAI</p><h1 className="mt-1 text-3xl font-black text-[#301a3a]">Gastos OpenAI</h1></header>
 {data&&!data.configured&&<p className="rounded-xl bg-amber-50 p-4 text-amber-800">No está configurada OPENAI_ADMIN_KEY.</p>}
 {(!data||data.configured)&&<OpenAiPilotSpend data={data} usage={usage} error={error} loading={loading} onRefresh={()=>load(true)}/>}
 </div>;
}
