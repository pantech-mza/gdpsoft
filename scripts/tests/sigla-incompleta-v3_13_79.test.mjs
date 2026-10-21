import test from 'node:test';
import assert from 'node:assert/strict';
import { unresolvedExplicitSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';
import { suggestSocialWorks } from '../../lib/assistant/social-work-suggestions.mjs';

const dictionary = { phrases: [{ phrase: 'osep', socialWork: { id: 59 } }] };
test('«ose» (sigla incompleta) se pide confirmar y no reutiliza la obra social anterior', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'como se valida ose', dictionary, matches: [] }), 'OSE');
});
test('«osep» reconocida no se marca', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'como se valida osep', dictionary, matches: [{ id: 59, name: 'OSEP' }] }), null);
});
test('palabras comunes no se marcan', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'hay un oso', dictionary, matches: [] }), null);
});
test('sugiere OSEP para OSE', () => {
  assert.ok(suggestSocialWorks('OSE', ['OSEP', 'OSDE', 'OSECAC']).length > 0);
});
