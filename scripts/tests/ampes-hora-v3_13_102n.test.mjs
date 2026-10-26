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
