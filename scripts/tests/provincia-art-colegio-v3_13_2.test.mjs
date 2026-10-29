import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeclaredCircuitPolicy, COLEGIO_BRANCHES, CAMARA_BRANCHES } from '../../lib/operations/camara-colegio-policy.mjs';

const resolve = (branch, work) => resolveDeclaredCircuitPolicy({branchCode:branch, socialWorkName:work});

test('Provincia ART: todas las sucursales Colegio deben usar Cámara–Colegio', () => {
  for (const branch of COLEGIO_BRANCHES) {
    const result = resolve(branch, 'PROVINCIA ART');
    assert.equal(result?.mode, 'CAMARA_COLEGIO', branch);
    assert.equal(result?.group, 'COLEGIO', branch);
    assert.equal(result?.status, 'DEFINED', branch);
    assert.equal(result?.canReceive, null, branch); // el circuito no autoriza recepción.
  }
});

test('Provincia ART: sucursales Cámara la reciben directo (activa en Cámara)', () => {
  for (const branch of CAMARA_BRANCHES) {
    const result = resolve(branch, 'PROVINCIA ART');
    assert.equal(result?.mode, 'DIRECT', branch);
    assert.equal(result?.group, 'CAMARA', branch);
  }
});

test('Reglas particulares anteriores no se alteran en las 6 sucursales piloto', () => {
  for (const [branch,work,mode] of [
    ['DP1', 'OSECAC', 'EXTERNAL_VALIDATOR'],
    ['ECONOMAS','OSECAC','DIRECT'],
    ['DP4','OSECAC','CAMARA_COLEGIO'],
    ['LIBERTAD','OSECAC','CAMARA_COLEGIO'],
    ['SAN FRANCISCO','OSECAC','CAMARA_COLEGIO'],
    ['DP1','OSTES','CAMARA_COLEGIO'],
    ['DP1','OSPAV','CAMARA_COLEGIO'],
    ['DP1','LUIS PASTEUR','CAMARA_COLEGIO'],
    ['DP1','OSFYHC','CAMARA_COLEGIO'],
    ['DP1','OSDE','DIRECT'],
    ['LIBERTAD','OSDE','DIRECT'],
    ['SAN FRANCISCO','OSSEG','DIRECT'],
    ['DP5','OSSEG','CAMARA_COLEGIO'],
    ['LIBERTAD','OSSEG','CAMARA_COLEGIO'],
    ['LIBERTAD','FEDERACION PATRONAL ART','DIRECT'],
    ['SAN FRANCISCO','FEDERACION PATRONAL ART','DIRECT'],
    ['DP5','FEDERACION PATRONAL ART','CAMARA_COLEGIO'],
  ]) assert.equal(resolve(branch,work)?.mode, mode, `${branch}: ${work}`);
});

test('AMPES: se mantienen horarios y OSDEPYM no se confunde con OSDE', () => {
  assert.equal(resolve('DP1','AMPES ASISTIR')?.until,'20:00');
  assert.equal(resolve('DP4','AMPES ASISTIR')?.allDay,true);
  assert.equal(resolve('ECONOMAS','AMPES ASISTIR')?.allDay,true);
  assert.equal(resolve('DP1','OSDEPYM')?.mode,'REGULAR_VALIDATOR');
});

test('Provincia ART - modos según las seis sucursales piloto', () => {
  const expected = new Map([
    ['DP1','DIRECT'],['LIBERTAD','CAMARA_COLEGIO'],
    ['ECONOMAS','DIRECT'],['DP4','DIRECT'],
    ['DP5','DIRECT'],['SAN FRANCISCO','CAMARA_COLEGIO']
  ]);
  for (const [branch,mode] of expected)
    assert.equal(resolve(branch,'Provincia ART')?.mode,mode,branch);
});
