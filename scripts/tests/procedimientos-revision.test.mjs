import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPendingRevision } from '../../lib/procedimientos/config.mjs';

const approved = {
  id: 7,
  title: 'Validador sin servicio',
  question: '¿Qué hago si no funciona el validador?',
  answer: 'Comprobar el problema y consultar el procedimiento autorizado.',
  intent: 'VALIDATOR_FAILURE', scope: 'GENERAL',
  social_work_id: null, billing_channel_id: null,
  source_document: 'Manual GDP', source_pages: '2', review_notes: '',
  status: 'APPROVED', active: true, approved_at: '2026-10-13T12:00:00Z', approved_by: 'demo-id',
  rejected_at: null, rejected_by: null, updated_at: '2026-10-13T12:00:00Z',
};
const stamp='2026-10-14T17:00:00.000Z';

test('editar un aprobado guarda contenido y despublica en una sola operación',()=>{
  const r=buildPendingRevision(approved,{answer:'Nueva respuesta corregida, pendiente de revisión formal.'},stamp);
  assert.equal(r.error,undefined);
  assert.equal(r.value.answer,'Nueva respuesta corregida, pendiente de revisión formal.');
  assert.equal(r.value.status,'DRAFT');
  assert.equal(r.value.active,false);
  assert.equal(r.value.approved_by,null);
  assert.equal(r.value.approved_at,null);
  assert.equal(r.value.updated_at,stamp);
});
test('sin cambios no quita la aprobación vigente',()=>{
  const r=buildPendingRevision(approved,{},stamp);
  assert.match(r.error,/No hay cambios/);
});
test('campos incompletos impiden despublicar y guardar',()=>{
  const r=buildPendingRevision(approved,{title:'A'},stamp);
  assert.ok(r.error);
});
test('no revisa borradores mediante la operación especial',()=>{
  const r=buildPendingRevision({...approved,status:'DRAFT',active:false},{title:'Cambio importante'},stamp);
  assert.match(r.error,/Solo se pueden/);
});
test('un rechazado modificado vuelve a pendiente e inactivo',()=>{
  const r=buildPendingRevision({...approved,status:'REJECTED',active:false,rejected_by:'admin'},{review_notes:'Corregido y listo para una segunda revisión.'},stamp);
  assert.equal(r.value.status,'DRAFT');
  assert.equal(r.value.active,false);
  assert.equal(r.value.rejected_by,null);
});
test('un archivado modificado no se publica automáticamente',()=>{
  const r=buildPendingRevision({...approved,status:'ARCHIVED',active:false},{title:'Procedimiento actualizado'},stamp);
  assert.equal(r.value.status,'DRAFT');
  assert.equal(r.value.active,false);
});
test('no permite cambiar de ámbito sin obra social asignada',()=>{
  const r=buildPendingRevision(approved,{scope:'SOCIAL_WORK'},stamp);
  assert.match(r.error,/Seleccioná una obra social/);
});
