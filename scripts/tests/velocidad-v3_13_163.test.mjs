import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prefetchCorrectionEmbeddings, matchCorrectionSemantically } from '../../lib/assistant/correction-semantic.mjs';

test('el embedding adelantado se comparte con el definitivo (una sola llamada)', async () => {
  let calls = 0;
  const client = {
    embeddings: { create: async ({ input }) => { calls += 1; await new Promise((r) => setTimeout(r, 30)); return { data: input.map((_, i) => ({ embedding: [1, i + 1] })) }; } },
    responses: { create: async () => ({ output_text: '{"match": null}' }) },
  };
  const corrections = [{ question: 'cobertura de pañales en osep', suggested: 'x' }];
  const q = 'tienen cobertura de pañales osep?';
  const pre = prefetchCorrectionEmbeddings({ client, question: q, corrections });
  const res = await matchCorrectionSemantically({ client, question: q, corrections });
  await pre;
  assert.equal(calls, 1);
  assert.equal(res, null);
});

test('la ruta no espera las escrituras del registro ni del estado para responder', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  assert.match(src, /deferWrite\(logCurrentQuery\(\{ branchId, socialWorkId, question, answer: eng\.answer, source: "CONTEXT_ENGINE"/);
  assert.match(src, /deferWrite\(saveConversationState\(/);
  assert.match(src, /Promise\.allSettled\(\[\.\.\.pendingWrites\]\)/);
});
