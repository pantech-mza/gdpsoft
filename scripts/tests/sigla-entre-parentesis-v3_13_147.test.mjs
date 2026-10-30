import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
test('«como se valida uom?» detecta UOM (UNIÓN OBRERA METALÚRGICA) por su sigla y por su nombre', () => {
  const dictionary = buildSocialWorkDictionary({ socialWorks: [{ id: 1, name: 'UOM (UNIÓN OBRERA METALÚRGICA)', active: true }, { id: 2, name: 'OSDE', active: true }], aliases: [] });
  assert.deepEqual(detectSocialWorks({ text: 'como se valida uom?', dictionary }).map((m) => m.id), [1]);
  assert.deepEqual(detectSocialWorks({ text: 'union obrera metalurgica', dictionary }).map((m) => m.id), [1]);
  assert.deepEqual(detectSocialWorks({ text: 'como se valida osde', dictionary }).map((m) => m.id), [2]);
});
