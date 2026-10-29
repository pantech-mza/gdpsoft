import test from 'node:test';
import assert from 'node:assert/strict';
import { unresolvedExplicitSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';
const dictionary = { phrases: [{ phrase: 'TV SALUD', socialWork: { id: 1 } }, { phrase: 'ENSALUD', socialWork: { id: 2 } }] };
test('«V Salud» pide confirmar en vez de usar la obra social anterior', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'V Salud, qué vigencia tiene la receta?', dictionary, matches: [] }), 'V SALUD');
  assert.equal(unresolvedExplicitSocialWork({ question: 'TV Salud, qué vigencia tiene la receta?', dictionary, matches: [{ id: 1, name: 'TV SALUD', source: 'NAME' }] }), null);
  assert.equal(unresolvedExplicitSocialWork({ question: 'y mi salud qué hago', dictionary, matches: [] }), null);
  assert.equal(unresolvedExplicitSocialWork({ question: 'qué vigencia tiene la receta', dictionary, matches: [] }), null);
});
