import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const listing = fs.readFileSync('app/sucursal/obras-sociales/page.jsx','utf8');
const detail = fs.readFileSync('app/sucursal/obras-sociales/[id]/page.jsx','utf8');
const api = fs.readFileSync('app/api/social-works/route.js','utf8');

test('el API permite todas las OOSS por defecto y solo filtra cuando se pide explicitamente', () => {
  assert.match(api,/searchParams\.get\("active"\)/);
  assert.match(api,/active === "true"/);
  assert.match(api,/active === "false"/);
});

test('la sucursal no descarta las inactivas al cargar', () => {
  assert.match(listing,/setSocialWorks\(result\.social_works \|\| \[\]\)/);
  assert.doesNotMatch(listing,/setSocialWorks\(\s*\(\s*result\.social_works[\s\S]*?\.filter/);
});

test('filtro Todas / Activas / Inactivas combinado con búsqueda y paginación', () => {
  assert.match(listing,/useState\("ALL"\)/);
  assert.match(listing,/option value="ALL"/);
  assert.match(listing,/option value="ACTIVE"/);
  assert.match(listing,/option value="INACTIVE"/);
  assert.match(listing,/statusFilter === "ACTIVE" && item\.active !== true/);
  assert.match(listing,/statusFilter === "INACTIVE" && item\.active !== false/);
  assert.match(listing,/\[socialWorks, search, statusFilter\]/);
  assert.match(listing,/\[search, statusFilter\]/);
});

test('la tarjeta y el detalle muestran ambos estados', () => {
  assert.match(listing,/item\.active === true \? "Activa" : "Inactiva"/);
  assert.match(detail,/socialWork\.active === true \? "Activa" : "Inactiva"/);
  assert.match(detail,/no autoriza recepción ni dispensación/);
});
