import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldGoLive, liveConfig } from '../../lib/assistant/context-engine/live.mjs';
const cfg = liveConfig({ CONTEXT_ENGINE_MODE: 'live', OPENAI_API_KEY: 'x' });
test('el motor vivo no reemplaza respuestas de estado / inactiva / desconocida', () => {
  for (const route of ['INACTIVE_SOCIAL_WORK', 'STRUCTURED_SOCIAL_WORK_STATUS', 'UNKNOWN_EXPLICIT_SOCIAL_WORK'])
    assert.equal(shouldGoLive(cfg, { socialWorkId: 1, branchId: 2, route, ok: true, rand: 0 }), false, route);
  assert.equal(shouldGoLive(cfg, { socialWorkId: 1, branchId: 2, route: 'SEMANTIC', ok: true, rand: 0 }), true);
});
