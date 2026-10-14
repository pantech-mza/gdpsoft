import { loadEnv, qaFetch, startRun, saveResult, finishRun, normalize, BASE_URL } from "./_utils.mjs";
loadEnv();
if(!process.env.QA_RUNNER_SECRET){console.error("Falta QA_RUNNER_SECRET en .env.local");process.exit(1)}
const args=process.argv.slice(2); const full=args.includes('--full'); const limitArg=args.find(x=>x.startsWith('--limit=')); const limit=limitArg?Number(limitArg.split('=')[1]):20;
const catalog=(await qaFetch('/api/admin/qa/catalog')).social_works || [];
const withNorm=catalog.filter(sw=>(sw.normatives||[]).length>0);
const selected=full?withNorm:withNorm.slice(0,limit);
const run=await startRun('NORMATIVE',`QA Normativas ${full?'FULL':'SMOKE'} ${new Date().toLocaleString('es-AR')}`,{mode:full?'full':'smoke',social_works:selected.length});
console.log(`Run ${run.id} - ${selected.length} OOSS`);
let n=0;
for(const sw of selected){
  // 1) Integridad de cada normativa cargada (sin costo OpenAI)
  for(const norm of sw.normatives||[]){
    n++; const problems=[];
    if(norm.status!=='INDEXED') problems.push(`status=${norm.status}`);
    if(!norm.openai_file_id) problems.push('sin openai_file_id');
    if(!norm.openai_vector_store_id) problems.push('sin vector_store_id');
    const status=problems.length?'FAIL':'PASS';
    await saveResult(run.id,{case_id:`INT-${norm.id}`,suite:'NORMATIVE',category:'INTEGRITY',social_work_id:sw.id,normative_id:norm.id,question:null,expected:{status:'INDEXED',openai_file_id:true,vector_store:true},actual:norm,status,score:status==='PASS'?100:0,failure_reason:problems.join('; ')||null});
    console.log(`[${status}] INT-${norm.id} ${sw.name}`);
  }

  // 2) Una consulta real por OOSS al endpoint productivo
  const ctx=await qaFetch('/api/admin/qa/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({socialWorkId:sw.id})});
  const question=`requisitos principales de ${sw.name}`;
  const t=Date.now(); let actual={},status='ERROR',reason=null;
  try{
    const r=await fetch(BASE_URL()+'/api/assistant/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:ctx.conversation.id,question})});
    actual=await r.json(); const elapsed=Number(actual.elapsed_ms || Date.now()-t);
    const validRoute=['SEMANTIC','CACHE','STRUCTURED_PROFILE','STRUCTURED_OPERATION'].includes(actual.route);
    const correctSw=Number(actual?.context?.social_work_id||sw.id)===Number(sw.id);
    const found=actual.found!==false;
    status=(r.ok && actual.ok!==false && validRoute && correctSw && found)?(elapsed>6000?'WARNING':'PASS'):'FAIL';
    if(!r.ok||actual.ok===false) reason=actual.error||`HTTP ${r.status}`; else if(!correctSw) reason='OOSS de contexto incorrecta'; else if(!validRoute) reason=`Ruta inesperada ${actual.route}`; else if(!found) reason='found=false'; else if(elapsed>6000) reason='Respuesta > 6s';
    await saveResult(run.id,{case_id:`RESP-SW-${sw.id}`,suite:'NORMATIVE',category:'RESPONSE',social_work_id:sw.id,normative_id:actual.normative_id||null,question,expected:{social_work_id:sw.id,route:['SEMANTIC','CACHE','STRUCTURED_PROFILE','STRUCTURED_OPERATION'],found:true,max_ms:6000},actual,route:actual.route,source:actual.source,model:actual.model||null,elapsed_ms:elapsed,input_tokens:actual?.usage?.input_tokens||0,output_tokens:actual?.usage?.output_tokens||0,status,score:status==='PASS'?100:status==='WARNING'?80:0,failure_reason:reason});
    console.log(`[${status}] RESP ${sw.name} ${elapsed}ms`);
  }catch(e){
    await saveResult(run.id,{case_id:`RESP-SW-${sw.id}`,suite:'NORMATIVE',category:'RESPONSE',social_work_id:sw.id,question,expected:{social_work_id:sw.id},actual:{error:e.message},status:'ERROR',score:0,failure_reason:e.message});
    console.log(`[ERROR] ${sw.name}: ${e.message}`);
  }
}
const done=await finishRun(run.id); console.log('\nFINAL:',done);
