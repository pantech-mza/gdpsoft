import test from 'node:test';
import assert from 'node:assert/strict';
import { groupIntoSegments, filterSegments, summarize, isFollowUpQuestion, classifyRow } from '../../lib/review/conversation-groups.mjs';

const at = (hhmm, day = '2026-10-21') => `${day}T${hhmm}:00.000Z`;
const row = (id, hhmm, extra = {}) => ({ id, created_at: at(hhmm), branch_id: 1, branch_name: 'DP1', device_id: 5, device_name: 'PC 1',
  social_work_id: 63, social_work_name: 'RECETARIO SOLIDARIO', question: `pregunta ${id}`, answer: 'respuesta', found: true, review: null, ...extra });

test('«Sí», «gracias» y «ok» son seguimiento; una consulta real no', () => {
  for (const q of ['Si', 'sí', 'gracias', 'Muchas gracias', 'ok', 'dale', '1']) assert.equal(isFollowUpQuestion(q), true, q);
  for (const q of ['osdepym se autoriza por gms', 'si solo presenta el numero puedo validar', 'requisitos oyte']) assert.equal(isFollowUpQuestion(q), false, q);
});

test('alertas: error del sistema, obra social no reconocida, circuito, sin respuesta', () => {
  assert.deepEqual(classifyRow(row(1, '13:00', { answer: 'No se pudo procesar la consulta.' })).alerts, ['Error del sistema']);
  assert.deepEqual(classifyRow(row(1, '13:00', { answer: 'Indicame la obra social que querés consultar.' })).alerts, ['Obra social no reconocida']);
  assert.deepEqual(classifyRow(row(1, '13:00', { answer: 'Esta obra social tiene normativas de Cámara y Colegio. Necesito confirmar el circuito' })).alerts, ['Pidió circuito']);
  assert.deepEqual(classifyRow(row(1, '13:00', { answer: '' })).alerts, ['Sin respuesta']);
  assert.deepEqual(classifyRow(row(1, '13:00')).alerts, []);
});

test('un tramo termina al cambiar de obra social o tras una pausa larga; sucursales/dispositivos no se mezclan', () => {
  const rows = [
    row(1, '13:21'), row(2, '13:23'), row(3, '13:24', { question: 'Si' }),
    row(4, '13:30', { social_work_id: 10, social_work_name: 'OSDEPYM' }),
    row(5, '14:30', { social_work_id: 10, social_work_name: 'OSDEPYM' }),            // pausa > 30 min
    row(6, '13:25', { branch_id: 2, branch_name: 'Libertad', device_id: 9 }),        // otra sucursal
  ];
  const segs = groupIntoSegments(rows);
  assert.equal(segs.length, 4);
  const first = segs.find((s) => s.items.some((i) => i.id === 1));
  assert.deepEqual(first.items.map((i) => i.id), [1, 2, 3]);
  assert.equal(first.answerCount, 2);
  assert.equal(first.followUpCount, 1);
  assert.equal(first.social_work_name, 'RECETARIO SOLIDARIO');
  assert.equal(segs[0].items[0].id, 5, 'del más reciente al más antiguo');
});

test('estado del tramo, filtros y resumen', () => {
  const rows = [
    row(1, '13:21', { review: { verdict: 'CORRECT' } }),
    row(2, '13:23', { answer: 'No se pudo procesar la consulta.' }),
    row(3, '10:00', { branch_id: 2, branch_name: 'Libertad', device_id: 9, review: { verdict: 'CORRECT' } }),
  ];
  const segs = groupIntoSegments(rows);
  assert.equal(filterSegments(segs, { status: 'PENDING' }).length, 1);
  assert.equal(filterSegments(segs, { status: 'ALERTS' }).length, 1);
  assert.equal(filterSegments(segs, { status: 'REVIEWED' }).length, 1);
  assert.equal(filterSegments(segs, { status: 'ALL', branchId: 2 }).length, 1);
  assert.equal(filterSegments(segs, { status: 'ALL', text: 'procesar' }).length, 1);
  const s = summarize(segs);
  assert.equal(s.pending, 1); assert.equal(s.alerts, 1); assert.equal(s.reviewed, 2); assert.equal(s.correctPct, 100);
});
