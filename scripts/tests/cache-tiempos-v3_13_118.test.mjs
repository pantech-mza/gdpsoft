import test from 'node:test';
import assert from 'node:assert/strict';
import { cachedLoad, clearCache } from '../../lib/server/ttl-cache.mjs';
import { recordTotalElapsed } from '../../lib/assistant/context-engine/live.mjs';

test('la caché evita repetir la consulta dentro del tiempo y la renueva al vencer', async () => {
  clearCache(); let calls = 0; let t = 1000; const now = () => t;
  const load = async () => ({ data: [++calls], error: null });
  assert.deepEqual((await cachedLoad('k', 60000, load, now)).data, [1]);
  t += 30000; assert.deepEqual((await cachedLoad('k', 60000, load, now)).data, [1]);
  t += 40000; assert.deepEqual((await cachedLoad('k', 60000, load, now)).data, [2]);
  assert.equal(calls, 2);
});
test('un error no se guarda en la caché', async () => {
  clearCache(); let calls = 0;
  const load = async () => (++calls === 1 ? { data: null, error: { message: 'x' } } : { data: ['ok'], error: null });
  assert.ok((await cachedLoad('e', 60000, load)).error);
  assert.deepEqual((await cachedLoad('e', 60000, load)).data, ['ok']);
});
test('consultas simultáneas comparten una sola carga', async () => {
  clearCache(); let calls = 0;
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { data: [1], error: null }; };
  await Promise.all([cachedLoad('p', 60000, load), cachedLoad('p', 60000, load), cachedLoad('p', 60000, load)]);
  assert.equal(calls, 1);
});
test('registra el tiempo total solo si supera al ya guardado', async () => {
  const updates = [];
  const mk = (elapsed) => ({ from: () => ({ select: () => { const q = { eq: () => q, gte: () => q, order: () => q, limit: () => q, then: (ok) => Promise.resolve({ data: [{ id: 5, elapsed_ms: elapsed }] }).then(ok) }; return q; }, update: (v) => ({ eq: async () => { updates.push(v); } }) }) });
  assert.equal(await recordTotalElapsed(mk(3000), { branchId: 1, socialWorkId: 2, question: 'x', elapsedMs: 9000 }), true);
  assert.deepEqual(updates[0], { elapsed_ms: 9000 });
  assert.equal(await recordTotalElapsed(mk(9500), { branchId: 1, socialWorkId: 2, question: 'x', elapsedMs: 9000 }), false);
});
