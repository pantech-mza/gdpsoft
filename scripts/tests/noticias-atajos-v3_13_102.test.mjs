import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../../app/admin/noticias/page.jsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../../app/api/admin/noticias/route.js', import.meta.url), 'utf8');

test('el listado de sucursales trae el tipo (Colegio/Cámara)', () => {
  assert.match(api, /select\('id,name,code,active,branch_type'\)/);
});
test('la pantalla ofrece atajos para Colegio, Cámara, Todas y Limpiar', () => {
  assert.match(page, /Sucursales de Colegio/); assert.match(page, /Sucursales de Cámara/);
  assert.match(page, /setChosen\(ids\)/); assert.match(page, /setChosen\(\[\]\)/); assert.match(page, /seleccionadas/);
});
