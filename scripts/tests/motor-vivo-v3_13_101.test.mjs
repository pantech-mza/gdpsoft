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

test('tolera comillas y espacios en las variables y expone un diagnóstico sin claves', async () => {
  const { engineDiagnostics } = await import('../../lib/assistant/context-engine/live.mjs');
  const env = { CONTEXT_ENGINE_MODE: ' "live" ', CONTEXT_ENGINE_BRANCHES: '"1, 24"', OPENAI_API_KEY: 'sk-secreta', VERCEL_GIT_COMMIT_REF: 'piloto-v3.13.101' };
  const c = liveConfig(env); assert.equal(c.enabled, true); assert.deepEqual(c.branches, [1, 24]);
  const d = engineDiagnostics(env); assert.equal(d.mode, 'live'); assert.equal(d.hasKey, true);
  assert.ok(!JSON.stringify(d).includes('sk-secreta'));
  assert.equal(engineDiagnostics({}).mode, 'off'); assert.equal(engineDiagnostics({}).modeRaw, '(sin cargar)');
});

test('las citas toleran formato markdown y fragmentos con puntos suspensivos, pero no inventos', async () => {
  const { verifyEngineOutput } = await import('../../lib/assistant/context-engine/core.mjs');
  const doc = '### Observación\n*Todas las recetas se validan. * Si supera los 100 mil pesos (a pagar) el afiliado deberá pedir autorización.\nOtra línea sobre vigencia de 30 días.';
  const mk = (cita) => JSON.stringify({ respuesta: 'ok', fuentes: [{ seccion: 'Obs', fecha: null, cita }] });
  assert.equal(verifyEngineOutput(mk('Todas las recetas se validan. Si supera los 100 mil pesos'), doc).status, 'OK');
  assert.equal(verifyEngineOutput(mk('Todas las recetas se validan ... deberá pedir autorización'), doc).status, 'OK');
  assert.equal(verifyEngineOutput(mk('No hace falta receta para crónicos nunca'), doc).status, 'UNVERIFIED');
  assert.equal(verifyEngineOutput(mk('Todas las recetas se validan ... texto inventado que no está'), doc).status, 'UNVERIFIED');
});
test('el prompt pide respuestas breves y sin citar las fuentes descartadas', async () => {
  const { ENGINE_SYSTEM_PROMPT } = await import('../../lib/assistant/context-engine/core.mjs');
  assert.match(ENGINE_SYSTEM_PROMPT, /BREVE/); assert.match(ENGINE_SYSTEM_PROMPT, /NO se menciona ni se cita/);
});

test('si la respuesta omite el dato del ganador del conflicto, se agrega la cita ganadora (caso OSECAC DP1)', async () => {
  const { verifyEngineOutput } = await import('../../lib/assistant/context-engine/core.mjs');
  const doc = 'Para OSECAC en DP1, el circuito indicado es directo por el validador de San Francisco.\nOSECAC se recibe de forma directa utilizando el validador de Econo Más. No utilizar el circuito Cámara-Colegio para OSECAC desde DP1.';
  const mk = (respuesta) => JSON.stringify({ respuesta, fuentes: [{ seccion: 'CORRECCIONES', fecha: '2026-10-22', cita: 'Para OSECAC en DP1, el circuito indicado es directo por el validador de San Francisco.' }],
    conflictos: [{ tema: 't', gana: { seccion: 'CORRECCIONES', fecha: '2026-10-22', cita: 'el circuito indicado es directo por el validador de San Francisco' }, pierde: { seccion: 'REGLAS', fecha: '2026-09-28', cita: 'se recibe de forma directa utilizando el validador de Econo Más' } }] });
  const mala = verifyEngineOutput(mk('Sí, podés recibir OSECAC por circuito Cámara.'), doc);
  assert.match(mala.answer, /San Francisco/); assert.equal(mala.status, 'OK');
  const buena = verifyEngineOutput(mk('Sí. En DP1 se valida directo por San Francisco.'), doc);
  assert.equal(buena.answer, 'Sí. En DP1 se valida directo por San Francisco.');
});

test('si el cuerpo usa el dato de la pieza perdedora, se reemplaza por la cita ganadora (caso OSECAC Econo Más)', async () => {
  const { verifyEngineOutput } = await import('../../lib/assistant/context-engine/core.mjs');
  const doc = 'Para OSECAC en DP1, el circuito indicado es directo por el validador de San Francisco.\nOSECAC se recibe de forma directa utilizando el validador de Econo Más.';
  const r = verifyEngineOutput(JSON.stringify({ respuesta: 'Sí, validá directo con el validador de Econo Más.', fuentes: [{ seccion: 'C', fecha: '2026-10-22', cita: 'el circuito indicado es directo por el validador de San Francisco' }],
    conflictos: [{ tema: 't', gana: { seccion: 'CORRECCIONES', fecha: '2026-10-22', cita: 'el circuito indicado es directo por el validador de San Francisco' }, pierde: { seccion: 'REGLAS', fecha: '2026-09-28', cita: 'se recibe de forma directa utilizando el validador de Econo Más' } }] }), doc);
  assert.match(r.answer, /San Francisco/); assert.doesNotMatch(r.answer, /Econo/);
});
test('temperatura 0 solo en modelos gpt-4.x', () => {
  const s = fs.readFileSync(new URL('../../lib/assistant/context-engine/openai.mjs', import.meta.url), 'utf8');
  assert.match(s, /\^gpt-4\/i\.test\(model\) \? \{ temperature: 0 \}/);
});
