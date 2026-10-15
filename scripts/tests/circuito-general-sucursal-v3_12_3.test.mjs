import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  isGeneralBranchCircuitQuestion,
  resolveGeneralBranchMembership,
  formatGeneralBranchMembershipResponse,
} from '../../lib/assistant/branch-circuit-membership.mjs';

const source = readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url),'utf8');

test('consulta general: circuito de mi sucursal aun con OSDEPYM activo',()=>{
  for (const question of [
    'que circuito utiliza mi sucursal?',
    '¿Qué circuito usa nuestra sucursal?',
    '¿Cuál es el circuito de mi sucursal?',
    '¿A qué circuito pertenece mi sucursal?',
  ]) assert.equal(isGeneralBranchCircuitQuestion(question),true,question);
});

test('consultas por obra social o por recepción no eluden reglas operativas',()=>{
  for (const question of [
    '¿Qué circuito utiliza mi sucursal para OSDEPYM?',
    '¿OSDEPYM se recibe en mi sucursal?',
    '¿Qué circuito tiene OSECAC en DP1?',
    '¿Puedo dispensar una receta de OMINT?',
    '¿Qué circuito uso para la validación de OSSEG?',
  ]) assert.equal(isGeneralBranchCircuitQuestion(question),false,question);
});

test('seis sucursales piloto: clasificación general',()=>{
  for (const [code,expected] of [
    ['DP1','CAMARA'], ['LIBERTAD','COLEGIO'], ['ECONOMAS','CAMARA'],
    ['DP4','CAMARA'], ['DP5','CAMARA'], ['SAN FRANCISCO','COLEGIO'],
  ]) {
    const result=resolveGeneralBranchMembership({branchCode:code});
    assert.equal(result.status,'CONFIRMED',code);
    assert.equal(result.group,expected,code);
  }
});

test('no inventa circuito si hay discrepancia entre procedure y base',()=>{
  assert.equal(resolveGeneralBranchMembership({branchCode:'DP1',branchType:'COLEGIO'}).status,'CONFLICT');
  assert.equal(resolveGeneralBranchMembership({branchCode:'otra',branchType:'otro'}).status,'UNKNOWN');
  assert.equal(resolveGeneralBranchMembership({branchCode:'otra',branchType:'CAMARA'}).group,'CAMARA');
});

test('respuesta indica grupo pero no habilita OOSS/recetas',()=>{
  const result=resolveGeneralBranchMembership({branchCode:'DP1'});
  const answer=formatGeneralBranchMembershipResponse({branch:{name:'DP1'},result});
  assert.match(answer,/Cámara/);
  assert.match(answer,/no determina el circuito de una obra social específica/i);
  assert.match(answer,/no.*autoriza/i);
});

test('la consulta general se resuelve antes de la búsqueda operativa específica',()=>{
  const membership=source.indexOf('if (isGeneralBranchCircuitQuestion(question))');
  const operation=source.indexOf('const detectedOperationIntent = detectOperationIntent(question);',membership);
  assert.ok(membership>0 && operation>membership);
  assert.match(source,/route:"GENERAL_BRANCH_CIRCUIT"/);
});
