import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
import { unresolvedExplicitSocialWork, planWithinSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';

const dictionary = buildSocialWorkDictionary({ socialWorks: [{ id: 4, name: 'BOREAL', active: true }, { id: 9, name: 'OSDE', active: true }], aliases: [] });
const run = (q) => { const matches = detectSocialWorks({ text: q, dictionary }); return { matches, plan: planWithinSocialWork({ question: q, dictionary, matches }), unresolved: unresolvedExplicitSocialWork({ question: q, dictionary, matches }) }; };

test('«boreal recibimos el plan ospif?»: OSPIF es un plan de Boreal, no una obra social sin identificar', () => {
  const r = run('boreal recibimos el plan ospif?');
  assert.equal(r.matches.length, 1);
  assert.equal(r.plan, 'OSPIF');
  assert.equal(r.unresolved, null);
});
test('sin «plan», una sigla desconocida sigue pidiendo confirmación', () => {
  const r = run('recibimos ospif?');
  assert.equal(r.plan, null);
});
test('«plan» seguido de otra obra social conocida no se toma como plan', () => {
  assert.equal(run('boreal plan osde').plan, null);
});
