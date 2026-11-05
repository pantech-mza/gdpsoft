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

import { unresolvedExplicitSocialWorkKind } from '../../lib/assistant/explicit-social-work-protection.mjs';
const dict2 = { phrases: [{ phrase: 'INSULINAS PLUS', socialWork: { id: 9, name: 'INSULINAS PLUS' } }] };

test('v3.13.158 — parecido por tipeo se marca HEURISTIC (no debe cortar si hay obra social en contexto)', () => {
  const r = unresolvedExplicitSocialWorkKind({ question: 'cualquier insulina de cualquier laboratorio?', dictionary: dict2, matches: [] });
  assert.equal(r.name, 'INSULINA');
  assert.equal(r.kind, 'HEURISTIC');
});

test('v3.13.158 — sigla «os…» desconocida sigue siendo EXPLICIT', () => {
  const r = unresolvedExplicitSocialWorkKind({ question: 'como valido osxyz', dictionary: dict2, matches: [] });
  assert.equal(r.kind, 'EXPLICIT');
});

test('v3.13.160 — frases reales de sucursal con obra social en contexto no se tratan como nombre desconocido', () => {
  const dict = { phrases: [
    { phrase: 'INSULINAS PLUS', socialWork: { id: 9, name: 'INSULINAS PLUS' } },
    { phrase: 'ESPECIALES SALUD', socialWork: { id: 10, name: 'ESPECIALES SALUD' } },
  ] };
  for (const q of ['cualquier insulina de cualquier laboratorio?', 'y para plan especial?', 'me referia a productos de novo nordisk']) {
    const r = unresolvedExplicitSocialWorkKind({ question: q, dictionary: dict, matches: [] });
    assert.notEqual(r.kind, 'EXPLICIT', q);
  }
});

test('v3.13.160 — el tipeo real de una obra social sigue detectándose', () => {
  const dict = { phrases: [{ phrase: 'BERKLEY ART', socialWork: { id: 5, name: 'BERKLEY ART' } }] };
  const r = unresolvedExplicitSocialWorkKind({ question: 'que requisitos debe tener una receta de berckley', dictionary: dict, matches: [] });
  assert.equal(r.name, 'BERCKLEY');
});
