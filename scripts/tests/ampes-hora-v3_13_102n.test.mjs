import test from 'node:test'; import assert from 'node:assert/strict';
import { unresolvedExplicitSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';
import { buildContextDocument, nowArgentina } from '../../lib/assistant/context-engine/core.mjs';
const dictionary = { phrases: [{ phrase: 'AMPES ASISTIR', socialWork: { id: 1, name: 'AMPES ASISTIR' } }, { phrase: 'ampes', socialWork: { id: 1, name: 'AMPES ASISTIR' } }] };
const m = [{ id: 1, name: 'AMPES ASISTIR', match: 'ampes', source: 'UNIQUE_TOKEN' }];
test('«ampes salud» no se asume AMPES ASISTIR', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'recibimos ampes salud', dictionary, matches: m }), 'AMPES SALUD');
  assert.equal(unresolvedExplicitSocialWork({ question: 'recibimos ampes', dictionary, matches: m }), null);
  assert.equal(unresolvedExplicitSocialWork({ question: 'recibimos ampes asistir', dictionary, matches: [{ ...m[0], source: 'NAME' }] }), null);
});
test('el documento trae el día (sin la hora) de la Argentina', () => {
  const d = Date.UTC(2026, 9, 26, 22, 17); // 19:17 ART
  assert.match(nowArgentina(d), /lunes.*26/); assert.doesNotMatch(nowArgentina(d), /19:17/);
  assert.match(buildContextDocument({ work: { id: 1, name: 'X' } }, { now: d }).text, /Hoy es [^\n]*26\/10\/2026/);
});

import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
test('«todas las marcas» no cambia a PASTELEROS por su alias «TODAS LAS SUCURSALES»', () => {
  const dictionary = buildSocialWorkDictionary({
    socialWorks: [{ id: 62, name: 'PASTELEROS' }, { id: 7, name: 'OSDE' }],
    aliases: [{ social_work_id: 62, alias_name: 'PASTELEROS - TODAS LAS SUCURSALES' }] });
  assert.deepEqual(detectSocialWorks({ text: 'ingresan todas las marcas?', dictionary }), []);
  assert.equal(detectSocialWorks({ text: 'recibimos pasteleros', dictionary })[0]?.id, 62);
});

test('«recibimos ampes salud» (consulta de aceptación) también se marca como no resuelta', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'recibimos ampes salud', dictionary, matches: m }), 'AMPES SALUD');
});
test('el motor traduce «el resto de las sucursales» a la sucursal que consulta', async () => {
  const { ENGINE_SYSTEM_PROMPT } = await import('../../lib/assistant/context-engine/core.mjs');
  assert.match(ENGINE_SYSTEM_PROMPT, /resto de las sucursales/);
});

test('stripMarkdown deja una sola vez el nombre del enlace', async () => {
  const { stripMarkdown } = await import('../../lib/assistant/plain-text.mjs');
  assert.equal(stripMarkdown('por [Mis Validaciones](https://www.misvalidaciones.com.ar/) ([Mis Validaciones](https://www.misvalidaciones.com.ar/)), verificando'), 'por Mis Validaciones, verificando');
});

test('«ampes salud» sugiere primero AMPES ASISTIR (comparte la palabra AMPES)', async () => {
  const { suggestSocialWorks } = await import('../../lib/assistant/social-work-suggestions.mjs');
  assert.deepEqual(suggestSocialWorks('AMPES SALUD', ['ANDESALUD', 'AMFFA SALUD', 'AMPES ASISTIR', 'OSDE']), ['AMPES ASISTIR']);
  assert.ok(suggestSocialWorks('berckley', ['BERKLEY ART', 'OSDE']).length >= 1);
});
test('el motor reescribe «el resto de las sucursales» para la sucursal que consulta', async () => {
  const { runContextEngine } = await import('../../lib/assistant/context-engine/engine.mjs');
  const OBS = 'El resto de las sucursales solo podrá recibir después de las 20hs.';
  const mk = (a) => ({ text: JSON.stringify({ estado: 'OK', respuesta: a, fuentes: [{ seccion: 'Observación', fecha: '2026-10-26', cita: OBS }] }), tin: 1, tout: 1 });
  const tables = { social_works: [{ id: 5, name: 'AMPES ASISTIR' }], branches: [{ id: 1, name: 'DP1', branch_type: 'CAMARA' }],
    social_work_notes: [{ id: 1, social_work_id: 5, status: 'APPROVED', approved: true, body: OBS, created_at: '2026-10-26' }] };
  const builder = (name) => { const b = { select: () => b, eq: () => b, is: () => b, not: () => b, order: () => b, limit: () => b, in: () => b,
    maybeSingle: () => Promise.resolve({ data: (tables[name] || [])[0] || null }), then: (res, rej) => Promise.resolve({ data: tables[name] || [] }).then(res, rej) }; return b; };
  let calls = 0; const prompts = [];
  const callModel = async (msgs) => { calls += 1; prompts.push(JSON.stringify(msgs)); return mk(calls === 1 ? OBS : 'Sí, la recibimos en DP1 solo después de las 20hs.'); };
  const r = await runContextEngine({ supabase: { from: builder }, callModel, model: 'x', question: 'recibimos ampes asistir?', socialWorkId: 5, branchId: 1, circuit: 'CAMARA' });
  assert.equal(calls, 2); assert.match(prompts[1], /INSTRUCCIÓN INTERNA/); assert.match(r.answer, /DP1/);
});

test('el motor no le pide la sucursal a quien ya la tiene (reintento)', async () => {
  const { runContextEngine } = await import('../../lib/assistant/context-engine/engine.mjs');
  const OBS = 'Las sucursales habilitadas pueden validar antes de las 20hs y el resto solo después.';
  const mk = (a) => ({ text: JSON.stringify({ estado: 'OK', respuesta: a, fuentes: [{ seccion: 'Observación', fecha: '2026-10-26', cita: OBS }] }), tin: 1, tout: 1 });
  const tables = { social_works: [{ id: 77, name: 'AMPES ASISTIR' }], branches: [{ id: 1, name: 'DP1', branch_type: 'CAMARA' }],
    social_work_notes: [{ id: 1, social_work_id: 77, status: 'APPROVED', approved: true, body: OBS, created_at: '2026-10-26' }] };
  const builder = (name) => { const b = { select: () => b, eq: () => b, is: () => b, not: () => b, order: () => b, limit: () => b, in: () => b,
    maybeSingle: () => Promise.resolve({ data: (tables[name] || [])[0] || null }), then: (res, rej) => Promise.resolve({ data: tables[name] || [] }).then(res, rej) }; return b; };
  let calls = 0;
  const callModel = async () => { calls += 1; return mk(calls === 1 ? 'Sí, pero no aclaraste la sucursal: necesito que me indiques cuál es.' : 'Sí, en DP1 solo después de las 20 hs.'); };
  const r = await runContextEngine({ supabase: { from: builder }, callModel, model: 'x', question: 'recibimos ampes asistir?', socialWorkId: 77, branchId: 1, circuit: 'CAMARA' });
  assert.equal(calls, 2); assert.match(r.answer, /DP1/);
});
