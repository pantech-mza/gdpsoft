import fs from "node:fs";
import path from "node:path";

export function loadEnv() {
  const file=path.resolve(process.cwd(),".env.local");
  if(!fs.existsSync(file)) return;
  for(const raw of fs.readFileSync(file,"utf8").split(/\r?\n/)){
    const line=raw.trim(); if(!line || line.startsWith("#")) continue;
    const i=line.indexOf("="); if(i<1) continue;
    const k=line.slice(0,i).trim(), v=line.slice(i+1).trim().replace(/^['\"]|['\"]$/g,"");
    if(!(k in process.env)) process.env[k]=v;
  }
}
export const BASE_URL=()=>process.env.QA_BASE_URL || "http://localhost:3000";
export const SECRET=()=>process.env.QA_RUNNER_SECRET || "";
export async function qaFetch(url, options={}){
  const headers={...(options.headers||{}),"x-qa-secret":SECRET()};
  const r=await fetch(BASE_URL()+url,{...options,headers}); const text=await r.text(); let data;
  try{data=text?JSON.parse(text):{};}catch{throw new Error(`${url} devolvió no JSON: ${text.slice(0,160)}`)}
  if(!r.ok || data?.ok===false) throw new Error(data?.error || `${url} HTTP ${r.status}`); return data;
}
export async function startRun(suite,name,metadata={}){return (await qaFetch('/api/admin/qa/runner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',suite,name,metadata})})).run;}
export async function saveResult(runId,result){return qaFetch('/api/admin/qa/runner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'result',runId,result})});}
export async function finishRun(runId){return (await qaFetch('/api/admin/qa/runner',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finish',runId})})).run;}
export function normalize(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
