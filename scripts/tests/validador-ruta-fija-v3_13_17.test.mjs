import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldPreferValidationProfile } from '../../lib/assistant/validation-profile-priority.mjs';
import { isImmediateOperationalContingency } from '../../lib/assistant/response-priority.mjs';
const route = fs.readFileSync(new URL('../../app/api/assistant/query/route.js',import.meta.url),'utf8');
const normalize = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const containsAny = (text,words) => words.some(w => text.includes(w));
const fn = route.split('function detectSocialWorkProfileIntent(')[1]?.split('// FALLBACK DE FICHA HACIA NORMATIVA')[0];
assert.ok(fn, 'Detector de Ficha ausente');
const detect = new Function('normalize','containsAny','return function detectSocialWorkProfileIntent('+fn.slice(0,fn.lastIndexOf('}')+1)+';')(normalize,containsAny);
const code = route.split('async function querySocialWorkProfile(')[1]?.split('function detectRuleIntent(')[0];
assert.ok(code,'Consulta de Ficha ausente');
const profile = {id:18,name:'OSDE',validator_name:'SITEL - Extranet',validator_type:'TYS'};
const fakeDb = {from(name) { assert.equal(name,'social_works'); return { select(){return this;},eq(){return this;},async maybeSingle(){return {data:profile,error:null};}};}};
const query = new Function('supabaseAdmin','return async function querySocialWorkProfile('+code.slice(0,code.lastIndexOf('}')+1)+';')(fakeDb);

test('"por dónde valida" y "por dónde valido" usan siempre la Ficha',()=>{
  for (const question of [
    '¿Por dónde valida OSDE?', 'por donde valida osdepym?',
    '¿Por dónde valido OSDE?', '¿Por dónde se valida OSDE?',
    '¿Dónde valida OSDE?', '¿En qué sistema se valida OSDE?',
    '¿Cuál es el tipo de validación de OSDE?', '¿Por dónde validamos OSDE?'
  ]) {
    const intent=detect(question);
    assert.equal(intent?.key,'VALIDATION_METHOD',question);
    assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION',profileKey:intent.key,question}),true,question);
  }
});
test('OSDE devuelve TYS + SITEL - Extranet de Ficha, no dirección',async()=>{
  const response=await query({socialWorkId:18,intent:detect('¿Por dónde valida OSDE?')});
  assert.equal(response.found,true);
  assert.match(response.answer,/Por dónde valida: TYS\./);
  assert.match(response.answer,/Validador: SITEL - Extranet\./);
  assert.doesNotMatch(response.answer,/Perú|832|oficina/);
});
test('OSDEPYM devuelve GMS/TYS; nunca un teléfono como medio de Ficha',async()=>{
  const prior={...profile};
  try {
    Object.assign(profile,{id:35,name:'OSDEPYM',validator_name:'GMS',validator_type:'TYS'});
    const response=await query({socialWorkId:35,intent:detect('por donde valida osdepym?')});
    assert.equal(response.found,true);
    assert.match(response.answer,/Por dónde valida: TYS\./);
    assert.match(response.answer,/Validador: GMS\./);
    assert.doesNotMatch(response.answer,/0800|online que requiere|telefono/);
  } finally {Object.assign(profile,prior);}
});
test('si Ficha no tiene medio ni nombre, NO permite fallback a normativas',async()=>{
  const prior={...profile};
  try {
    profile.validator_type=null;profile.validator_name=null;
    const result=await query({socialWorkId:18,intent:detect('por donde valida osde?')});
    assert.equal(result.found,true);
    assert.match(result.answer,/sin dato confirmado en Recordá\/Ficha/);
    assert.doesNotMatch(result.answer,/Normativa vigente|calle Perú|0800/);
  } finally {Object.assign(profile,prior);}
});
test('no invade código TYS, contingencia interna ni circuito de sucursal',()=>{
  assert.equal(detect('¿Cuál es el código TYS de OSDE?')?.key,'TYS_CODE');
  assert.equal(isImmediateOperationalContingency('se cayó el validador de OSECAC'),true);
  assert.notEqual(detect('se cayó el validador de OSECAC')?.key,'VALIDATION_METHOD');
  assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION',profileKey:'VALIDATION_METHOD',question:'¿Por dónde valido OSDE en DP1?'}),false);
  assert.notEqual(detect('¿Por qué circuito tramito OSECAC?')?.key,'VALIDATION_METHOD');
});
