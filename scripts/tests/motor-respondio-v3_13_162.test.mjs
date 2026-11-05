import test from 'node:test';
import assert from 'node:assert/strict';
import { engineAnswered } from '../../lib/assistant/context-engine/live.mjs';

test('OK y aclaración con datos verificados cuentan como respondida', () => {
  assert.equal(engineAnswered({ status: 'OK' }), true);
  assert.equal(engineAnswered({ status: 'CLARIFY', sources: [{ verificada: true }] }), true);
});
test('aclaración sin datos, sin base o error no cuentan', () => {
  assert.equal(engineAnswered({ status: 'CLARIFY', sources: [] }), false);
  assert.equal(engineAnswered({ status: 'CLARIFY', sources: [{ verificada: false }] }), false);
  assert.equal(engineAnswered({ status: 'NO_BASIS' }), false);
  assert.equal(engineAnswered(null), false);
});
