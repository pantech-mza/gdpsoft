import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { shouldPreferValidationProfile as preferFicha } from '../../lib/assistant/validation-profile-priority.mjs';

const bot = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
const fichaIntent = 'VALIDATION_METHOD';
const validation = (q) => preferFicha({ operationType:'VALIDATION', profileKey:fichaIntent, question:q });

test('OSDEPYM: pide por dónde valida y qué validador; priorizar Ficha', () => {
  assert.equal(validation('¿Por dónde valido OSDEPYM? ¿Qué validador utiliza?'), true);
  assert.equal(validation('¿Qué validador utiliza OSDEPYM?'), true);
});

test('Repregunta: TYS se resuelve con la Ficha disponible', () => {
  // El detector operativo ya devuelve null en este caso; la Ficha queda accesible.
  assert.equal(preferFicha({operationType:null,profileKey:fichaIntent,question:'¿Pero por TYS?'}), false);
});

test('Circuitos, recepción y presentación nunca eluden seguridad', () => {
  for (const type of ['RECEPTION','CIRCUIT','PRESENTATION']) {
    assert.equal(preferFicha({operationType:type,profileKey:fichaIntent,question:'¿Por dónde valido OSECAC?'}), false);
  }
  assert.equal(preferFicha({operationType:'VALIDATION',profileKey:'TYS_CODE',question:'¿Cuál es el código TYS?'}),false);
});

test('Preguntas de validación con contexto explícito de sucursal siguen al motor operativo', () => {
  for (const q of [
    '¿Por dónde valido OSECAC en DP1?',
    '¿Por dónde valido OSECAC en mi sucursal?',
    '¿Dónde valido OSSEG desde San Francisco?',
    '¿Por dónde valido OSECAC en Econo Más?',
    '¿Por dónde valido OSECAC en Libertad?',
  ]) {
    assert.equal(validation(q), false, q);
  }
});

test('Endpoint aplica la priorización antes del guardarraíl operativo', () => {
  const start = bot.indexOf('const detectedOperationIntent = detectOperationIntent(question);');
  const preference = bot.indexOf('const operationIntent = shouldPreferValidationProfile({',start);
  const operationGuard = bot.indexOf('if (\n\n      operationIntent?.domain ===',preference);
  const ficha = bot.indexOf('const profileIntent =', operationGuard);
  assert.ok(start > 0 && preference > start && operationGuard > preference && ficha > operationGuard);
  assert.match(bot,/route:\s*"STRUCTURED_PROFILE"/);
  assert.match(bot,/Corroborá el plan y el circuito operativo de tu sucursal/);
});
