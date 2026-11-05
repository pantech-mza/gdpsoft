import test from 'node:test';
import assert from 'node:assert/strict';
import { unresolvedExplicitSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';

const dictionary = { phrases: [
  { phrase: 'SWISS MEDICAL', socialWork: { id: 1, name: 'SWISS MEDICAL' } },
  { phrase: 'SWISS MEDICAL ART', socialWork: { id: 2, name: 'SWISS MEDICAL ART' } },
] };

test('«auditoria medica» no se confunde con SWISS MEDICAL', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'vienen con sello de auditoria medica', dictionary, matches: [] }), null);
});

test('un tipeo real de obra social sigue pidiendo confirmación', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'recibimos medicall', dictionary, matches: [] }), 'MEDICALL');
});
