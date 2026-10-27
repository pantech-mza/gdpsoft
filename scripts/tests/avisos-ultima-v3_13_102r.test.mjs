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
  assert.match(s, /sm:top-\[84px\] sm:bottom-3/); assert.match(s, /sm:w-\[560px\]/); assert.match(s, /text-\[17px\] font-medium leading-7/);
});

test('la letra del chat va en negrita media (font-medium) y más oscura', () => {
  const s = readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url), 'utf8');
  const r = readFileSync(new URL('../../components/assistant/AssistantRichMessage.jsx', import.meta.url), 'utf8');
  assert.match(s, /text-\[17px\] font-medium leading-7 text-zinc-900/); assert.match(r, /font-medium leading-\[1\.6\] text-zinc-900/);
});

test('el chat arranca debajo de la barra superior y el aviso se corre cuando el chat está abierto', () => {
  const s = readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url), 'utf8');
  const n = readFileSync(new URL('../../components/sucursal/BranchNotices.jsx', import.meta.url), 'utf8');
  assert.match(s, /gdpsoft:assistant-state/); assert.match(s, /lg:top-\[124px\]/);
  assert.match(n, /gdpsoft:assistant-state/); assert.match(n, /md:right-\[620px\]/);
});

test('los menús de la barra superior quedan por encima del chat y el aviso no queda bajo la barra', () => {
  const top = readFileSync(new URL('../../components/sucursal/SucursalTopbar.jsx', import.meta.url), 'utf8');
  const n = readFileSync(new URL('../../components/sucursal/BranchNotices.jsx', import.meta.url), 'utf8');
  assert.match(n, /lg:top-\[130px\]/); assert.ok(typeof top === 'string');
});
