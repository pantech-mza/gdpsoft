import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldPreferValidationProfile } from '../../lib/assistant/validation-profile-priority.mjs';
import { isImmediateOperationalContingency } from '../../lib/assistant/response-priority.mjs';

const path = new URL('../../app/api/assistant/query/route.js', import.meta.url);
const route = fs.readFileSync(path, 'utf8');
const normalize = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const containsAny = (text,words) => words.some(word=>text.includes(word));
const detectorSource = route.split('function detectSocialWorkProfileIntent(')[1]?.split('// FALLBACK DE FICHA HACIA NORMATIVA')[0];
assert.ok(detectorSource, 'No se pudo localizar la función del detector de Ficha');
const detectSocialWorkProfileIntent = new Function('normalize', 'containsAny',
  'return function detectSocialWorkProfileIntent(' + detectorSource.slice(0,detectorSource.lastIndexOf('}')+1) + ';')(
  normalize,containsAny);

const profileSource = route.split('async function querySocialWorkProfile(')[1]?.split('function detectRuleIntent(')[0];
assert.ok(profileSource,'No se pudo localizar el resolvedor de Ficha');
const profile = {
  id: 18,
  name: 'OSDE',
  validator_name: 'SITEL - Extranet',
  validator_type: 'TYS',
};
const fakeDb = { from(table) {
  assert.equal(table, 'social_works');
  return { select() {return this;}, eq(){return this;}, async maybeSingle(){return { data:profile,error:null };} };
}};
const querySocialWorkProfile = new Function('supabaseAdmin',
  'return async function querySocialWorkProfile(' + profileSource.slice(0,profileSource.lastIndexOf('}')+1) + ';')(fakeDb);

test('preguntas por nombre de validador van a Recordá/Ficha', () => {
  for (const q of [
    '¿Cómo se llama el validador de OSDE?',
    '¿Cuál es el nombre del validador de OSDE?',
    '¿Qué validador utiliza OSDE?',
    '¿Cuál es el validador de OSDE?',
  ]) {
    assert.equal(detectSocialWorkProfileIntent(q)?.key,'VALIDATOR_NAME',q);
    assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION',profileKey:'VALIDATOR_NAME',question:q}),true,q);
  }
});

test('nombre real y medio real de OSDE se obtienen desde Ficha', async () => {
  const result=await querySocialWorkProfile({socialWorkId:18,intent:detectSocialWorkProfileIntent('¿Cómo se llama el validador de OSDE?')});
  assert.equal(result.found,true);
  assert.match(result.answer,/El validador de OSDE es SITEL - Extranet\./);
  assert.match(result.answer,/Por dónde valida: TYS\./);
  assert.match(result.answer,/Fuente: Recordá\/Ficha de OSDE\./);
});

test('sin validador registrado no inventa ni deriva a una normativa', async () => {
  const previous=profile.validator_name;
  try {
    profile.validator_name=null;
    const result=await querySocialWorkProfile({socialWorkId:18,intent:{field:'validator_name',key:'VALIDATOR_NAME'}});
    assert.equal(result.found,true);
    assert.match(result.answer,/No hay un nombre de validador confirmado/);
    assert.doesNotMatch(result.answer,/SITEL/);
  } finally { profile.validator_name=previous; }
});

test('código TYS, circuitos y contingencias no se alteran', () => {
  assert.equal(detectSocialWorkProfileIntent('¿Cuál es el código TYS de OSDE?')?.key,'TYS_CODE');
  assert.equal(detectSocialWorkProfileIntent('¿Por dónde valido OSDE?')?.key,'VALIDATION_METHOD');
  assert.equal(isImmediateOperationalContingency('Se cayó el validador de OSECAC'),true);
  assert.notEqual(detectSocialWorkProfileIntent('No funciona el validador')?.key,'VALIDATOR_NAME');
  assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION',profileKey:'VALIDATOR_NAME',question:'¿Qué validador utiliza OSDE en DP1?'}),false);
});
