import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCommonAuthorizationAmount, COMMON_AUTHORIZATION_RULES } from '../../lib/assistant/common-authorization-rules.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const query = fs.readFileSync(path.join(root,'app/api/assistant/query/route.js'),'utf8');
const policy = fs.readFileSync(path.join(root,'lib/operations/camara-colegio-policy.mjs'),'utf8');
const testCase = (name, question, work = 'PROVINCIA ART') => test(name, () => {
  const r = resolveCommonAuthorizationAmount({question, socialWorkName:work});
  assert.ok(r?.found);
  assert.match(r.answer, /autorizaci[oó]n/i);
  return r;
});

testCase('DP1: dos medicamentos superan 20.000 individualmente aun con receta inferior a 80.000',
  'Con respecto a Provincia ART, si tengo una receta con 2 medicamentos y no supera los $80.000, pero cada medicamento supera los $20.000, ¿debo pedir autorización?');
testCase('Libertad: mismo caso en otra sucursal y mismo resultado',
  'Tengo una receta de Provincia ART con 2 medicamentos, total menor a $80.000, cada uno mayor a $20.000, ¿necesito autorización?', 'Provincia ART');
test('Monto por producto prevalece sobre total inferior', () => {
  const r=resolveCommonAuthorizationAmount({question:'Cada medicamento supera los $20.000 pero el total no supera los $80.000, ¿debo pedir autorización?', socialWorkName:'Provincia ART'});
  assert.match(r.answer,/^Sí, requiere autorización/);
  assert.match(r.answer,/20\.000/);
});
test('Regla común registrada para todos los grupos sin branchId ni branchCode', () => {
  const r=resolveCommonAuthorizationAmount({question:'¿Cuáles son los límites por receta y por medicamento para autorización?', socialWorkName:'Provincia ART'});
  assert.match(r.answer,/20\.000/);
  assert.match(r.answer,/80\.000/);
  assert.equal(r.ruleId,'PROVINCIA_ART_AUTHORIZATION_LIMITS_2025');
});
test('Precio $25.000 por medicamento requiere autorización sin citar directamente 20k', () => {
  const r=resolveCommonAuthorizationAmount({question:'Tengo 2 medicamentos, cada medicamento cuesta $25.000, ¿requiere autorización?', socialWorkName:'Provincia ART'});
  assert.match(r.answer,/^Sí, requiere autorización/);
});
test('No deduce automáticamente que una receta queda aprobada por debajo de límites', () => {
  const r=resolveCommonAuthorizationAmount({question:'¿Qué autorización requiere una receta de $15.000?', socialWorkName:'Provincia ART'});
  assert.ok(r);
  assert.doesNotMatch(r.answer,/^No,|no requiere autorización/i);
});
test('OOSS diferente no hereda límites de Provincia ART', () => {
  assert.equal(resolveCommonAuthorizationAmount({question:'¿Si supera $20.000 por producto requiere autorización?', socialWorkName:'OSDE'}),null);
});
test('Circuito explícito no dispara regla de importe', () => {
  assert.equal(resolveCommonAuthorizationAmount({question:'¿Provincia ART en DP1 se tramita por Cámara–Colegio?', socialWorkName:'Provincia ART'}),null);
});
test('Ni el circuito Provincia ART para Cámara ni para Colegio es alterado por el parche', () => {
  assert.match(policy,/if \(group === "COLEGIO"\) return output\("CAMARA_COLEGIO"/);
  assert.match(policy,/return output\("REVIEW_REQUIRED"/);
});
test('El router responde reglas comunes antes de la intención operativa y búsqueda RAG', () => {
  const common=query.indexOf('v3.13.19: reglas documentales comunes');
  const operational=query.indexOf('const detectedOperationIntent = detectOperationIntent(question)');
  const fileSearch=query.indexOf('const normativeScope = await getLinkedCurrentNormativeScope(');
  assert.ok(common>0 && operational>common && fileSearch>operational);
  assert.match(query,/route:"COMMON_AUTHORIZATION_LIMITS"/);
});
test('La regla está versionada y tiene fuentes independientes para Cámara y Colegio', () => {
  const r=COMMON_AUTHORIZATION_RULES.PROVINCIA_ART;
  assert.equal(r.perProduct,20000);
  assert.equal(r.perPrescription,80000);
  assert.match(r.source,/2025/);
  assert.match(r.source,/2024/);
});
