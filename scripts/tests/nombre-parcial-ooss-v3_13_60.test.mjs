import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSocialWorkDictionary, detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
import { buildNextState, pickPendingSocialWork, applySuggestion, isFollowUpMessage } from '../../lib/assistant/conversation-context.mjs';

const detect = (works, text) => detectSocialWorks({ text, dictionary: buildSocialWorkDictionary({ socialWorks: works, aliases: [] }) });
const A = [{ id: 1, name: 'OSEP' }, { id: 2, name: 'OSEP OYTE' }];
const B = [...A, { id: 3, name: 'OYTE SALUD' }];

test('«OYTE» solo: si hay una única obra social con ese nombre, se toma', () => {
  const r = detect(A, 'OYTE si aun no llega la medicacion que puedo hacer?');
  assert.deepEqual(r.map((x) => x.name), ['OSEP OYTE']);
});
test('«OYTE» en varias obras sociales: se devuelven todas para elegir', () => {
  const r = detect(B, 'oyte');
  assert.deepEqual(r.map((x) => x.name).sort(), ['OSEP OYTE', 'OYTE SALUD']);
  assert.ok(r.every((x) => x.source === 'AMBIGUOUS_TOKEN'));
});
test('«osep oyte» elige la más específica; «osep» solo sigue siendo OSEP', () => {
  assert.deepEqual(detect(B, 'osep oyte').map((x) => x.name), ['OSEP OYTE']);
  assert.deepEqual(detect(B, 'osep').map((x) => x.name), ['OSEP']);
});

const state = (extra = {}) => ({
  topic_question: 'x', updated_at: new Date().toISOString(),
  pending: { kind: 'CHOOSE_SOCIAL_WORK', unresolved: 'OYTE', options: ['OSEP OYTE', 'OYTE SALUD'], question: 'OYTE si aun no llega la medicacion que puedo hacer?' }, ...extra,
});
test('el estado recuerda la consulta y las opciones', () => {
  const next = buildNextState({ prev: null, rawQuestion: 'OYTE si aun no llega la medicacion que puedo hacer?',
    json: { ok: true, route: 'AMBIGUOUS_SOCIAL_WORK', answer: '...', found: false, question: 'OYTE si aun no llega la medicacion que puedo hacer?',
      suggestion: { unresolved: 'OYTE', options: ['OSEP OYTE', 'OYTE SALUD'] } } });
  assert.equal(next?.pending?.kind, 'CHOOSE_SOCIAL_WORK');
  assert.deepEqual(next.pending.options, ['OSEP OYTE', 'OYTE SALUD']);
});
test('la respuesta del usuario elige la opción y se continúa la consulta original', () => {
  assert.equal(pickPendingSocialWork('osep oyte', state()), 'OSEP OYTE');
  assert.equal(pickPendingSocialWork('la segunda', state()), 'OYTE SALUD');
  assert.equal(pickPendingSocialWork('2', state()), 'OYTE SALUD');
  assert.equal(pickPendingSocialWork('oyte salud', state()), 'OYTE SALUD');
  assert.equal(pickPendingSocialWork('no se cual', state()), null);
  assert.equal(pickPendingSocialWork('osep oyte', state({ updated_at: '2020-01-01T00:00:00Z' })), null);
  const st = state();
  assert.equal(applySuggestion({ question: st.pending.question, unresolved: st.pending.unresolved, name: 'OSEP OYTE' }),
    'OSEP OYTE si aun no llega la medicacion que puedo hacer?');
  assert.equal(isFollowUpMessage('osep oyte', state(), { socialWorkId: 1 }), false);
});
test('cableado: query ofrece opciones, chat delega y la UI de indexación separa árboles', () => {
  const q = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(q, /route: "AMBIGUOUS_SOCIAL_WORK"/);
  assert.match(q, /pickPendingSocialWork\(question, conversationState\)/);
  const chat = fs.readFileSync('app/api/assistant/chat/route.js', 'utf8');
  assert.match(chat, /varias obras sociales posibles/);
  const page = fs.readFileSync('app/admin/obras-sociales/[id]/page.jsx', 'utf8');
  assert.match(page, /generateTrees = true/);
  assert.match(page, /La normativa quedó indexada en OpenAI: el bot ya puede usarla/);
  assert.match(page, /autoOutcome\.status === "INDEXED" \? "Normativa indexada"/);
});
