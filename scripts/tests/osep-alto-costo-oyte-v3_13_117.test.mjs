import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPlanVariant, namesParentWithoutVariant, filterTextsByVariant } from '../../lib/assistant/plan-variant.mjs';

test('«osep alto costo» se interpreta como OSEP OYTE', () => {
  assert.equal(detectPlanVariant('como valido osep alto costo'), 'OYTE');
  assert.equal(detectPlanVariant('osep altocosto como se gestiona?'), 'OYTE');
  assert.equal(namesParentWithoutVariant('osep alto costo'), false);
});
test('alto costo en otras obras sociales no cambia de plan', () => {
  assert.equal(detectPlanVariant('omint alto costo'), null);
  assert.equal(detectPlanVariant('osep como valido'), null);
});
test('las observaciones que nombran OSEP alto costo son del plan OYTE', () => {
  const notes = [{ body: 'OSEP: valida por TYS' }, { body: 'OSEP alto costo: droguería externa' }];
  assert.deepEqual(filterTextsByVariant(notes, 'OYTE', (n) => n.body).map((n) => n.body), ['OSEP alto costo: droguería externa']);
  assert.deepEqual(filterTextsByVariant(notes, null, (n) => n.body).map((n) => n.body), ['OSEP: valida por TYS']);
});
