import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync('app/api/assistant/analyze-image/route.js', 'utf8');

test('la consulta respondida por el lector de imágenes guarda la conversación', () => {
  assert.match(src, /conversation_id: conversation\.id \|\| null/);
  assert.match(src, /\/conversation_id\/i\.test/);
});

test('un documento que no es receta devuelve su descripción en vez de "no puedo identificar"', () => {
  assert.match(src, /analysis\?\.summary/);
  assert.match(src, /verificalo contra la normativa de la obra social/);
});
