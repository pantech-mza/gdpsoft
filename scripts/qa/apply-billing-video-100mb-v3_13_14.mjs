import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
const root = process.cwd();
const apply = process.argv.includes('--apply');
const entries = [
  {path:'app/api/social-works/[id]/resources/upload/route.js', changes:[
    ['const MAX_BYTES = 50 * 1024 * 1024;', 'const MAX_BYTES = 100 * 1024 * 1024;'],
    ['hasta 50 MB', 'hasta 100 MB'],
  ]},
  {path:'components/social-works/ResourcesPanel.jsx', changes:[
    ['file.size > 50 * 1024 * 1024', 'file.size > 100 * 1024 * 1024'],
    ['límite de 50 MB', 'límite de 100 MB'],
    ['(máx. 50 MB)', '(máx. 100 MB)'],
  ]},
  {path:'scripts/tests/upload-directo-video-v3_13_13.test.mjs', optional:true, changes:[
    ['50 MB y tipos de archivo limitados también en servidor', '100 MB y tipos de archivo limitados también en servidor'],
    ['assert.match(route, /50 \\* 1024 \\* 1024/);', 'assert.match(route, /100 \\* 1024 \\* 1024/);'],
  ]},
];
try {
  const patches=[];
  for (const ent of entries) {
    const path=resolve(root,ent.path);
    if (!existsSync(path)) {
      if (ent.optional) {console.log(`OMITIDO ${ent.path}`);continue;}
      throw new Error(`Falta ${ent.path}`);
    }
    const before=readFileSync(path,'utf8');let after=before;
    for (const [oldText,newText] of ent.changes) {
      if(after.includes(newText)) continue;
      if(!after.includes(oldText)) throw new Error(`${ent.path}: versión no reconocida. Instalá primero v3.13.13 o enviá el archivo para revisarlo.`);
      after=after.replace(oldText,newText);
    }
    patches.push({path,relative:ent.path,before,after});
  }
  // All transformations succeed before touching any file.
  for(const p of patches) console.log(`${p.before===p.after?'OK':'CAMBIO'} ${p.relative}`);
  if(!apply) console.log('Previsualización terminada. Ejecutá --apply.');
  else for(const p of patches) if(p.before!==p.after) {
    writeFileSync(p.path+'.backup-video-v3_13_14',p.before);
    writeFileSync(p.path,p.after);
    console.log(`Actualizado ${p.relative}`);
  }
} catch(e) { console.error('ABORTADO:',e.message);process.exitCode=1; }
