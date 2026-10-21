import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlanVariant, resolvePlanVariant, filterRowsByVariant } from '../../lib/assistant/plan-variant.mjs';
import { scopeLinkedNormatives } from '../../lib/assistant/linked-normatives.mjs';

const rows = [{ normative_id: 1, plan_variant: 'OYTE' }, { normative_id: 2, plan_variant: 'OYTE' }];
test('detecta OYTE', () => {
  assert.equal(detectPlanVariant('requisitos osep oyte'), 'OYTE');
  assert.equal(detectPlanVariant('como facturo osep OyTE?'), 'OYTE');
  assert.equal(detectPlanVariant('requisitos osep'), null);
});
test('OYTE usa solo normativas OYTE', () => {
  const r = scopeLinkedNormatives(rows, null, 32, 'OYTE');
  assert.equal(r.ok, true); assert.deepEqual(r.normativeIds, [1, 2]);
});
test('consulta general no usa normativas OYTE', () => {
  const r = scopeLinkedNormatives(rows, null, 32, null);
  assert.equal(r.ok, false); assert.equal(r.variantMissing, true);
});
test('mezcla: cada variante ve lo suyo', () => {
  const mixed = [...rows, { normative_id: 3, plan_variant: null }];
  assert.deepEqual(scopeLinkedNormatives(mixed, null, 32, null).normativeIds, [3]);
  assert.deepEqual(scopeLinkedNormatives(mixed, null, 32, 'OYTE').normativeIds, [1, 2]);
});
test('sin variantes todo sigue igual', () => {
  const r = scopeLinkedNormatives([{ normative_id: 9 }], null, 32, 'OYTE');
  assert.equal(r.ok, true);
});
test('repregunta mantiene la variante de la misma obra social', () => {
  assert.equal(resolvePlanVariant({ question: 'y el validador?', state: { variant: 'OYTE', social_work_id: 59 }, socialWorkId: 59 }), 'OYTE');
  assert.equal(resolvePlanVariant({ question: 'y el validador?', state: { variant: 'OYTE', social_work_id: 59 }, socialWorkId: 10 }), null);
});

import { filterTextsByVariant } from '../../lib/assistant/plan-variant.mjs';
test('observaciones: OYTE y plan general no se mezclan', () => {
  const notes = ['OSEP OYTE: Oncológicos inyectables solo en farmacia OSEP', 'Cómo validar OZEMPIC: F9 29%', 'Sustitución siempre que esté en receta', '📢 OSEP OyTE – RECORDATORIO DE FACTURACIÓN'];
  assert.deepEqual(filterTextsByVariant(notes, 'OYTE'), [notes[0], notes[3]]);
  assert.deepEqual(filterTextsByVariant(notes, null), [notes[1], notes[2]]);
  assert.deepEqual(filterTextsByVariant(['a', 'b'], 'OYTE'), ['a', 'b']);
});
