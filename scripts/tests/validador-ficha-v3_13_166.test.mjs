import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINE_SYSTEM_PROMPT } from '../../lib/assistant/context-engine/core.mjs';
test('regla 3d: el validador sale de la ficha y no de URLs copiadas de normativas', () => {
  assert.match(ENGINE_SYSTEM_PROMPT, /3d\. VALIDADOR/);
  assert.match(ENGINE_SYSTEM_PROMPT, /campo Validador/);
  assert.match(ENGINE_SYSTEM_PROMPT, /NO copies direcciones web/);
});
