import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isGenericFillerAnswer, asksForExample } from '../../lib/assistant/answer-guards.mjs';

test('relleno que solo manda a consultar no cuenta como respuesta', () => {
  assert.equal(isGenericFillerAnswer('La orden debe cumplir con los requisitos establecidos por la obra social. Se recomienda consultar con la obra social.'), true);
  assert.equal(isGenericFillerAnswer('Es importante que verifiques con la obra social la documentación necesaria.'), true);
});

test('una respuesta con datos concretos no se descarta', () => {
  assert.equal(isGenericFillerAnswer('La autorización se valida por SISAO. Ingresá el número de afiliado y adjuntá la orden firmada y sellada.'), false);
  assert.equal(isGenericFillerAnswer('La vigencia es de 30 días. Se recomienda consultar con la obra social si vence.'), false);
  assert.equal(isGenericFillerAnswer(''), false);
});

test('detecta pedidos de ejemplo o modelo', () => {
  assert.equal(asksForExample('tenes algun ejemplo?'), true);
  assert.equal(asksForExample('vigencia receta osde'), false);
});

test('la consulta usa la guarda de relleno', () => {
  const route = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(route, /isGenericFillerAnswer\(result\.answer\)/);
});
