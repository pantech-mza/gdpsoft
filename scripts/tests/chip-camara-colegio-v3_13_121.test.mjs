import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { camaraColegioBadge } from '../../lib/operations/circuit-badge.mjs';

test('obras sociales del procedimiento Cámara-Colegio llevan la etiqueta', () => {
  for (const n of ['OSECAC', 'OSSEG', 'OSDE', 'OSTES', 'OSPAV', 'LUIS PASTEUR', 'OSFYHC', 'FEDERACION PATRONAL ART'])
    assert.equal(camaraColegioBadge(n)?.label, 'Circuito Cámara-Colegio', n);
});
test('Provincia ART: chip solo en sucursales de Colegio; en Cámara es directa', () => {
  assert.equal(camaraColegioBadge('PROVINCIA ART', 'COLEGIO')?.label, 'Circuito Cámara-Colegio');
  assert.equal(camaraColegioBadge('PROVINCIA ART', 'CAMARA'), null);
  assert.equal(camaraColegioBadge('PROVINCIA ART'), null);
});
test('Federación Patronal ART aclara las sucursales que reciben directo', () => {
  const d = camaraColegioBadge('FEDERACION PATRONAL ART').detail;
  for (const x of ['LJ2', 'San Francisco', 'Del Cerro', 'Libertad']) assert.match(d, new RegExp(x));
});
test('OSDEPYM no se confunde con OSDE; AMPES y el resto no llevan etiqueta', () => {
  assert.equal(camaraColegioBadge('OSDEPYM'), null);
  assert.equal(camaraColegioBadge('AMPES ASISTIR'), null);
  assert.equal(camaraColegioBadge('OMINT'), null);
});
test('la pantalla de la obra social muestra «ACTIVA - Circuito Cámara-Colegio»', () => {
  const src = fs.readFileSync(new URL('../../app/sucursal/obras-sociales/[id]/page.jsx', import.meta.url), 'utf8');
  assert.match(src, /Circuito Cámara-Colegio/); assert.match(src, /branchCircuitInfo/);
});
