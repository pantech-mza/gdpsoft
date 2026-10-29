import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
import { inactiveOverridesActive } from '../../lib/assistant/inactive-social-work.mjs';
import { detectPlanVariant } from '../../lib/assistant/plan-variant.mjs';

const active = [{ id: 1, name: 'GALENO', active: true }, { id: 2, name: 'OSDE', active: true }];
const inactiveWorks = [{ id: 52, name: 'GALENO ART', active: false }];
const dictionary = buildSocialWorkDictionary({ socialWorks: active, aliases: [] });
const run = (q) => inactiveOverridesActive({ question: q, matches: detectSocialWorks({ text: q, dictionary }), inactiveWorks, aliases: [] });

test('«galeno art» manda la inactiva sobre GALENO activa', () => {
  assert.equal(run('galeno art recibimos?')?.name, 'GALENO ART');
  assert.equal(run('Galeno ART cobertura')?.name, 'GALENO ART');
});
test('«galeno» solo sigue siendo la activa', () => {
  assert.equal(run('galeno recibimos?'), null);
  assert.equal(run('osde y galeno'), null);
});
test('OSEP alto costo y variantes de OYTE', () => {
  for (const q of ['osep alto costo', 'alto costo de osep', 'osep alto cossto', 'osep oy te', 'osep oite', 'osep o y t e', 'osep OyTE'])
    assert.equal(detectPlanVariant(q), 'OYTE', q);
  assert.equal(detectPlanVariant('omint alto costo'), null);
  assert.equal(detectPlanVariant('osep'), null);
});
