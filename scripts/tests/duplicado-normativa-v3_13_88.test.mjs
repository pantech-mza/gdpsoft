import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatDuplicateMessage, buildDuplicateMessage } from '../../lib/normatives/duplicate-message.mjs';

test('el aviso de duplicado dice qué normativa es y a qué obra social pertenece', () => {
  const text = formatDuplicateMessage({ id: 190, title: 'OSDE EXTRANET INSTRUCTIVO (AUTOEMISION)' }, ['OSDE']);
  assert.match(text, /«OSDE EXTRANET INSTRUCTIVO \(AUTOEMISION\)» \(ID #190\), asociado a OSDE/);
  assert.match(text, /mismo contenido aunque el nombre sea distinto/);
  assert.doesNotMatch(formatDuplicateMessage({ id: 1, title: 'x' }), /asociado a/);
});

test('si falla la consulta de obras sociales el aviso igual sale', async () => {
  const broken = { from: () => { throw new Error('boom'); } };
  assert.match(await buildDuplicateMessage(broken, { id: 5, title: 'T' }), /«T» \(ID #5\)/);
});

test('las dos rutas de carga usan el aviso con detalle', () => {
  for (const p of ['app/api/social-works/[id]/normatives/upload/route.js', 'app/api/social-works/[id]/normatives/route.js']) {
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /await buildDuplicateMessage\(supabaseAdmin, existingNormative\)/);
  }
});
