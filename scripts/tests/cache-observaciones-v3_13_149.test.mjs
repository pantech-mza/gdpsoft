import test from 'node:test';
import assert from 'node:assert/strict';
import { deactivateAllCachedAnswers } from '../../lib/assistant/admin-corrections.mjs';
test('al cambiar una observación se desactivan las respuestas guardadas de esa obra social', async () => {
  const calls = [];
  const q = { update: (v) => { calls.push(['update', v]); return q; }, eq: (k, v) => { calls.push(['eq', k, v]); return q.done ? q : Object.assign(Promise.resolve({ error: null }), { eq: (k2, v2) => { calls.push(['eq', k2, v2]); return Promise.resolve({ error: null }); } }); } };
  const supa = { from: (t) => { calls.push(['from', t]); return q; } };
  assert.equal(await deactivateAllCachedAnswers(supa, 59), true);
  assert.deepEqual(calls[0], ['from', 'assistant_answer_cache']);
  assert.deepEqual(calls[1], ['update', { active: false }]);
  assert.deepEqual(calls[2], ['eq', 'social_work_id', 59]);
  assert.equal(await deactivateAllCachedAnswers(supa, 0), false);
});
