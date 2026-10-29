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
