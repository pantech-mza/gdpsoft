/** GDPSoft v3.13.8 - Parche conservador de estado OOSS. */
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if (!['--apply','--check'].includes(mode)) {
 console.error('Uso: node scripts/qa/repair-social-work-status-v3_13_8.mjs --check | --apply');
 process.exit(2);
}
const helper=resolve(projectRoot,'lib/assistant/social-work-status.mjs');
if (!existsSync(helper)) {
 console.error('Falta lib/assistant/social-work-status.mjs. Descomprimí el ZIP completo.');
 process.exit(2);
}
const mutations={"app/api/assistant/query/route.js": [["import { isOperationalCircuitQuestion } from \"../../../../lib/assistant/operational-circuit-intent.mjs\";", "import { isOperationalCircuitQuestion } from \"../../../../lib/assistant/operational-circuit-intent.mjs\";\nimport { isSocialWorkStatusQuestion, hasExplicitStatusSubject, formatSocialWorkStatus } from \"../../../../lib/assistant/social-work-status.mjs\";"], ["      !isGeneralBranchCircuitQuestion(question) && (\n        !Number.isInteger(socialWorkId) || socialWorkId <= 0\n      )", "      !isGeneralBranchCircuitQuestion(question) && (\n        !isSocialWorkStatusQuestion(question) && (\n          !Number.isInteger(socialWorkId) || socialWorkId <= 0\n        )\n      )"], ["    // =====================================================\n\n    // PROCEDIMIENTO INTERNO APROBADO (PRIORITARIO ANTES DE FAQ Y CACHE)", "    // El chip «Activa» del listado y Recordá/Ficha usan social_works.active.\n    // Resolver consultas de estado directamente desde Supabase y SIN OpenAI.\n    // No modificar la OOSS activa del chat cuando se consulta otra por nombre.\n    if (isSocialWorkStatusQuestion(question)) {\n      const {data: statusWorks, error: statusError} = await supabaseAdmin\n        .from(\"social_works\").select(\"id,name,active\");\n      if (statusError) throw new Error(statusError.message);\n      const {data: statusAliases, error: statusAliasesError} = await supabaseAdmin\n        .from(\"social_work_aliases\").select(\"*\");\n      if (statusAliasesError) console.error(\"social work status aliases:\", statusAliasesError.message);\n      const dictionary = buildSocialWorkDictionary({\n        socialWorks: statusWorks || [], aliases: statusAliasesError ? [] : (statusAliases || []),\n      });\n      const matches = detectSocialWorks({text:question, dictionary});\n      const namedWork = matches.length === 1\n        ? (statusWorks || []).find(item => Number(item.id) === Number(matches[0].id))\n        : null;\n      const contextWork = !matches.length && !hasExplicitStatusSubject(question)\n        ? (statusWorks || []).find(item => Number(item.id) === Number(socialWorkId))\n        : null;\n      const targetWork = namedWork || contextWork || null;\n      const answer = matches.length > 1\n        ? \"Hay más de una obra social posible. Indicame su nombre completo para verificar el estado.\"\n        : targetWork ? formatSocialWorkStatus(targetWork)\n        : hasExplicitStatusSubject(question)\n          ? \"No encontré una obra social con ese nombre en GDPSoft. Confirmá cómo figura en el listado.\"\n          : \"Indicame de qué obra social querés consultar el estado.\";\n      const found = Boolean(targetWork && typeof targetWork.active === \"boolean\");\n      const elapsedMs = Date.now() - startedAt;\n      await logCurrentQuery({branchId, socialWorkId: targetWork?.id || socialWorkId, question, answer,\n        source:\"SOCIAL_WORK_PROFILE\", route:\"STRUCTURED_SOCIAL_WORK_STATUS\",\n        found, elapsedMs, usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n      return Response.json({ok:true,question,answer,found,source:\"SOCIAL_WORK_PROFILE\",\n        route:\"STRUCTURED_SOCIAL_WORK_STATUS\",context:responseContext,elapsed_ms:elapsedMs,\n        structured_data:targetWork ? {social_work_id:targetWork.id,active:targetWork.active} : null,\n        usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n    }\n\n    // =====================================================\n\n    // PROCEDIMIENTO INTERNO APROBADO (PRIORITARIO ANTES DE FAQ Y CACHE)"]], "app/api/assistant/chat/route.js": [["import { isGeneralBranchCircuitQuestion } from \"../../../../lib/assistant/branch-circuit-membership.mjs\";", "import { isGeneralBranchCircuitQuestion } from \"../../../../lib/assistant/branch-circuit-membership.mjs\";\nimport { isSocialWorkStatusQuestion } from \"../../../../lib/assistant/social-work-status.mjs\";"], ["    // Excepción para UNA receta nueva sin OOSS explícita. No cambia", "    // Consultas sobre el chip de estado: delegar al router estructurado.\n    // No seleccionar otra OOSS ni cambiar el contexto de la conversación.\n    if (originalQuestion && !topic && isSocialWorkStatusQuestion(originalQuestion)) {\n      const {response, data} = await callAssistantQuery({request,conversationId,question:originalQuestion});\n      return Response.json(data, {status:response.status});\n    }\n\n    // Excepción para UNA receta nueva sin OOSS explícita. No cambia"]]};
const proposed=[];
for(const [relativePath,replacements] of Object.entries(mutations)) {
 const file=resolve(projectRoot,relativePath);
 if(!existsSync(file)) {console.error(`Archivo faltante: ${relativePath}`);process.exit(2);}
 const original=readFileSync(file,'utf8');
 let updated=original;
 for(const [before,after] of replacements) {
   if(updated.includes(after)) continue; // Idempotente
   const occurrences=updated.split(before).length-1;
   if(occurrences!==1) {
     console.error(`Versión distinta: ${relativePath}. No se modifica ningún archivo. Revisá cambios locales.`);
     process.exit(2);
   }
   updated=updated.replace(before,after);
 }
 proposed.push({relativePath,file,original,updated});
}
for(const entry of proposed) {
 if(entry.original===entry.updated) {console.log(`Ya corregido: ${entry.relativePath}`);continue;}
 if(mode==='--check') {console.log(`Pendiente: ${entry.relativePath}`);continue;}
 const backup=entry.file+'.backup-v3_13_8';
 if(!existsSync(backup)) copyFileSync(entry.file,backup);
 writeFileSync(entry.file,entry.updated,'utf8');
 console.log(`Actualizado: ${entry.relativePath}; respaldo: ${backup}`);
}
if(mode==='--check') console.log('Verificación completada (sin cambios).');
else console.log('Parche v3.13.8 aplicado. Ejecutá las pruebas y npm run build antes de publicar.');
