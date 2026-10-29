import test from 'node:test';
import assert from 'node:assert/strict';
import { isAffiliateListQuestionWithoutDni, buildAffiliateListPrompt } from '../../lib/assistant/affiliate-list-prompt.mjs';
test('lista de afiliado sin DNI pide el DNI', () => {
  for (const q of ['lista de afiliado', 'listado de afiliados', 'padrón de socios', 'tienen lista de afiliados?'])
    assert.equal(isAffiliateListQuestionWithoutDni(q), true, q);
  assert.match(buildAffiliateListPrompt('OSPEGAP'), /DNI/);
});
test('con DNI o sin relación no actúa', () => {
  for (const q of ['me indicarías si el afiliado con el dni 53667440 se encuentra en el listado de ospegap', 'afiliado 53.667.440 está en la lista', 'cómo se valida', 'qué vigencia tiene la receta'])
    assert.equal(isAffiliateListQuestionWithoutDni(q), false, q);
});
import { dniReplyToQuestion } from '../../lib/assistant/affiliate-list-prompt.mjs';
test('DNI solo tras nuestra pregunta se convierte en consulta completa (con o sin puntos)', () => {
  const last = buildAffiliateListPrompt('OSPEGAP');
  assert.match(dniReplyToQuestion('53667440', last, 'OSPEGAP'), /dni 53667440 se encuentra en el listado de OSPEGAP/);
  assert.match(dniReplyToQuestion('53.667.440', last, 'OSPEGAP'), /dni 53667440/);
  assert.match(dniReplyToQuestion('DNI 53667440', last, 'OSPEGAP'), /dni 53667440/);
  assert.equal(dniReplyToQuestion('53667440', 'otra respuesta', 'OSPEGAP'), null);
  assert.equal(dniReplyToQuestion('hola', last, 'OSPEGAP'), null);
});
test('DNI siguiente tras una respuesta de búsqueda también se completa', () => {
  assert.match(dniReplyToQuestion('70649709', 'Sí, el DNI 53667440 figura en el listado de OSPEGAP (x): SEVILLA', 'OSPEGAP'), /dni 70649709 se encuentra en el listado de OSPEGAP/);
  assert.match(dniReplyToQuestion('70649709', 'No encontré el DNI 11111111 en el listado de OSPEGAP cargado', 'OSPEGAP'), /dni 70649709/);
  assert.equal(dniReplyToQuestion('70649709', 'La receta vence a los 30 días', 'OSPEGAP'), null);
});
