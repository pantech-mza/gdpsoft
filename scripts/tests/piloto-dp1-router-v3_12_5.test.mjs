import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  isGeneralBranchCircuitQuestion,
  resolveGeneralBranchMembership,
} from '../../lib/assistant/branch-circuit-membership.mjs';
import {isOperationalCircuitQuestion} from '../../lib/assistant/operational-circuit-intent.mjs';
import {resolveDeclaredCircuitPolicy} from '../../lib/operations/camara-colegio-policy.mjs';
import {shouldPreferValidationProfile} from '../../lib/assistant/validation-profile-priority.mjs';

const chat=readFileSync(new URL('../../app/api/assistant/chat/route.js', import.meta.url),'utf8');
const query=readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url),'utf8');

test('general branch questions: varias formulaciones de usuarios DP1',()=>{
  for(const q of [
    'que circuito es mi sucursal?',
    '¿A qué circuito pertenece mi sucursal?',
    '¿Qué circuito utiliza mi sucursal?',
    '¿Cuál sería el circuito para nuestra sucursal?',
  ]) assert.equal(isGeneralBranchCircuitQuestion(q),true,q);
  assert.equal(resolveGeneralBranchMembership({branchCode:'DP1'}).group,'CAMARA');
  assert.equal(isGeneralBranchCircuitQuestion('¿Qué circuito utiliza mi sucursal para OSDEPYM?'),false);
});

test('el endpoint chat evita validar socialWorkId antes de delegar preguntas de sucursal',()=>{
  const guard=chat.indexOf('// SI SIGUE SIN OOSS');
  const exception=chat.indexOf('if (originalQuestion && !topic && isGeneralBranchCircuitQuestion(originalQuestion))');
  assert.ok(exception>0 && exception<guard);
  assert.match(chat,/callAssistantQuery\(\{[\s\S]*?question: originalQuestion,[\s\S]*?\}\);/);
});

test('el endpoint query no exige socialWorkId para consulta general de sucursal',()=>{
  assert.match(query,/!isGeneralBranchCircuitQuestion\(question\) && \([\s\S]*?!Number\.isInteger\(socialWorkId\)/);
  const branch=query.indexOf('if (isGeneralBranchCircuitQuestion(question))');
  const op=query.indexOf('const detectedOperationIntent = detectOperationIntent(question);');
  assert.ok(branch>0 && op>branch);
});

test('todas las consultas de circuito que fallaron en DP1 van al router operativo',()=>{
  for(const q of [
    '¿Cómo gestiono una receta de OSTES en DP1?',
    '¿OSPAV en DP1 se tramita directo o por Cámara–Colegio?',
    '¿Cómo se tramita OSFYHC en DP1?',
    '¿OSDE en DP1 va directo o por Cámara–Colegio?',
    '¿OSSEG en DP1 se tramita directo?',
    '¿Federación Patronal ART en DP1 se gestiona directamente?',
  ]) assert.equal(isOperationalCircuitQuestion(q),true,q);
});

test('consultas que no deben desviar al circuito operativo',()=>{
  for(const q of [
    '¿Por dónde valido OSDEPYM? ¿Qué validador utiliza?',
    '¿Cuántos RP acepta OSDEPYM?',
    '¿Qué requisitos lleva la receta de OSTES?',
    '¿Cuál es la vigencia de OMINT?',
    '¿Qué dice la normativa de vacunas de OMINT?',
  ]) assert.equal(isOperationalCircuitQuestion(q),false,q);
  assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION', profileKey:'VALIDATION_METHOD', question:'¿Por dónde valido OSDEPYM? ¿Qué validador utiliza?'}),true);
});

test('procedimiento del cliente DP1, sin inventar Provincia ART',()=>{
  for(const [work,mode] of [
    ['OSECAC','EXTERNAL_VALIDATOR'],
    ['OSTES','CAMARA_COLEGIO'],
    ['OSPAV','CAMARA_COLEGIO'],
    ['LUIS PASTEUR','CAMARA_COLEGIO'],
    ['OSFYHC','CAMARA_COLEGIO'],
    ['OSDE','DIRECT'],
    ['OSSEG','CAMARA_COLEGIO'],
    ['FEDERACION PATRONAL ART','CAMARA_COLEGIO'],
    ['PROVINCIA ART','REVIEW_REQUIRED'],
  ]) assert.equal(resolveDeclaredCircuitPolicy({branchCode:'DP1',socialWorkName:work}).mode, mode, work);
  assert.equal(resolveDeclaredCircuitPolicy({branchCode:'DP1',socialWorkName:'AMPES ASISTIR'}).until, '20:00');
});

test('circuitos del resto del piloto también permanecen correctos',()=>{
 for(const [branch,work,mode] of [
    ['LIBERTAD','FEDERACION PATRONAL ART','DIRECT'],
    ['ECONOMAS','OSECAC','DIRECT'],
    ['DP4','OSECAC','CAMARA_COLEGIO'],
    ['DP5','OSSEG','CAMARA_COLEGIO'],
    ['SAN FRANCISCO','OSSEG','DIRECT'],
 ]) assert.equal(resolveDeclaredCircuitPolicy({branchCode:branch,socialWorkName:work}).mode,mode);
});
