import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFichaSummary } from '../../lib/assistant/ficha-summary.mjs';
import { parseRequirementsMessage } from '../../lib/assistant/requirements-view.mjs';

const ficha = { name: 'OSEP', validator_name: 'Farmalive', validator_type: 'TYS', recipe_type: 'Electrónica', recipe_validity_days: 30, letterhead: true, rp: null, substitution: '__VACIO__' };
test('resumen de Ficha con datos', () => {
  const t = buildFichaSummary(ficha);
  assert.match(t, /Información · OSEP/);
  assert.match(t, /- Validador: Farmalive \(TYS\)/);
  assert.match(t, /- Vigencia de la receta: 30 días/);
  assert.doesNotMatch(t, /Sustitución/);
  assert.doesNotMatch(t, /RP:/);
});
test('Ficha vacía no genera respuesta', () => {
  assert.equal(buildFichaSummary({ name: 'X', recipe_type: '' }), null);
  assert.equal(buildFichaSummary(null), null);
});
test('route: el resumen de Ficha va antes del mensaje sin normativa y no se usa para planes sin Ficha propia', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  assert.match(src, /buildFichaSummary\(fichaMerged\)/);
  assert.match(src, /normativeScope\.variantMissing && generalPlanVariant/);
});

import { buildProcedureSelectionInstructions } from '../../lib/assistant/procedure-match.mjs';
test('clasificador de protocolos: un procedimiento general no responde consultas puntuales', () => {
  assert.match(buildProcedureSelectionInstructions([]), /anticonceptivos/);
});
