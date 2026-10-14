/**
 * GDPSoft: auditoría semántica de cada nodo de propuestas IA contra su
 * documento EXACTO (normative_id + file_id), sin escribir en Supabase.
 * Uso: node --env-file=.env.local scripts/qa/audit-tree-steps.mjs --limit=5
 *      ... --all   (costo OpenAI; correr primero --limit=5)
 *      ... --social-work=153   ... --normative=153
 *      ... --candidate=2   (auditar solo la propuesta #2, sin repetir las otras)
 *      ... --offset=5 --limit=25  (auditar 25 propuestas desde posición 5)
 * Salida JSON + CSV en qa/results. No aprueba ni publica.
 */
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import {createClient} from '@supabase/supabase-js';
import {batchSearchQueries,interleaveSearchResults} from './tree-evidence-utils.mjs';
import {nextCandidatePage} from './tree-audit-pagination.mjs';
const args=process.argv.slice(2);
const param=k=>args.find(x=>x.startsWith(`--${k}=`))?.slice(k.length+3);
const all=args.includes('--all');
const offset=Math.max(0,Number(param('offset')||0));
const limit=all?2000:Math.max(1,Math.min(500,Number(param('limit')||5)));
const socialWorkId=param('social-work')?Number(param('social-work')):null;
const normativeId=param('normative')?Number(param('normative')):null;
const candidateId=param('candidate')?Number(param('candidate')):null;
const url=process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const key=process.env.OPENAI_API_KEY;
if(!url||!secret||!key)throw new Error('Faltan SUPABASE_URL, SUPABASE_SECRET_KEY u OPENAI_API_KEY');
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const openai=new OpenAI({apiKey:key,maxRetries:1,timeout:120000});
const model=process.env.GDP_TREE_AUDIT_MODEL||'gpt-4.1-mini';
const cache=new Map();
const rows=[];
const overview=[];
const processedCandidates=new Set();
const MAX_NODES=100;
const STATUS=['SUPPORTED','CONTRADICTED','INSUFFICIENT_EVIDENCE'];
function parseOutput(res){if(res.output_text?.trim())return res.output_text.trim();return (res.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('').trim();}
const fmt={type:'json_schema',name:'audit_tree',strict:true,schema:{type:'object',additionalProperties:false,properties:{reviews:{type:'array',items:{type:'object',additionalProperties:false,properties:{node_id:{type:'string'},status:{type:'string',enum:STATUS},reason:{type:'string'},evidence_ids:{type:'array',items:{type:'string'}}},required:['node_id','status','reason','evidence_ids']}},global_notes:{type:'string'}},required:['reviews','global_notes']}};
async function source(normId){
 if(cache.has(normId))return cache.get(normId);
 const [n,links]=await Promise.all([
 db.from('normatives').select('id,title,original_filename,is_current,openai_file_id,openai_vector_store_file_id,openai_vector_store_id,openai_status').eq('id',normId).maybeSingle(),
 db.from('normative_social_works').select('social_work_id,billing_channel_id').eq('normative_id',normId)
 ]);
 if(n.error||links.error)throw new Error(n.error?.message||links.error?.message);
 const res={normative:n.data,links:links.data||[]};cache.set(normId,res);return res;
}
async function evidence(normative,nodes){
 const vector=normative.openai_vector_store_id||process.env.OPENAI_VECTOR_STORE_ID;
 if(!vector)throw new Error('No hay Vector Store configurado');
 const q=nodes.slice(0,30).map(n=>String(n.text||'')).filter(Boolean).slice(0,14);
 if(!q.length)return [];
 // La API admite query[] de hasta 5 elementos. Dividir, buscar por separado
 // y reunir evidencia de todos los lotes antes de auditar los nodos.
 const batches=batchSearchQueries(q);
 const resultsByBatch=[];
 for(const batch of batches){
  const hits=await openai.vectorStores.search(vector,{
   query:batch,max_num_results:50,
   filters:{type:'and',filters:[{type:'eq',key:'normative_id',value:Number(normative.id)},{type:'eq',key:'is_current',value:true}]}
  });
  resultsByBatch.push(hits.data||[]);
 }
 const hits=interleaveSearchResults(resultsByBatch);
 const fileIds=[normative.openai_file_id,normative.openai_vector_store_file_id].filter(Boolean);
 const out=[],seen=new Set();let chars=0;
 for(const hit of hits){
  // A hit only qualifies if its normative-id or file ID matches exactly.
  if(hit.attributes?.normative_id!=null && String(hit.attributes.normative_id)!==String(normative.id))continue;
  if(hit.file_id && fileIds.length && !fileIds.includes(hit.file_id))continue;
  if(!hit.file_id && hit.attributes?.normative_id==null)continue;
  const content=(hit.content||[]).filter(x=>x.type==='text').map(x=>x.text||'').join('\n').trim();
  if(!content||seen.has(`${hit.file_id||"no-file"}:${content.slice(0,180)}`))continue;
  seen.add(`${hit.file_id||"no-file"}:${content.slice(0,180)}`);const text=content.slice(0,1800);if(chars+text.length>22000)continue;
  out.push({id:`E${out.length+1}`,file:hit.filename||normative.original_filename,text});chars+=text.length;
 }
 console.log(`  Evidencia normativa #${normative.id}: ${q.length} consultas en ${batches.length} lote(s) de <=5; ${out.length} fragmentos`);
 return out;
}
function issue(c,n,text,status){rows.push({candidate_id:c.id,social_work_id:c.social_work_id,normative_id:c.normative_id,title:c.title,node_id:n?.id||'-',node_type:n?.type||'-',node_text:(n?.text||'').slice(0,400),status,reason:text,evidence_ids:'',original_filename:''});}
function validateGraph(tree) {
  const nodes = Array.isArray(tree.nodes) ? tree.nodes : [];
  if (!nodes.length) return ['Árbol vacío'];
  const errors=[]; const ids=new Set(nodes.map(n=>String(n.id)));
  if(!ids.has(String(tree.start_node))) errors.push('Falta inicio válido');
  if(ids.size!==nodes.length) errors.push('IDs de nodos duplicados');
  for(const n of nodes){
    const links = n.type==='question' ? (n.options||[]).map(o=>o?.next) : n.type==='instruction' ? [n.next] : [];
    if(n.type==='question' && (n.options||[]).length<2) errors.push(`Pregunta ${n.id} sin dos respuestas`);
    if(n.type==='result' && !String(n.text||'').trim()) errors.push(`Resultado ${n.id} vacío`);
    for(const target of links){if(!target||!ids.has(String(target)))errors.push(`Nodo ${n.id}: destino inexistente ${target||'(vacío)'}`)}
  }
  return errors.slice(0,20);
}

async function audit(c){
 const tree=c.generated_json||{},nodes=Array.isArray(tree.nodes)?tree.nodes:[];
 if(!c.normative_id){issue(c,null,'Sin normativa enlazada; requiere revisión documental y circuito.', 'NO_NORMATIVE_LINK');return;}
 const {normative,links}=await source(c.normative_id);
 if(!normative){issue(c,null,'La normativa enlazada ya no existe', 'NO_NORMATIVE');return;}
 if(normative.is_current!==true){issue(c,null,'La normativa no es vigente', 'NORMATIVE_NOT_CURRENT');return;}
 if(!links.some(l=>Number(l.social_work_id)===Number(c.social_work_id))){issue(c,null,'Normativa no vinculada con esta obra social', 'SOCIAL_WORK_MISMATCH');return;}
 if(new Set(links.filter(l=>Number(l.social_work_id)===Number(c.social_work_id)).map(l=>l.billing_channel_id).filter(v=>v!=null)).size>1){issue(c,null,'Una normativa enlazada a varios circuitos requiere distinguir su alcance', 'AMBIGUOUS_CIRCUIT');return;}
 if(!nodes.length){issue(c,null,'Sin nodos para auditar', 'EMPTY_TREE');return;}
 if(nodes.length>MAX_NODES){issue(c,null,'Excede 100 nodos: dividir la auditoría', 'TOO_MANY_NODES');return;}
 const graphErrors = validateGraph(tree);
 for (const problem of graphErrors) issue(c,null,problem,'INVALID_TREE_GRAPH');
 const fragments=await evidence(normative,nodes);
 if(!fragments.length){for(const n of nodes)issue(c,n,'No se pudo recuperar evidencia del documento exacto; no aprobar.', 'NO_EVIDENCE');return;}
 const prompt=JSON.stringify({normative_id:normative.id,filename:normative.original_filename,branch:c.social_work_id,tree_nodes:nodes.map(n=>({id:String(n.id),type:n.type,text:n.text,options:n.options,next:n.next})),fragments});
 const response=await openai.responses.create({model,input:[
  {role:'system',content:'Sos auditor de normativas farmacéuticas de Argentina. Verificá CADA nodo contra la evidencia suministrada EXCLUSIVAMENTE de la normativa indicada. NO asumás que la respuesta es correcta solo porque la IA la generó. Si una pregunta no afirma una regla podés marcar SUPPORTED si los hechos que presupone están respaldados. Si no hay prueba concreta: INSUFFICIENT_EVIDENCE. Si contradice: CONTRADICTED. Para cada nodo devolvé id, estado, motivo y citas E1/E2 que respaldan el veredicto. No agregues hechos externos ni inventes páginas. El resultado es para REVISIÓN HUMANA y nunca aprobación automática.'},
  {role:'user',content:prompt}
 ],text:{format:fmt},max_output_tokens:5000});
 const str=parseOutput(response);if(!str)throw new Error(`OpenAI sin salida (${response.status||'sin estado'} / ${response.incomplete_details?.reason||'desconocido'})`);
 const parsed=JSON.parse(str);const byId=new Map((parsed.reviews||[]).map(r=>[String(r.node_id),r]));
 for(const n of nodes){
  const r=byId.get(String(n.id));const status=r&&STATUS.includes(r.status)?r.status:'INSUFFICIENT_EVIDENCE';
  rows.push({candidate_id:c.id,social_work_id:c.social_work_id,normative_id:c.normative_id,title:c.title,node_id:n.id,node_type:n.type||'',node_text:String(n.text||'').slice(0,400),status,reason:r?.reason||'No evaluado por el modelo; revisión manual',evidence_ids:(r?.evidence_ids||[]).filter(k=>fragments.some(f=>f.id===k)).join(';'),original_filename:normative.original_filename});
 }
}
async function readCandidates() {
  // No utilizar una única consulta de 1000: Supabase limita resultados por petición.
  const pageSize=200;
  const items=[];
  while(items.length < limit) {
    // `offset` es una posición absoluta; `limit` es cantidad de registros.
    // NO restar `from` a `limit`: para --offset=5 --limit=25 causaba rango 25..24.
    const page=nextCandidatePage({offset,loaded:items.length,limit,pageSize});
    if(!page)break;
    let q=db.from('decision_tree_candidates')
      .select('id,social_work_id,normative_id,title,generated_json,status')
      .in('status',['SUGGESTED','NEEDS_REVIEW']).order('id',{ascending:true});
    if(candidateId)q=q.eq('id',candidateId);
    if(socialWorkId)q=q.eq('social_work_id',socialWorkId);
    if(normativeId)q=q.eq('normative_id',normativeId);
    const {data,error}=await q.range(page.from,page.to);
    if(error)throw new Error(`Error Supabase rango ${page.from}..${page.to}: ${error.message} (${error.code||'sin_codigo'})`);
    const fetched=data||[];
    items.push(...fetched);
    if(fetched.length < page.size)break;
  }
  return items;
}
function summarizeCandidate(c) {
  const own=rows.filter(r=>String(r.candidate_id)===String(c.id));
  const counts={SUPPORTED:0,CONTRADICTED:0,INSUFFICIENT_EVIDENCE:0,OTHER:0};
  for(const r of own){if(r.status in counts)counts[r.status]++;else counts.OTHER++;}
  const verdict=counts.CONTRADICTED || own.some(r=>r.status==='INVALID_TREE_GRAPH')
     ? 'CORREGIR_ANTES_DE_APROBAR'
     : counts.OTHER || counts.INSUFFICIENT_EVIDENCE || counts.SUPPORTED===0
     ? 'REVISION_DOCUMENTAL_OBLIGATORIA'
     : 'APTO_PARA_REVISION_HUMANA';
  overview.push({candidate_id:c.id,social_work_id:c.social_work_id,normative_id:c.normative_id,title:c.title,verdict, ...counts,steps_checked:own.filter(r=>r.node_id!=='-').length});
}
function toCsv(cols,data){return '\uFEFF'+[cols.join(','),...data.map(r=>cols.map(k=>'"'+String(r[k]??'').replaceAll('"','""').replaceAll('\n',' ')+'"').join(','))].join('\n')}
async function main(){
 const data=await readCandidates();
 console.log(`Auditoría SOLO LECTURA: ${data.length} candidatos | OpenAI: ${model} | solicitado ${limit}`);
 for(let i=0;i<data.length;i++){
  const c=data[i];try{await audit(c);console.log(`${i+1}/${data.length} #${c.id}: ${c.title}`)}
  catch(e){issue(c,null,`ERROR_TECNICO: ${e.message}`,'AUDIT_ERROR');console.error(`ERROR #${c.id}: ${e.message}`);}
  summarizeCandidate(c);
 }
 const dir='qa/results';fs.mkdirSync(dir,{recursive:true});
 const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
 const out=path.join(dir,`auditoria_arboles_${stamp}`);
 fs.writeFileSync(out+'.json',JSON.stringify({generated_at:new Date().toISOString(),model,all,overview,results:rows},null,2));
 const cols=['candidate_id','social_work_id','normative_id','title','node_id','node_type','node_text','status','reason','evidence_ids','original_filename'];
 fs.writeFileSync(out+'.csv',toCsv(cols,rows));
 fs.writeFileSync(out+'_resumen.csv',toCsv(['candidate_id','social_work_id','normative_id','title','verdict','SUPPORTED','CONTRADICTED','INSUFFICIENT_EVIDENCE','OTHER','steps_checked'],overview));
 console.log(`Informes: ${out}_resumen.csv, ${out}.csv, ${out}.json`);
 console.log(`REVISIÓN HUMANA OBLIGATORIA: candidatos ${overview.length}; pasos ${rows.length}. No se modificaron propuestas, estados ni permisos.`);
}
await main();
