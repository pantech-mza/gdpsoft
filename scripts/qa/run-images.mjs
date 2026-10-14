import fs from "node:fs";
import path from "node:path";
import { loadEnv, qaFetch, startRun, saveResult, finishRun, normalize, BASE_URL, SECRET } from "./_utils.mjs";
loadEnv();
if(!process.env.QA_RUNNER_SECRET){console.error("Falta QA_RUNNER_SECRET en .env.local");process.exit(1)}
const configPath=path.resolve(process.cwd(),'qa/images/cases.json');
if(!fs.existsSync(configPath)){console.error('No existe qa/images/cases.json');process.exit(1)}
const cases=JSON.parse(fs.readFileSync(configPath,'utf8')).filter(x=>x.enabled!==false);
const run=await startRun('IMAGE',`QA Imágenes ${new Date().toLocaleString('es-AR')}`,{cases:cases.length});
for(const c of cases){
  const filePath=path.resolve(process.cwd(),'qa/images',c.file);
  if(!fs.existsSync(filePath)){
    await saveResult(run.id,{case_id:c.id,suite:'IMAGE',category:'OOSS_DETECTION',question:c.question,expected:c.expected,actual:{error:'Archivo no encontrado',file:c.file},status:'ERROR',score:0,failure_reason:`No existe ${filePath}`});
    console.log(`[ERROR] ${c.id}: falta ${c.file}`); continue;
  }
  try{
    const ctx=await qaFetch('/api/admin/qa/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({})});
    const bytes=fs.readFileSync(filePath); const form=new FormData();
    form.append('conversationId',ctx.conversation.id);
    form.append('file',new Blob([bytes],{type:c.mime_type||'image/jpeg'}),path.basename(filePath));
    const upload=await fetch(BASE_URL()+'/api/admin/qa/upload-image',{method:'POST',headers:{'x-qa-secret':SECRET()},body:form});
    const uploadData=await upload.json(); if(!upload.ok||uploadData.ok===false) throw new Error(uploadData.error||'Error upload QA');
    const t=Date.now(); const r=await fetch(BASE_URL()+'/api/assistant/analyze-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:ctx.conversation.id,imageId:uploadData.image.id,question:c.question})});
    const actual=await r.json(); const elapsed=Number(actual.elapsed_ms || Date.now()-t);
    const hay=normalize(JSON.stringify(actual));
    const expectedTerms=[c.expected?.visual_candidate,c.expected?.canonical_social_work,c.expected?.social_work].filter(Boolean).map(normalize);
    const matched=expectedTerms.some(term=>term && hay.includes(term));
    const asksClarification=hay.includes('indicame la obra social')||hay.includes('no puedo confirmar')||hay.includes('social_work_required');
    let status='FAIL', reason='No detectó la OOSS esperada';
    if(r.ok && actual.ok!==false && matched){ status=elapsed>8000?'WARNING':'PASS'; reason=elapsed>8000?'Respuesta > 8s':null; }
    else if(r.ok && actual.ok!==false && asksClarification){ status='WARNING'; reason='No confirmó OOSS; pidió aclaración'; }
    await saveResult(run.id,{case_id:c.id,suite:'IMAGE',category:'OOSS_DETECTION',social_work_id:actual?.context?.social_work_id||null,image_id:uploadData.image.id,question:c.question,expected:c.expected,actual,route:actual.route,source:actual.source,model:actual.model||actual?.image_analysis?.model||null,elapsed_ms:elapsed,input_tokens:actual?.usage?.input_tokens||0,output_tokens:actual?.usage?.output_tokens||0,status,score:status==='PASS'?100:status==='WARNING'?60:0,failure_reason:reason});
    console.log(`[${status}] ${c.id} ${c.file} ${elapsed}ms`);
  }catch(e){
    await saveResult(run.id,{case_id:c.id,suite:'IMAGE',category:'OOSS_DETECTION',question:c.question,expected:c.expected,actual:{error:e.message},status:'ERROR',score:0,failure_reason:e.message});
    console.log(`[ERROR] ${c.id}: ${e.message}`);
  }
}
const done=await finishRun(run.id); console.log('\nFINAL:',done);
