import test from 'node:test';
import assert from 'node:assert/strict';
import { splitLinks } from '../../lib/assistant/linkify.mjs';

test('detecta el enlace del vademécum y conserva el texto alrededor', () => {
  const p = splitLinks('Vademécum actualizado (consultar cobertura de medicamentos): https://www.farmalive.com.ar/index.asp');
  assert.deepEqual(p.map((x) => x.type), ['text', 'link']);
  assert.equal(p[1].href, 'https://www.farmalive.com.ar/index.asp');
});
test('no incluye la puntuación final en el enlace', () => {
  const p = splitLinks('Mirá https://www.farmalive.com.ar/index.asp. Gracias (https://a.com/x).');
  const links = p.filter((x) => x.type === 'link').map((x) => x.href);
  assert.deepEqual(links, ['https://www.farmalive.com.ar/index.asp', 'https://a.com/x']);
});
test('solo http/https: no convierte javascript: ni otros esquemas ni texto sin enlaces', () => {
  assert.deepEqual(splitLinks('javascript:alert(1) y ftp://x.com').filter((x) => x.type === 'link'), []);
  assert.deepEqual(splitLinks('sin enlaces'), [{ type: 'text', value: 'sin enlaces' }]);
  assert.deepEqual(splitLinks(null), [{ type: 'text', value: '' }]);
});

test('el enlace del vademécum se muestra con un texto corto y las direcciones largas, solo con el sitio', async () => {
  const { linkLabel } = await import('../../lib/assistant/linkify.mjs');
  assert.equal(linkLabel('https://www.farmalive.com.ar/index.asp'), 'Abrir vademécum de Farmalive');
  assert.equal(linkLabel('http://didiosistemas.com.ar:18084/andessalud/ruta/larga/de/ejemplo'), 'didiosistemas.com.ar');
  assert.equal(linkLabel('https://a.com/x'), 'https://a.com/x');
  const l = splitLinks('Cobertura: https://www.farmalive.com.ar/index.asp').find((x) => x.type === 'link');
  assert.equal(l.href, 'https://www.farmalive.com.ar/index.asp'); assert.equal(l.label, 'Abrir vademécum de Farmalive');
});
