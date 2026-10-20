import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSuggestionAnswer, editDistance, suggestSocialWorks } from '../../lib/assistant/social-work-suggestions.mjs';
import { applySuggestion, buildNextState, isSuggestionConfirmation } from '../../lib/assistant/conversation-context.mjs';

const NAMES = ['OSTES', 'OSDE', 'OSDEPYM', 'OSECAC', 'OSEP', 'PREMEDIC', 'LA SEGUNDA ART / LA SEGUNDA PERSONAS', 'GALENO'];

test('editDistance básico', () => {
  assert.equal(editDistance('oste', 'ostes'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
});

test('OSTE sugiere OSTES (prefijo gana a OSDE, que también está a distancia 1)', () => {
  assert.deepEqual(suggestSocialWorks('OSTE', NAMES), ['OSTES']);
});

test('errores de tipeo y casos sin sugerencia', () => {
  assert.deepEqual(suggestSocialWorks('PREMEDIK', NAMES), ['PREMEDIC']);
  assert.deepEqual(suggestSocialWorks('OSECAK', NAMES), ['OSECAC']);
  assert.deepEqual(suggestSocialWorks('SALUD XYZ INVENTADA', NAMES), []);
  assert.deepEqual(suggestSocialWorks('OSDE', NAMES), ['OSDEPYM']); // OSDE existe, pero la lista no lo excluye por prefijo
  assert.deepEqual(suggestSocialWorks('xx', NAMES), []);
});

test('texto de la respuesta', () => {
  assert.equal(buildSuggestionAnswer('OSTE', ['OSTES']),
    'No pude identificar OSTE entre las obras sociales activas de GDPSoft. ¿Quizás quisiste consultar por OSTES? Confirmame el nombre para poder ayudarte con la información correspondiente.');
  assert.match(buildSuggestionAnswer('OS', ['A', 'B', 'C']), /por A, B o C\?/);
  assert.equal(buildSuggestionAnswer('X', []), null);
});

test('confirmación: «sí» o el nombre continúan la consulta original con la obra social corregida', () => {
  const json = { ok: true, question: 'Oste en mi sucursal va por camara-colegio?', answer: 'x', route: 'UNKNOWN_EXPLICIT_SOCIAL_WORK',
    found: false, suggestion: { unresolved: 'OSTE', name: 'OSTES', options: ['OSTES'] } };
  const state = buildNextState({ prev: null, rawQuestion: 'Oste en mi sucursal va por camara-colegio?', json });
  assert.equal(state.pending.kind, 'CONFIRM_SOCIAL_WORK');
  for (const reply of ['Si', 'sí, esa', 'OSTES', 'Obra social OSTES', 'dale']) assert.equal(isSuggestionConfirmation(reply, state), true, reply);
  for (const reply of ['y si esta vencida con osde?', 'como valido osde en mi sucursal hoy']) assert.equal(isSuggestionConfirmation(reply, state), false, reply);
  assert.equal(applySuggestion(state.pending), 'OSTES en mi sucursal va por camara-colegio?');
  assert.equal(isSuggestionConfirmation('si', null), false);
});

test('route.js ofrece la sugerencia y continúa al confirmar', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /suggestSocialWorks\(name,/);
  assert.match(src, /question = applySuggestion\(conversationState\.pending\)/);
  assert.match(src, /suggestion: \{ unresolved: name, name: suggestions\[0\]/);
});

import { isFollowUpMessage } from '../../lib/assistant/conversation-context.mjs';
test('repreguntas largas que empiezan con «Y» siguen el tema anterior', () => {
  const state = { v: 1, updated_at: new Date().toISOString(), social_work_id: 9, topic_question: 'pap descuento', last_question: 'si es con obra social?', pending: null };
  assert.equal(isFollowUpMessage('Y novo a la par? Que descuento tiene y que productos entran?', state, { socialWorkId: 9 }), true);
  assert.equal(isFollowUpMessage('Requisitos de la receta para validar con descuento en la farmacia de turno hoy mismo por favor y gracias', state, { socialWorkId: 9 }), false);
  assert.equal(isFollowUpMessage('Y novo a la par? Que descuento tiene y que productos entran?', state, { socialWorkId: 10 }), false);
});

import { buildPartialAnswerQuestion, isNotFoundAnswer } from '../../lib/assistant/conversation-context.mjs';
test('repregunta sin respuesta literal: se reintenta con lo que la normativa sí dice', () => {
  assert.equal(isNotFoundAnswer('No encuentro esa información en la normativa vigente.'), true);
  assert.equal(isNotFoundAnswer('PAP Descuento se aplica sobre el PVP.'), false);
  const q = buildPartialAnswerQuestion('y novo a la par? que descuento tiene?', { topic_question: 'pap descuento' });
  assert.match(q, /«pap descuento»/);
  assert.match(q, /NO figura/);
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /followUp\.isFollowUp && isNotFoundAnswer\(result\?\.answer\)/);
});
