import test from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('la tarjeta emergente muestra solo la noticia más reciente y se ancla al cierre', async () => {
  const src = readFileSync(new URL('../../components/sucursal/BranchNotices.jsx', import.meta.url), 'utf8');
  assert.match(src, /pickPopupNotice/); assert.match(src, /\[popup\]\.map/); assert.match(src, /en la campanita/);
});
test('chips Activa/Inactiva en verde y rojo fuertes', () => {
  for (const f of ['app/sucursal/obras-sociales/page.jsx', 'app/sucursal/obras-sociales/[id]/page.jsx', 'app/admin/obras-sociales/page.jsx', 'app/admin/obras-sociales/[id]/page.jsx']) {
    const s = readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');
    assert.match(s, /bg-red-600/, f); assert.match(s, /bg-emerald-600/, f);
  }
});

test('el chat flotante ocupa casi todo el alto, es más ancho y con letra más grande', () => {
  const s = readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url), 'utf8');
  assert.match(s, /sm:top-3 sm:bottom-3/); assert.match(s, /sm:w-\[560px\]/); assert.match(s, /text-\[17px\] leading-7/);
});
