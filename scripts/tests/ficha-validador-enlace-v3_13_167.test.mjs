import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { splitWithValidators } from '../../lib/assistant/validator-links.mjs';
const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('la ficha, las observaciones y el admin muestran los validadores como enlaces', () => {
  assert.match(read('app/sucursal/obras-sociales/[id]/page.jsx'), /<LinkifiedText text=\{value\} \/>/);
  assert.match(read('app/admin/obras-sociales/[id]/page.jsx'), /<LinkifiedText text=\{value\} \/>/);
  const notes = read('components/social-works/FichaNotesPanel.jsx');
  assert.match(notes, /<LinkifiedText text=\{note\.body\} \/>/);
  assert.match(notes, /<LinkifiedText text=\{visible\[note\.id\]\} \/>/);
});

test('ADMIFARM y DIDIO del campo Validador quedan como enlaces a su sitio', () => {
  const a = splitWithValidators('ADMIFARM').find((p) => p.type === 'link');
  assert.equal(a.href, 'https://gdr.admifarmgroup.com/Login.aspx?ReturnUrl=%2f');
  assert.equal(splitWithValidators('DIDIO').find((p) => p.type === 'link').href, 'http://www.didiosistemas.com.ar/');
  assert.equal(splitWithValidators('POR FUERA').some((p) => p.type === 'link'), false);
});
