import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPartialAnswer, readSse, sseResponse } from '../../lib/assistant/stream-utils.mjs';
import { makeCallModel } from '../../lib/assistant/context-engine/openai.mjs';

test('extractPartialAnswer devuelve el texto parcial y decodifica escapes', () => {
  assert.equal(extractPartialAnswer('{"respuesta":"Hola'), 'Hola');
  assert.equal(extractPartialAnswer('{"respuesta":"Línea 1\\nLínea \\"2\\" \\u00e1'), 'Línea 1\nLínea "2" á');
  assert.equal(extractPartialAnswer('{"respuesta":"corte \\u00'), 'corte ');
  assert.equal(extractPartialAnswer('{"respuesta":"fin","necesita_aclaracion":false}'), 'fin');
  assert.equal(extractPartialAnswer('{"nece'), '');
});

test('sseResponse + readSse: borradores y evento final', async () => {
  const res = sseResponse(async (emit) => { emit('draft', { text: 'a' }); emit('draft', { text: 'ab' }); return { status: 200, data: { ok: true, answer: 'ab' } }; });
  const events = []; await readSse(res.body, (e, d) => events.push([e, d]));
  assert.deepEqual(events.map((x) => x[0]), ['draft', 'draft', 'final']);
  assert.equal(events[2][1].data.answer, 'ab');
});

test('sseResponse: si falla el trabajo igual cierra con un final de error', async () => {
  const res = sseResponse(async () => { throw new Error('x'); });
  const events = []; await readSse(res.body, (e, d) => events.push([e, d]));
  assert.equal(events.at(-1)[0], 'final'); assert.equal(events.at(-1)[1].status, 500);
});

test('callModel con onDelta acumula el texto, informa fragmentos y devuelve tokens', async () => {
  const enc = new TextEncoder();
  const lines = ['{"respuesta":"Hol', 'a mundo"}'].map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`);
  lines.push(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } })}\n\n`, 'data: [DONE]\n\n');
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { assert.equal(JSON.parse(init.body).stream, true);
    return new Response(new ReadableStream({ start(c) { lines.forEach((l) => c.enqueue(enc.encode(l))); c.close(); } }), { status: 200 }); };
  try {
    const seen = [];
    const out = await makeCallModel({ apiKey: 'k' })([{ role: 'user', content: 'x' }], { model: 'gpt-4.1', onDelta: (t) => seen.push(extractPartialAnswer(t)) });
    assert.equal(out.text, '{"respuesta":"Hola mundo"}'); assert.deepEqual(seen, ['Hol', 'Hola mundo']); assert.equal(out.tin, 10); assert.equal(out.tout, 5);
  } finally { globalThis.fetch = orig; }
});

test('callModel sin onDelta sigue igual (sin stream)', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => { assert.equal(JSON.parse(init.body).stream, undefined);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }), { status: 200 }); };
  try { const out = await makeCallModel({ apiKey: 'k' })([], { model: 'gpt-4.1' }); assert.equal(out.text, '{}'); } finally { globalThis.fetch = orig; }
});
