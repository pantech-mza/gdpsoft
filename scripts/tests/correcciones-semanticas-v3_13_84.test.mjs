import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cosine, rankBySimilarity, parseJudge, buildJudgePrompt, matchCorrectionSemantically } from '../../lib/assistant/correction-semantic.mjs';
import { pickCorrections } from '../../lib/assistant/admin-corrections.mjs';

const route = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../app/api/admin/validacion/route.js', import.meta.url), 'utf8');
const ui = fs.readFileSync(new URL('../../components/admin/AdminBranchValidation.jsx', import.meta.url), 'utf8');
const corrections = fs.readFileSync(new URL('../../lib/assistant/admin-corrections.mjs', import.meta.url), 'utf8');

// Cliente simulado: embeddings por bolsa de palabras y juez que acepta el candidato 1.
const vocab = ['copia', 'denuncia', 'siniestro', 'receta', 'stock', 'tiras'];
const fakeClient = (judge = '{"match": 1}') => ({
  embeddings: { create: async ({ input }) => ({ data: input.map((t) => ({ embedding: vocab.map((w) => (t.includes(w) ? 1 : 0)) })) }) },
  responses: { create: async () => ({ output_text: judge }) },
});

test('coseno y ranking', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  const ranked = rankBySimilarity([1, 1], [{ id: 'a' }, { id: 'b' }], [[1, 1], [1, -1]]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].item.id, 'a');
});

test('el juez solo acepta un número válido', () => {
  assert.equal(parseJudge('{"match": 2}', 3), 2);
  assert.equal(parseJudge('{"match": null}', 3), null);
  assert.equal(parseJudge('{"match": 9}', 3), null);
  assert.equal(parseJudge('basura', 3), null);
});

test('la misma consulta con otra redacción encuentra la corrección', async () => {
  const list = [{ question: 'provincia art necesita copia denuncia', suggested: 'No necesita copia de denuncia; se requiere la denuncia de siniestro.' }];
  const hit = await matchCorrectionSemantically({ client: fakeClient(), question: 'me piden la copia de la denuncia en provincia art?', corrections: list });
  assert.match(hit.suggested, /denuncia de siniestro/);
});

test('si el juez duda o falla, no hay coincidencia', async () => {
  const list = [{ question: 'provincia art necesita copia denuncia', suggested: 'X' }];
  assert.equal(await matchCorrectionSemantically({ client: fakeClient('{"match": null}'), question: 'me piden la copia de la denuncia en provincia art?', corrections: list }), null);
  const broken = { embeddings: { create: async () => { throw new Error('boom'); } } };
  assert.equal(await matchCorrectionSemantically({ client: broken, question: 'me piden la copia de la denuncia en provincia art?', corrections: list }), null);
  assert.equal(await matchCorrectionSemantically({ client: fakeClient(), question: 'receta stock', corrections: [] }), null);
});

test('preguntas sin nada en común no llegan al juez', async () => {
  let judged = false;
  const client = fakeClient(); const original = client.responses.create;
  client.responses.create = async (a) => { judged = true; return original(a); };
  const list = [{ question: 'provincia art necesita copia denuncia', suggested: 'X' }];
  assert.equal(await matchCorrectionSemantically({ client, question: 'receta con tiras en stock coope', corrections: list }), null);
  assert.equal(judged, false);
});

test('el prompt del juez exige certeza y contempla condiciones distintas', () => {
  const prompt = buildJudgePrompt('pregunta', [{ item: { question: 'q', suggested: 'a' }, score: 0.9 }]);
  assert.match(prompt, /la menor duda/);
  assert.match(prompt, /negación/);
});

test('alcance de la corrección: se lee, se guarda y se elige en Validación', () => {
  const rows = [{ verdict: 'INCORRECT', suggested_answer: 'x', applies_to: 'colegio', updated_at: '2026-10-22', assistant_query_log: { question: 'q', normalized_question: 'q', branch_id: 1 } },
    { verdict: 'PARTIAL', suggested_answer: 'y', updated_at: '2026-10-21', assistant_query_log: { question: 'q2', normalized_question: 'q2', branch_id: 1 } }];
  const [a, b] = pickCorrections(rows);
  assert.equal(a.appliesTo, 'COLEGIO');
  assert.equal(b.appliesTo, null);
  assert.match(corrections, /item\.appliesTo === 'BOTH'\) return true/);
  assert.match(api, /applies_to:appliesTo/);
  assert.match(api, /\/applies_to\/i\.test/);
  assert.match(ui, /¿Dónde aplica esta corrección\?/);
  assert.match(ui, /Cámara y Colegio/);
});

test('route.js usa el match semántico solo fuera de repreguntas', () => {
  assert.match(route, /matchCorrectionSemantically\(\{ client: openai, question, corrections: adminCorrections/);
  assert.match(route, /!resolveFollowUp\(\{ question, state: conversationState, socialWorkId \}\)\.isFollowUp\) \{\s*exactCorrection = await/);
});

test('la caché no sirve ni guarda respuestas «no se menciona»', () => {
  assert.match(route, /cachedAnswerRow && !answerSaysNoInfo\(cachedAnswerRow\.answer\)/);
  assert.match(route, /!answerSaysNoInfo\(finalAnswer\) && !isNotFoundAnswer\(finalAnswer\)/);
});
