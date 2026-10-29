import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { engineTriedKey, markEngineTried, consumeEngineTried, shouldGoLive, liveConfig } from '../../lib/assistant/context-engine/live.mjs';
test('la marca de «motor ya intentado» se consume una sola vez', () => {
  const k = engineTriedKey('abc', '  hola ');
  assert.equal(consumeEngineTried(k), false);
  markEngineTried(k); assert.equal(consumeEngineTried(engineTriedKey('abc', 'hola')), true);
  assert.equal(consumeEngineTried(k), false);
});
test('el POST no vuelve a correr el motor sobre una respuesta del motor', () => {
  const cfg = liveConfig({ CONTEXT_ENGINE_MODE: 'live', OPENAI_API_KEY: 'x' });
  assert.equal(shouldGoLive(cfg, { socialWorkId: 1, branchId: 2, route: 'CONTEXT_ENGINE', ok: true, rand: 0 }), false);
});
test('el motor se intenta antes de la búsqueda lenta y quedan los respaldos', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  const first = src.indexOf('MOTOR PRIMERO'), search = src.indexOf('let result = await queryFileSearch({\n  question: specialNormativeTopic');
  assert.ok(first > 0 && search > first, 'el motor debe ir antes de queryFileSearch');
  assert.match(src, /consumeEngineTried\(engineTriedKey\(wrapperConversationId, rawQuestion\)\)/);
});
