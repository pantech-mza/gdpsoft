import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCorrectionsPrompt, deactivateCachedAnswers, findExactCorrection,
  loadSocialWorkCorrections, pickCorrections,
} from '../../lib/assistant/admin-corrections.mjs';
import { isPilotReviewable, mergePilotReviewQueue } from '../../lib/assistant/pilot-review-scope.mjs';

const row = (verdict, suggested, nq, at, q = 'pregunta') => ({
  verdict, suggested_answer: suggested, updated_at: at,
  assistant_query_log: { question: q, normalized_question: nq, social_work_id: 7 },
});

test('pickCorrections: solo INCORRECT/PARCIAL con texto, la más reciente primero', () => {
  const list = pickCorrections([
    row('CORRECT', 'no cuenta', 'a', '2026-10-01T00:00:00Z'),
    row('INCORRECT', '', 'b', '2026-10-02T00:00:00Z'),
    row('INCORRECT', 'vieja', 'c', '2026-10-03T00:00:00Z'),
    row('PARTIAL', 'nueva', 'c', '2026-10-05T00:00:00Z'),
  ]);
  assert.deepEqual(list.map((i) => i.suggested), ['nueva', 'vieja']);
  assert.equal(findExactCorrection(list, 'c').suggested, 'nueva');
  assert.equal(findExactCorrection(list, 'zzz'), null);
  assert.equal(findExactCorrection(list, ''), null);
});

test('buildCorrectionsPrompt: vacío sin correcciones, sin duplicados y acotado', () => {
  assert.equal(buildCorrectionsPrompt([]), '');
  const list = pickCorrections([
    row('INCORRECT', 'R1', 'c', '2026-10-05T00:00:00Z', 'P1'),
    row('INCORRECT', 'R0', 'c', '2026-10-04T00:00:00Z', 'P1'),
    row('PARTIAL', 'x'.repeat(2000), 'd', '2026-10-03T00:00:00Z', 'P2'),
  ]);
  const prompt = buildCorrectionsPrompt(list);
  assert.match(prompt, /CORRECCIONES APROBADAS POR EL ADMINISTRADOR/);
  assert.equal((prompt.match(/Pregunta:/g) || []).length, 2);
  assert.ok(!prompt.includes('R0'));
  assert.ok(prompt.length < 2200);
});

test('loadSocialWorkCorrections / deactivateCachedAnswers degradan sin romper', async () => {
  const failing = { from() { throw new Error('boom'); } };
  assert.deepEqual(await loadSocialWorkCorrections(failing, 7), []);
  assert.equal(await deactivateCachedAnswers(failing, 7, 'x'), false);
  assert.deepEqual(await loadSocialWorkCorrections(failing, null), []);
  const calls = [];
  const chain = { update(v) { calls.push(v); return chain; }, eq(k, v) { calls.push([k, v]); return chain.then ? chain : chain; },
    then(res) { res({ error: null }); } };
  assert.equal(await deactivateCachedAnswers({ from: () => chain }, 7, 'nq'), true);
  assert.deepEqual(calls[0], { active: false });
});

test('Validación: las consultas ADMIN entran a la cola, sin sucursal y respetando el corte', () => {
  const scope = { started_at: '2026-10-15T10:00:00Z', seed_query_ids: [] };
  const base = { id: 1, question: 'q', created_at: '2026-10-16T10:00:00Z' };
  assert.equal(isPilotReviewable({ ...base, traffic_type: 'ADMIN', branch_id: null }, scope), true);
  assert.equal(isPilotReviewable({ ...base, traffic_type: 'ADMIN', created_at: '2026-10-14T10:00:00Z' }, scope), false);
  assert.equal(isPilotReviewable({ ...base, traffic_type: 'OTHER', branch_id: null }, scope), false);
  assert.equal(isPilotReviewable({ ...base, traffic_type: 'PILOT', branch_id: null }, scope), false);
  const merged = mergePilotReviewQueue([{ ...base, traffic_type: 'ADMIN', branch_id: null }], [], scope, 10);
  assert.equal(merged.length, 1);
});

test('route.js: usa correcciones del admin antes de buscar y clasifica tráfico ADMIN', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /findExactCorrection\(adminCorrections, normalizeQuestion\(question\), correctionWorkName/);
  assert.match(src, /route: "ADMIN_CORRECTION"/);
  assert.match(src, /adminCorrections: buildCorrectionsPrompt\(adminCorrections\)/);
  assert.match(src, /verifiedAdmin \? "ADMIN" : "OTHER"/);
  assert.ok(src.indexOf('findExactCorrection(adminCorrections') < src.indexOf('const cachedAnswer'));
});

test('Validación POST invalida la caché al corregir y UI muestra la obra social', () => {
  const api = fs.readFileSync(new URL('../../app/api/admin/validacion/route.js', import.meta.url), 'utf8');
  assert.match(api, /deactivateCachedAnswers\(supabaseAdmin,result\.data\.social_work_id,result\.data\.normalized_question\)/);
  const ui = fs.readFileSync(new URL('../../components/admin/AdminBranchValidation.jsx', import.meta.url), 'utf8');
  assert.match(ui, /Revisar respuesta/);
  assert.match(ui, /\{selected\.branch_name\} · \{selected\.social_work_name\}/);
});

import {
  answerValidatorChallenge, describeBranchValidatorException, formatBranchValidatorNote,
} from '../../lib/operations/camara-colegio-policy.mjs';
import { isOperationalCircuitQuestion } from '../../lib/assistant/operational-circuit-intent.mjs';
import { shouldPreferValidationProfile } from '../../lib/assistant/validation-profile-priority.mjs';

test('OSECAC en DP1: validador San Francisco, aclaración y repregunta «por Econo Más»', () => {
  const ex = describeBranchValidatorException({ branchName: 'DP1', branchCode: 'DP1', socialWorkName: 'OSECAC' });
  assert.equal(ex.validatorName, 'San Francisco');
  assert.match(formatBranchValidatorNote(ex), /DP1.*OSECAC.*San Francisco.*SUC: San Francisco/);
  assert.match(answerValidatorChallenge(ex, 'Por economas?'), /^No, .*no se valida por Econo Más.*San Francisco/);
  assert.match(answerValidatorChallenge(ex, 'por san francisco?'), /^Sí,/);
  assert.equal(answerValidatorChallenge(ex, 'y si esta vencida?'), null);
  assert.equal(describeBranchValidatorException({ branchName: 'DP2', branchCode: 'DP2', socialWorkName: 'OSECAC' }), null);
  assert.equal(describeBranchValidatorException({ branchName: 'DP1', branchCode: 'DP1', socialWorkName: 'OSDE' }), null);
});

test('«en mi suc» se reconoce como pregunta operativa de sucursal', () => {
  assert.equal(isOperationalCircuitQuestion('como tramito osecac en mi suc'), true);
  assert.equal(shouldPreferValidationProfile({ operationType: 'VALIDATION', profileKey: 'VALIDATION_METHOD', question: 'por donde valido osecac en mi suc' }), false);
});

import { unresolvedExplicitSocialWork } from '../../lib/assistant/explicit-social-work-protection.mjs';
test('«Por dónde valido? Econo Más?» no se toma como obra social desconocida', () => {
  assert.equal(unresolvedExplicitSocialWork({ question: 'Por donde valido? Econo mas?', dictionary: { phrases: [] }, matches: [] }), null);
  assert.equal(unresolvedExplicitSocialWork({ question: 'Por donde valido salud xyz inventada', dictionary: { phrases: [] }, matches: [] }) !== null, true);
});

test('route.js: la sucursal que consulta define el circuito (guía + validador de la Ficha + oferta de pasos)', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /routeName = "BRANCH_VALIDATION_GUIDE"/);
  assert.match(src, /formatBranchValidatorNote\(validatorException\),\n\s+ficha\?\.found \? ficha\.answer : null,/);
  assert.match(src, /¿Querés que te muestre los pasos para validar o los requisitos\?/);
  assert.match(src, /conversationState\.social_work_id/);
});

import { appendObservation, findExactObservation, pickObservations } from '../../lib/assistant/admin-corrections.mjs';
test('observaciones de respuestas correctas: se agregan debajo, sin cambiar la respuesta', () => {
  const obs = pickObservations([
    { verdict: 'CORRECT', comment: '  ', updated_at: '2026-10-20T10:00:00Z', assistant_query_log: { normalized_question: 'a' } },
    { comment: 'vieja', updated_at: '2026-10-20T10:00:00Z', assistant_query_log: { normalized_question: 'q' } },
    { comment: '*Toda receta sin validador viene autorizada.', updated_at: '2026-10-20T12:00:00Z', assistant_query_log: [{ normalized_question: 'q' }] },
  ]);
  assert.equal(obs.length, 2);
  const found = findExactObservation(obs, 'q');
  assert.match(found.comment, /^\*Toda receta/);
  assert.equal(findExactObservation(obs, 'otra'), null);
  assert.equal(appendObservation('Sí, requiere autorización.', found), 'Sí, requiere autorización.\n\nObservación: *Toda receta sin validador viene autorizada.');
  assert.equal(appendObservation('Respuesta', null), 'Respuesta');
});

test('Validación sin tope de 100 y sin la leyenda de baterías', () => {
  const api = fs.readFileSync(new URL('../../app/api/admin/validacion/route.js', import.meta.url), 'utf8');
  assert.ok(!/limit\(100\)/.test(api));
  assert.match(api, /fetchAll\(/);
  const ui = fs.readFileSync(new URL('../../components/admin/AdminBranchValidation.jsx', import.meta.url), 'utf8');
  assert.ok(!/Máximo 100/.test(ui) && !/4\.446/.test(ui));
});

import { canonicalQuestion } from '../../lib/assistant/admin-corrections.mjs';
import { buildFollowUpSearchQuestion, buildNextState, extractOffer } from '../../lib/assistant/conversation-context.mjs';

test('la pregunta con o sin el nombre de la obra social es la misma consulta', () => {
  assert.equal(canonicalQuestion('Premedic debe venir autorizado por la obra social?', 'PREMEDIC'),
    canonicalQuestion('debe venir autorizado por la obra social?', 'PREMEDIC'));
  const obs = pickObservations([{ comment: 'obs', updated_at: '2026-10-20T10:00:00Z',
    assistant_query_log: { normalized_question: 'debe venir autorizado por la obra social' } }]);
  assert.equal(findExactObservation(obs, 'premedic debe venir autorizado por la obra social', 'PREMEDIC')?.comment, 'obs');
  assert.equal(findExactObservation(obs, 'premedic requiere membrete', 'PREMEDIC'), null);
  assert.equal(findExactCorrection([], 'x', 'PREMEDIC'), null);
});

test('«Sí» a una oferta: se responde exactamente lo ofrecido', () => {
  const answer = 'Pasos...\n\n¿Querés que te muestre los pasos para validar o los requisitos?';
  assert.equal(extractOffer(answer), '¿Querés que te muestre los pasos para validar o los requisitos?');
  assert.equal(extractOffer('Sin oferta'), null);
  const state = buildNextState({ prev: null, rawQuestion: 'como valido osecac?',
    json: { ok: true, question: 'como valido osecac?', answer, route: 'BRANCH_VALIDATION_GUIDE', found: true, context: { social_work_id: 5 } } });
  assert.match(state.last_offer, /pasos para validar o los requisitos/);
  const q = buildFollowUpSearchQuestion('Sí', state);
  assert.match(q, /aceptó esta oferta/);
  assert.match(q, /primero los pasos y después los requisitos/);
  assert.ok(!/aceptó esta oferta/.test(buildFollowUpSearchQuestion('y si esta vencida?', state)));
});
