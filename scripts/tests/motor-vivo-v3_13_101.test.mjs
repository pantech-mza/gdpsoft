import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { liveConfig, shouldGoLive, adoptable, runLive, syncQueryLog } from '../../lib/assistant/context-engine/live.mjs';

test('apagado por defecto y solo con CONTEXT_ENGINE_MODE=live', () => {
  assert.equal(liveConfig({}).enabled, false);
  assert.equal(liveConfig({ CONTEXT_ENGINE_MODE: 'shadow', OPENAI_API_KEY: 'k' }).enabled, false);
  assert.equal(liveConfig({ CONTEXT_ENGINE_MODE: 'live' }).enabled, false);
  const c = liveConfig({ CONTEXT_ENGINE_MODE: 'live', OPENAI_API_KEY: 'k', CONTEXT_ENGINE_BRANCHES: '3, 7', CONTEXT_ENGINE_LIVE_PCT: '50' });
  assert.equal(c.enabled, true); assert.deepEqual(c.branches, [3, 7]); assert.equal(c.model, 'gpt-4.1');
});
test('no reemplaza credenciales, cortesía, imágenes ni correcciones del admin; respeta sucursales y porcentaje', () => {
  const c = liveConfig({ CONTEXT_ENGINE_MODE: 'live', OPENAI_API_KEY: 'k', CONTEXT_ENGINE_BRANCHES: '3', CONTEXT_ENGINE_LIVE_PCT: '50' });
  const base = { socialWorkId: 10, branchId: 3, route: 'FILE_SEARCH', ok: true, rand: 0.1 };
  assert.equal(shouldGoLive(c, base), true);
  for (const route of ['CREDENTIALS_PROTECTED', 'COURTESY', 'IMAGE_REPORT', 'ADMIN_CORRECTION', 'AMBIGUOUS_SOCIAL_WORK']) assert.equal(shouldGoLive(c, { ...base, route }), false, route);
  assert.equal(shouldGoLive(c, { ...base, branchId: 9 }), false);
  assert.equal(shouldGoLive(c, { ...base, rand: 0.9 }), false);
  assert.equal(shouldGoLive(c, { ...base, socialWorkId: NaN }), false);
  assert.equal(shouldGoLive(c, { ...base, ok: false }), false);
});
test('solo se adopta OK o CLARIFY con texto; el resto cae al bot actual', () => {
  assert.equal(adoptable({ status: 'OK', answer: 'x' }), true);
  assert.equal(adoptable({ status: 'CLARIFY', answer: 'x' }), true);
  for (const status of ['NO_BASIS', 'UNVERIFIED', 'ERROR']) assert.equal(adoptable({ status, answer: 'x' }), false);
  assert.equal(adoptable({ status: 'OK', answer: ' ' }), false);
  assert.equal(adoptable(null), false);
});
test('ante error del registro o de la base, runLive no lanza y devuelve used=false', async () => {
  const sb = { from: () => { throw new Error('db caída'); } };
  const r = await runLive({ supabase: sb, cfg: liveConfig({ CONTEXT_ENGINE_MODE: 'live', OPENAI_API_KEY: 'k', CONTEXT_ENGINE_TIMEOUT_MS: '5000' }), question: 'q', socialWorkId: 1, branchId: 1, circuit: 'CAMARA' });
  assert.equal(r.used, false);
  assert.equal(await syncQueryLog(sb, { branchId: 1, socialWorkId: 1, question: 'q', answer: 'a', route: 'X' }), false);
});
test('el enganche en la ruta es opcional y va antes de la sombra', () => {
  const s = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const i = s.indexOf('MODO VIVO'), j = s.indexOf('MODO SOMBRA');
  assert.ok(i > 0 && j > i);
  assert.match(s.slice(i, j), /catch \{\s*\/\/ el motor vivo es opcional/);
});
