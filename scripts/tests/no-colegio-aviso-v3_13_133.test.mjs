import test from 'node:test';
import assert from 'node:assert/strict';
import { colegioRestrictionFromNotes, withColegioRestriction } from '../../lib/assistant/branch-restriction.mjs';
test('detecta NO COLEGIO y Solo sucursales de Cámara', () => {
  assert.equal(colegioRestrictionFromNotes([{ body: 'Leches solo en PMI. NO COLEGIO' }]), true);
  assert.equal(colegioRestrictionFromNotes([{ body: 'NO SUCURSALES DE COLEGIO.' }]), true);
  assert.equal(colegioRestrictionFromNotes([{ body: 'Solo sucursales de Cámara..' }]), true);
  assert.equal(colegioRestrictionFromNotes([{ body: 'Sucursales de COLEGIO sin validación.' }]), false);
  assert.equal(colegioRestrictionFromNotes([{ body: 'MEDICUS - NO FUERZA DE SEGURIDAD' }]), false);
});
test('solo avisa en sucursales de Colegio y no duplica', () => {
  const base = { answer: 'Sí, se carga por dispensa.', route: 'SEMANTIC', workName: 'OSPIHMP', hasRestriction: true };
  assert.match(withColegioRestriction({ ...base, circuit: 'COLEGIO' }), /^ATENCIÓN\. Según[\s\S]*NO se recibe en sucursales de Colegio[\s\S]*Sí, se carga por dispensa\.$/);
  assert.equal(withColegioRestriction({ ...base, circuit: 'CAMARA' }), null);
  assert.equal(withColegioRestriction({ ...base, circuit: 'COLEGIO', route: 'COURTESY' }), null);
  assert.equal(withColegioRestriction({ ...base, circuit: 'COLEGIO', hasRestriction: false }), null);
  assert.equal(withColegioRestriction({ ...base, circuit: 'COLEGIO', answer: 'OSPIHMP no se recibe en sucursales de Colegio.' }), null);
});
