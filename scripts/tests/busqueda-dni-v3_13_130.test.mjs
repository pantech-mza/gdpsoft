import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDni, isAffiliateDniQuestion, lookupDni, buildDniAnswer } from '../../lib/assistant/affiliate-lookup.mjs';
const rows = Array.from({ length: 30 }, (_, i) => `${20000000 + i};PEREZ ${i}`).join('\n') + '\n53667440;SEVILLA TICIANO DAMIAN\n';
test('extrae DNI y detecta la consulta', () => {
  assert.equal(extractDni('afiliado con el dni 53.667.440 está?'), '53667440');
  assert.equal(isAffiliateDniQuestion('me indicarías si el afiliado con el dni 53667440 se encuentra en el listado de ospegap'), true);
  assert.equal(isAffiliateDniQuestion('receta con dni 53667440 requiere autorización'), false);
  assert.equal(isAffiliateDniQuestion('cómo se valida'), false);
});
test('encuentra, no encuentra y sin listado', () => {
  const t = [{ title: 'Padrón OSPEGAP', text: rows }];
  const f = lookupDni('53667440', t); assert.equal(f.status, 'FOUND'); assert.match(f.line, /SEVILLA/);
  assert.match(buildDniAnswer(f, { dni: '53667440', workName: 'OSPEGAP' }), /^Sí, el DNI 53667440 figura/);
  const n = lookupDni('70649709', t); assert.equal(n.status, 'NOT_FOUND');
  assert.match(buildDniAnswer(n, { dni: '70649709', workName: 'OSPEGAP' }), /No encontré el DNI 70649709/);
  assert.equal(lookupDni('70649709', [{ title: 'x', text: 'texto sin listado' }]).status, 'NO_LIST');
  assert.equal(buildDniAnswer({ status: 'NO_LIST' }, { dni: '1', workName: 'X' }), null);
});
