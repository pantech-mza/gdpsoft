import test from 'node:test';
import assert from 'node:assert/strict';
import { branchCircuitInfo } from '../../lib/operations/circuit-badge.mjs';
import { detectPlanVariant } from '../../lib/assistant/plan-variant.mjs';
test('Ficha habla solo de la sucursal que la mira', () => {
  const lib = { name: 'Libertad' }, dp1 = { name: 'DP1' };
  const fp = branchCircuitInfo('FEDERACION PATRONAL ART', lib);
  assert.equal(fp.chip, false); assert.match(fp.detail, /recibe directo/); assert.doesNotMatch(fp.detail, /LJ2|San Francisco|Del Cerro/);
  assert.equal(branchCircuitInfo('FEDERACION PATRONAL ART', dp1).chip, true);
  assert.equal(branchCircuitInfo('OSECAC', lib).chip, true);
  assert.match(branchCircuitInfo('OSECAC', dp1).detail, /San Francisco/);
  assert.equal(branchCircuitInfo('OSDE', lib).chip, false);
  assert.equal(branchCircuitInfo('OSDE', { name: 'Lavalle' }).chip, true);
  assert.equal(branchCircuitInfo('PROVINCIA ART', lib).chip, true);
  assert.equal(branchCircuitInfo('PROVINCIA ART', dp1).chip, false);
  assert.equal(branchCircuitInfo('OMINT', lib), null);
  assert.equal(branchCircuitInfo('OSECAC', {}), null);
});
test('OSEP + oncológicos usa las notas OYTE', () => {
  assert.equal(detectPlanVariant('los oncológicos inyectables de OSEP los recibimos?'), 'OYTE');
  assert.equal(detectPlanVariant('osep cómo se valida'), null);
});
import { formatCircuitLine, resolveDeclaredCircuitPolicy } from '../../lib/operations/camara-colegio-policy.mjs';
test('Provincia ART en Colegio: inactiva en Colegio, solo circuito de Cámara', () => {
  const policy = resolveDeclaredCircuitPolicy({ branchName: 'DP6', socialWorkName: 'PROVINCIA ART' });
  assert.equal(policy.mode, 'CAMARA_COLEGIO');
  assert.equal(formatCircuitLine(policy, { branchLabel: 'DP6', workName: 'Provincia ART' }), 'En DP6, Provincia ART figura inactiva en Colegio, pero podés realizarla por el circuito Cámara–Colegio. En tu sucursal tramitala como circuito de Cámara para evitar rechazos.');
  assert.equal(branchCircuitInfo('PROVINCIA ART', { name: 'DP6' }).detail, 'Inactiva en Colegio. Tramitala como circuito de Cámara para evitar rechazos.');
  const osecac = resolveDeclaredCircuitPolicy({ branchName: 'Libertad', socialWorkName: 'OSECAC' });
  assert.match(formatCircuitLine(osecac, { branchLabel: 'Libertad', workName: 'OSECAC' }), /Cámara–Colegio/);
});
