import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, existsSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
test('el inicio abre el chat lateral con el evento existente y muestra el último aviso del admin', () => {
  const s = read('app/sucursal/page.jsx');
  assert.match(s, /gdpsoft:ask-assistant/); assert.match(s, /detail: \{ question \}/);
  assert.match(s, /fetchNoticeHistory\(1\)/); assert.match(s, /Tus aportes nos ayudan a mejorar/);
  assert.match(s, /Accedé a la información operativa que necesitás para tu atención diaria/);
});
test('las imágenes del rediseño existen', () => {
  for (const f of ['montanas-hero.webp', 'gdpsoft-logo.png', 'montanas-pie.png']) assert.ok(existsSync(new URL(`../../public/images/${f}`, import.meta.url)), f);
});
test('la barra lateral conserva los íconos y suma etiquetas cortas; el layout carga las tipografías', () => {
  const side = read('components/sucursal/SucursalSidebar.jsx'); const lay = read('app/sucursal/layout.jsx');
  assert.match(side, /fluent-emoji:hospital/); assert.match(side, /short: "Obras sociales"/);
  assert.match(lay, /Nunito/); assert.match(lay, /Caveat/); assert.match(lay, /md:ml-\[130px\]/);
});
test('la barra superior muestra «Tu sucursal»', () => { assert.match(read('components/sucursal/SucursalTopbar.jsx'), /Tu sucursal:/); });
