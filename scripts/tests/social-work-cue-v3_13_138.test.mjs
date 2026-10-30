import test from 'node:test';
import assert from 'node:assert/strict';
import { narrowByCue } from '../../lib/assistant/social-work-cue.mjs';
const m = (name, match) => ({ id: name, name, match: match || name });
test('«Centro Médico Galeno … para la obra social OSPE» → OSPE', () => {
  const r = narrowByCue('HOLA, EL LOGO DE CENTRO MEDICO GALENO, SIRVE COMO MEMBRETE PARA LA OBRA SOCIAL OSPE', [m('GALENO'), m('OSPE')]);
  assert.deepEqual(r.map((x) => x.name), ['OSPE']);
});
test('clínica nombrada sin cue positivo: se descarta la clínica', () => {
  const r = narrowByCue('la receta es del sanatorio galeno y del paciente de ospe', [m('GALENO'), m('OSPE')]);
  assert.deepEqual(r.map((x) => x.name), ['OSPE']);
});
test('dos obras sociales sin pista: se sigue preguntando', () => {
  const r = narrowByCue('galeno y ospe cómo se validan', [m('GALENO'), m('OSPE')]);
  assert.equal(r.length, 2);
});
test('dos con «obra social» cada una: no se elige', () => {
  const r = narrowByCue('obra social galeno u obra social ospe', [m('GALENO'), m('OSPE')]);
  assert.equal(r.length, 2);
});
