import test from 'node:test'; import assert from 'node:assert/strict';
import { markReviewNoise, noiseCounts, triageRow } from '../../lib/review/review-noise.mjs';
import { groupIntoSegments, filterSegments, summarize } from '../../lib/review/conversation-groups.mjs';
const T = (min) => new Date(Date.UTC(2026, 9, 27, 12, 0) + min * 60000).toISOString();
const row = (id, over = {}) => ({ id, branch_id: 1, device_id: 7, device_name: 'Caja 1', social_work_id: 5, question: `pregunta ${id}`, answer: 'Respuesta ok', found: true, route: 'CONTEXT_ENGINE', created_at: T(id), traffic_type: 'PILOT', ...over });

test('respuesta del motor verificada: se da por buena (no hace falta revisar)', () => {
  assert.equal(triageRow(row(1)).needs_review, false);
  assert.equal(triageRow(row(2, { route: 'ADMIN_CORRECTION' })).needs_review, false);
});
test('hay que revisar: sin información, sin respuesta, error, no vino del motor', () => {
  assert.equal(triageRow(row(1, { found: false })).needs_review, true);
  assert.equal(triageRow(row(1, { answer: '' })).needs_review, true);
  assert.equal(triageRow(row(1, { answer: 'No se pudo procesar' })).needs_review, true);
  const t = triageRow(row(1, { route: 'SOCIAL_WORK_RULE' }));
  assert.equal(t.needs_review, true); assert.ok(t.review_reasons.includes('No la respondió el motor'));
  assert.equal(triageRow(row(1, { route: null, source: null })).needs_review, true);
});
test('si ya fue revisada, sigue visible; los «sí/gracias» no se validan', () => {
  assert.equal(triageRow(row(1, { review: { verdict: 'CORRECT' } })).needs_review, true);
  assert.equal(triageRow(row(1, { question: 'gracias' })).needs_review, false);
});
test('si repitieron la pregunta (la respuesta no los dejó conformes) se revisa aunque el motor la haya dado por buena', () => {
  const rows = markReviewNoise([row(1, { question: 'igual' }), row(2, { question: 'igual' })]);
  const last = rows.find((r) => r.id === 2);
  assert.equal(last.needs_review, true); assert.ok(last.review_reasons.includes('Repitieron la pregunta'));
});
test('muestreo de control: 1 de cada 10 de las buenas se muestra', () => {
  const rows = markReviewNoise(Array.from({ length: 30 }, (_, i) => row(i + 1)));
  const shown = rows.filter((r) => r.needs_review);
  assert.deepEqual(shown.map((r) => r.id), [10, 20, 30]);
  assert.ok(shown.every((r) => r.spot_check));
  assert.equal(noiseCounts(rows).auto, 27);
  assert.equal(markReviewNoise([row(10)], { spotEvery: 0 })[0].needs_review, false);
});
test('tramos: las buenas no cuentan como pendientes y los tramos sin nada que revisar se ocultan', () => {
  const rows = markReviewNoise([
    row(1, { device_id: 7 }), row(2, { device_id: 7 }),
    row(3, { device_id: 8, found: false, answer: 'No tengo información' }), row(4, { device_id: 8 }),
  ], { spotEvery: 0 });
  const segs = groupIntoSegments(rows);
  const vis = filterSegments(segs, { status: 'PENDING', onlyReviewable: true });
  assert.equal(vis.length, 1);
  assert.equal(vis[0].answerCount, 1); assert.equal(vis[0].autoCount, 1);
  assert.equal(filterSegments(segs, { status: 'ALL', onlyReviewable: false }).length, 2);
  assert.equal(summarize(segs).pending, 1);
});
