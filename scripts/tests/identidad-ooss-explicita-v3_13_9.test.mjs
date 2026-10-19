import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {buildSocialWorkDictionary,detectSocialWorks} from '../../lib/assistant/socialWorkDetection.js';
import {unresolvedExplicitSocialWork} from '../../lib/assistant/explicit-social-work-protection.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dictionary=buildSocialWorkDictionary({socialWorks:[
 {id:28,name:'OSSEG'},{id:7,name:'OSECAC'},{id:35,name:'OSDEPYM'},
 {id:20,name:'OSTES'},{id:4,name:'BOREAL'},
]});
const missing=q=>unresolvedExplicitSocialWork({question:q,dictionary,matches:detectSocialWorks({text:q,dictionary})});
test('OSPAT no registrada: no se usa Ficha de OSSEG por contexto previo',()=>{
 assert.equal(missing('Membrete es requerido en ospat?'),'OSPAT');
 assert.equal(missing('osPat está activa?'),'OSPAT');
});
test('OSSEG conocida conserva su ruta correcta',()=>{
 assert.equal(missing('¿OSSEG está activa?'),null);
 assert.equal(missing('¿Membrete en OSSEG?'),null);
});
test('Se tolera transposición unívoca OSDEPMY → OSDEPYM',()=>{
 assert.equal(missing('¿Por dónde valido OSDEPMY?'),null);
});
test('Repetir pregunta sin otra OOSS no bloquea contexto',()=>{
 assert.equal(missing('¿Y el membrete?'),null);
 assert.equal(missing('No funciona validador'),null);
});
test('OOSS activa explícita + otra sigla desconocida no usa sólo la primera',()=>{
 assert.equal(missing('¿Membrete en OSSEG u OSPAT?'),'OSPAT');
});
test('OSPAT registrada se permite sin importar la OOSS previa',()=>{
 const full=buildSocialWorkDictionary({socialWorks:[
  {id:28,name:'OSSEG'},{id:150,name:'OSPAT'},
 ]});
 const q='¿Es requerido el membrete en OSPAT?';
 assert.equal(unresolvedExplicitSocialWork({question:q,dictionary:full,matches:detectSocialWorks({text:q,dictionary:full})}),null);
});
test('Ambas rutas aplican el bloqueo antes de leer la Ficha o cambiar contexto',()=>{
 const chat=readFileSync(resolve(root,'app/api/assistant/chat/route.js'),'utf8');
 const query=readFileSync(resolve(root,'app/api/assistant/query/route.js'),'utf8');
 assert.ok(chat.includes('if (detection.unresolvedName)'));
 assert.ok(query.includes('if (detectedSocialWork.unresolvedName && !isSocialWorkStatusQuestion(question))'));
 assert.ok(query.indexOf('if (detectedSocialWork.unresolvedName')<query.indexOf('const detectedOperationIntent = detectOperationIntent(question)'));
});
