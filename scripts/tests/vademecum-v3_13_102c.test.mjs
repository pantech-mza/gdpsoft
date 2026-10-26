import test from 'node:test';
import assert from 'node:assert/strict';
import { isOsepOyte, vademecumLine, withVademecum, VADEMECUM_URL } from '../../lib/assistant/vademecum-link.mjs';

test('solo reconoce OSEP-OYTE', () => {
  assert.equal(isOsepOyte('OSEP OYTE'), true); assert.equal(isOsepOyte('OSEP - OYTE'), true);
  assert.equal(isOsepOyte('OSEP'), false); assert.equal(isOsepOyte('OSDE'), false); assert.equal(isOsepOyte(null), false);
});
test('agrega el enlace solo si se habla de medicamentos', () => {
  const base = { ok: true, found: true, social_work: { name: 'OSEP OYTE' }, answer: 'Cubre el 40 %.', answer_plain: 'Cubre el 40 %.' };
  const a = withVademecum({ ...base, question: 'cubre este medicamento?' });
  assert.match(a.answer, new RegExp(VADEMECUM_URL.replace(/\./g, '\\.'))); assert.match(a.answer_plain, /farmalive/);
  assert.equal(withVademecum({ ...base, question: 'por donde valida?', answer: 'Por TYS.', answer_plain: 'Por TYS.' }), null);
});
test('no toca otras obras sociales, respuestas sin resultado ni respuestas que ya traen el enlace', () => {
  const q = { question: 'cubre este medicamento?' };
  assert.equal(withVademecum({ ok: true, found: true, social_work: { name: 'OSDE' }, answer: 'x medicamento', ...q }), null);
  assert.equal(withVademecum({ ok: true, found: false, social_work: { name: 'OSEP OYTE' }, answer: 'x medicamento', ...q }), null);
  assert.equal(withVademecum({ ok: true, found: true, social_work: { name: 'OSEP OYTE' }, answer: 'ver farmalive.com.ar medicamento', ...q }), null);
  assert.equal(vademecumLine({ socialWorkName: 'OSEP OYTE', question: 'hola', answer: 'buen día' }), null);
});
