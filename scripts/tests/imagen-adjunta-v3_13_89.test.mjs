import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { shouldUseActiveImage } from '../../lib/assistant/imageRouting.js';

const activeImage = { id: 'img-1' };
const uses = (question) => shouldUseActiveImage({ activeImage, question });

test('"¿está bien esa orden?" con imagen adjunta se responde mirando la imagen', () => {
  assert.equal(uses('esta bien esa orden?'), true);
  assert.equal(uses('¿Sirve este formulario?'), true);
  assert.equal(uses('revisá ese documento por favor'), true);
});

test('las consultas normativas siguen yendo al chat de texto aunque haya imagen', () => {
  assert.equal(uses('en osdop como es la autorizacion que debo presentar?'), false);
  assert.equal(uses('por donde valido avalian'), false);
  assert.equal(uses('vigencia receta osde'), false);
  assert.equal(shouldUseActiveImage({ activeImage: null, question: 'esta bien esa orden?' }), false);
});

test('Validación guarda la conversación y muestra la imagen adjunta', () => {
  const route = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(route, /conversation_id: conversationId/);
  assert.match(route, /conversation_id/);
  const val = fs.readFileSync('app/api/admin/validacion/route.js', 'utf8');
  assert.match(val, /conversation_images/);
  assert.match(val, /images:imagesByQuery/);
  const img = fs.readFileSync('app/api/admin/validacion/imagen/route.js', 'utf8');
  assert.match(img, /requireAdminActor/);
  assert.match(img, /createSignedUrl\(data\.storage_path, 600\)/);
  const ui = fs.readFileSync('components/admin/AdminBranchValidation.jsx', 'utf8');
  assert.match(ui, /Ver imagen adjunta/);
});
