import test from 'node:test'; import assert from 'node:assert/strict';
import { markReviewNoise, applyNoiseFilter, noiseCounts, isInternalTest } from '../../lib/review/review-noise.mjs';
import { groupIntoSegments } from '../../lib/review/conversation-groups.mjs';
const T = (min) => new Date(Date.UTC(2026, 9, 27, 12, 0) + min * 60000).toISOString();
const row = (id, over = {}) => ({ id, branch_id: 1, device_id: 7, device_name: 'Caja 1', social_work_id: 5, question: '¿Recibimos AMPES ASISTIR?', answer: 'x', created_at: T(id), traffic_type: 'PILOT', ...over });

test('pruebas internas: dispositivo «Nico» o «Admin» y tráfico ADMIN', () => {
  assert.equal(isInternalTest(row(1, { device_name: 'Nico' })), true);
  assert.equal(isInternalTest(row(1, { device_name: 'PC Admin' })), true);
  assert.equal(isInternalTest(row(1, { device_name: 'Nicolás - DP1' })), true);
  assert.equal(isInternalTest(row(1, { traffic_type: 'ADMIN', device_name: null })), true);
  assert.equal(isInternalTest(row(1, { device_name: 'Mica' })), true);
  assert.equal(isInternalTest(row(1, { device_name: 'DP1 Mica' })), true);
  assert.equal(isInternalTest(row(1, { device_name: 'Caja 1' })), false);
  assert.equal(isInternalTest(row(1, { device_name: 'Caja 2' })), false);
});
test('la misma pregunta repetida en 24 h desde el mismo dispositivo: solo queda la última', () => {
  const rows = markReviewNoise([row(1), row(2), row(3), row(4, { question: 'otra pregunta' })]);
  const kept = applyNoiseFilter(rows, { hideInternal: true, hideRepeats: true }).map((r) => r.id).sort();
  assert.deepEqual(kept, [3, 4]);
  assert.equal(rows.find((r) => r.id === 3).repeat_count, 3);
  assert.deepEqual(applyNoiseFilter(rows, { hideInternal: false, hideRepeats: false }).length, 4);
});
test('no agrupa preguntas de dispositivos u obras sociales distintos, ni pasadas las 24 h, ni las de seguimiento', () => {
  const rows = markReviewNoise([row(1), row(2, { device_id: 8 }), row(3, { social_work_id: 6 }), row(1500), row(10, { question: 'sí' }), row(11, { question: 'sí' })]);
  assert.equal(rows.filter((r) => r.superseded).length, 0);
});
test('las pruebas internas se ocultan aunque no se repitan, y el conteo las separa de las repeticiones', () => {
  const rows = markReviewNoise([row(1, { device_name: 'Nico' }), row(2, { device_name: 'Nico' }), row(3), row(4, { question: 'distinta' }), row(5, { question: 'distinta' })]);
  const kept = applyNoiseFilter(rows).map((r) => r.id).sort((a, b) => a - b);
  assert.deepEqual(kept, [3, 5]);
  assert.deepEqual(noiseCounts(rows), { internal: 2, repeats: 1, auto: 0 });
});
test('el escenario real: 6 intentos de Nico y 1 consulta de una sucursal → la revisora solo ve la de la sucursal', () => {
  const mine = [1, 2, 3, 4, 5, 6].map((i) => row(i, { device_name: 'Nico', answer: `intento ${i}` }));
  const sucursal = row(20, { device_name: 'Caja 1', question: 'recibimos osde?' });
  const segs = groupIntoSegments(applyNoiseFilter(markReviewNoise([...mine, sucursal])));
  assert.equal(segs.length, 1); assert.equal(segs[0].items.length, 1); assert.equal(segs[0].items[0].id, 20);
});
