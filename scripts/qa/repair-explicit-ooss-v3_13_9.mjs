/** GDPSoft v3.13.9 - Impide contestar Ficha de otra obra social. */
import {readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const mode=process.argv[2];
if (!['--apply','--check'].includes(mode)) {console.error('Uso: node scripts/qa/repair-explicit-ooss-v3_13_9.mjs --check | --apply');process.exit(2);}
if (!existsSync(resolve(root,'lib/assistant/explicit-social-work-protection.mjs'))) {console.error('Descomprimí el ZIP completo.');process.exit(2);}
const mutations = {
  'app/api/assistant/chat/route.js': [
    ['import { isSocialWorkStatusQuestion } from "../../../../lib/assistant/social-work-status.mjs";',
     'import { isSocialWorkStatusQuestion } from "../../../../lib/assistant/social-work-status.mjs";\nimport { unresolvedExplicitSocialWork } from "../../../../lib/assistant/explicit-social-work-protection.mjs";'],
    ['  const matches =\n    detectSocialWorks({\n      text:\n        cleanQuestion,\n\n      dictionary,\n    });',
     '  const matches =\n    detectSocialWorks({\n      text:\n        cleanQuestion,\n\n      dictionary,\n    });\n\n  const unresolvedName = unresolvedExplicitSocialWork({question:cleanQuestion,dictionary,matches});'],
    ['  // =====================================================\n  // SIN OOSS DETECTADA\n',
     '  // =====================================================\n  // SIN OOSS DETECTADA\n'], // no-op; route uses inline match logic
    ['    if (originalQuestion && !recipeClarification) {\n      const detection =\n        await detectSocialWork(\n          originalQuestion\n        );',
     '    if (originalQuestion && !recipeClarification) {\n      const detection =\n        await detectSocialWork(\n          originalQuestion\n        );\n      if (detection.unresolvedName) {\n        // Nunca cambiar el contexto a una OOSS distinta tras una sigla no reconocida.\n        const {response,data} = await callAssistantQuery({request,conversationId,question:originalQuestion});\n        return Response.json(data,{status:response.status});\n      }'],
    ['      matches:\n        [],\n    };\n  }\n\n  if (\n    matches.length > 1',
     '      matches:\n        [],\n      unresolvedName,\n    };\n  }\n\n  if (\n    matches.length > 1'],
    ['      matches,\n    };\n  }\n\n  return {\n    found:\n      true,',
     '      matches,\n      unresolvedName,\n    };\n  }\n\n  return {\n    found:\n      true,'],
    ['    socialWork:\n      matches[0],\n\n    matches,\n  };\n}', '    socialWork:\n      matches[0],\n\n    matches,\n    unresolvedName,\n  };\n}'],
  ],
  'app/api/assistant/query/route.js': [
    ['import { isSocialWorkStatusQuestion, hasExplicitStatusSubject, formatSocialWorkStatus } from "../../../../lib/assistant/social-work-status.mjs";',
     'import { isSocialWorkStatusQuestion, hasExplicitStatusSubject, formatSocialWorkStatus } from "../../../../lib/assistant/social-work-status.mjs";\nimport { unresolvedExplicitSocialWork } from "../../../../lib/assistant/explicit-social-work-protection.mjs";'],
    ['  const matches =\n    detectSocialWorks({\n      text:\n        cleanQuestion,\n\n      dictionary,\n    });',
     '  const matches =\n    detectSocialWorks({\n      text:\n        cleanQuestion,\n\n      dictionary,\n    });\n  const unresolvedName = unresolvedExplicitSocialWork({question:cleanQuestion,dictionary,matches});'],
    ['    return {\n      found:\n        false,\n\n      multiple:\n        false,\n\n      socialWork:\n        null,\n\n      matches:\n        [],\n    };\n  }\n\n  // =====================================================\n  // MÁS DE UNA OOSS',
     '    return {\n      found:\n        false,\n\n      multiple:\n        false,\n\n      socialWork:\n        null,\n\n      matches:\n        [],\n      unresolvedName,\n    };\n  }\n\n  // =====================================================\n  // MÁS DE UNA OOSS'],
    ['    socialWork:\n      matches[0],\n\n    matches,\n  };\n}', '    socialWork:\n      matches[0],\n\n    matches,\n    unresolvedName,\n  };\n}'],
    ['  // ---------------------------------------------------\n  // MÁS DE UNA OOSS EN LA MISMA CONSULTA',
     '  // Si hay sigla explícita desconocida, bloquear el fallback a la OOSS previa.\n  if (detectedSocialWork.unresolvedName && !isSocialWorkStatusQuestion(question)) {\n    const name = detectedSocialWork.unresolvedName;\n    const answer = `No pude identificar ${name} en las obras sociales activas de GDPSoft. Confirmá cómo figura en el listado; no voy a utilizar la Ficha de otra obra social.`;\n    const elapsedMs = Date.now()-startedAt;\n    await logCurrentQuery({branchId,socialWorkId,question,answer,source:"SOCIAL_WORK_IDENTITY",route:"UNKNOWN_EXPLICIT_SOCIAL_WORK",found:false,elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n    return Response.json({ok:true,question,answer,source:"SOCIAL_WORK_IDENTITY",route:"UNKNOWN_EXPLICIT_SOCIAL_WORK",found:false,elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n  }\n  // ---------------------------------------------------\n  // MÁS DE UNA OOSS EN LA MISMA CONSULTA']
  ]
};
// Remove intentionally empty/no-op placeholders; all actual replacements must be unique.
mutations['app/api/assistant/chat/route.js']=mutations['app/api/assistant/chat/route.js'].filter(([a,b])=>a!==b);
mutations['app/api/assistant/query/route.js']=mutations['app/api/assistant/query/route.js'].filter(([a,b])=>a!==b);
const changed=[];
for (const [p,reps] of Object.entries(mutations)) {
 const f=resolve(root,p);
 if (!existsSync(f)) {console.error('Falta '+p);process.exit(2);}
 const old=readFileSync(f,'utf8');let current=old;
 for (const [before,after] of reps) {
  if(current.includes(after)) continue;
  if(current.split(before).length!==2) {console.error(`Incompatibilidad en ${p}: ancla no única. No se modifica ningún archivo.`);process.exit(2);}
  current=current.replace(before,after);
 }
 changed.push({f,p,old,current});
}
for(const {f,p,old,current} of changed){
 if(old===current){console.log(`Ya aplicado: ${p}`);continue;}
 if(mode==='--check'){console.log(`Pendiente: ${p}`);continue;}
 if(!existsSync(f+'.backup-v3_13_9'))copyFileSync(f,f+'.backup-v3_13_9');
 writeFileSync(f,current);console.log(`Actualizado: ${p}`);
}
if(mode==='--check')console.log('Verificación completada sin cambios.');
else console.log('Parche aplicado. Ejecutá node --test scripts/tests/*.test.mjs y npm run build.');
