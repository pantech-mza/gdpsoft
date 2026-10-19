import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSocialWorkDictionary,detectSocialWorks} from '../../lib/assistant/socialWorkDetection.js';
import {unresolvedExplicitSocialWork} from '../../lib/assistant/explicit-social-work-protection.mjs';

const dictionary = buildSocialWorkDictionary({socialWorks:[
  {id:1,name:'OSDE'}, {id:2,name:'OSDEPYM'}, {id:3,name:'OSECAC'},
  {id:4,name:'OMINT'}, {id:5,name:'OSSEG'}
]});
const resolve=(question)=>unresolvedExplicitSocialWork({question,dictionary,
  matches:detectSocialWorks({text:question,dictionary})});

test('OOSS inventada no reutiliza OSDEPYM de contexto para validar',()=>{
  assert.equal(resolve('¿Por dónde valido SALUD XYZ INVENTADA?'),'SALUD XYZ INVENTADA');
  assert.equal(resolve('Ahora necesito validar una obra social llamada SALUD XYZ INVENTADA.'),'SALUD XYZ INVENTADA');
});
test('nueva OOSS nombrada desconocida se bloquea también con otro nombre registrado antes',()=>{
  assert.equal(resolve('¿Qué validador usa SALUD XYZ INVENTADA?'),'SALUD XYZ INVENTADA');
  assert.equal(resolve('¿Cómo se llama el validador de SALUD XYZ INVENTADA?'),'SALUD XYZ INVENTADA');
});
test('nombres registrados y transposición inequívoca se mantienen operativos',()=>{
  for (const q of ['¿Por dónde valida OSDE?','¿Por dónde valido OSDEPYM?',
    '¿Qué validador usa OSECAC?', '¿Por dónde valido OSDEPMY?']) {
    assert.equal(resolve(q),null,q);
  }
});
test('repreguntas sin OOSS conservan la selección existente',()=>{
  for (const q of ['¿Y por dónde valida?', '¿Y cuál es el validador?',
    '¿Qué requisitos tiene la receta?', 'Se cayó el validador']) {
    assert.equal(resolve(q),null,q);
  }
});
test('la protección sigue activa en chat y query antes de resolver la Ficha',()=>{
  for (const route of ['app/api/assistant/chat/route.js','app/api/assistant/query/route.js']) {
    const file=readFileSync(route,'utf8');
    assert.match(file,/unresolvedExplicitSocialWork/);
    assert.match(file,/unresolvedName/);
  }
});
