import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paginate } from "../../lib/decision-trees/pagination.mjs";

const makeItems = (count) => Array.from({ length: count }, (_, i) => ({ id: i + 1 }));

test("299 sugerencias: 10 por página sin repetir ni perder elementos", () => {
  const items = makeItems(299);
  const pages = Array.from({ length: 30 }, (_, n) => paginate(items, n + 1, 10));
  assert.deepEqual(pages.flatMap((p) => p.items.map((item) => item.id)), items.map((item) => item.id));
  assert.equal(pages.at(-1).items.length, 9);
  assert.equal(pages.at(-1).totalPages, 30);
  assert.equal(pages.at(-1).from, 291);
  assert.equal(pages.at(-1).to, 299);
});

test("filtrado reduce las páginas y la cuenta visible", () => {
  const selection = makeItems(299).filter((item) => item.id % 20 === 0);
  const result = paginate(selection, 1, 10);
  assert.equal(result.total, 14);
  assert.equal(result.totalPages, 2);
  assert.equal(result.items.length, 10);
});

test("página anterior fuera de rango se ajusta a la última", () => {
  const result = paginate(makeItems(3), 30, 10);
  assert.equal(result.page, 1);
  assert.equal(result.to, 3);
});

test("sin sugerencias muestra 0 resultados y conserva página 1", () => {
  const result = paginate([], 3, 10);
  assert.deepEqual(result.items, []);
  assert.equal(result.page, 1);
  assert.equal(result.from, 0);
  assert.equal(result.to, 0);
});

test("no acepta páginas con tamaño cero", () => {
  assert.throws(() => paginate([], 1, 0), RangeError);
});

test("el componente oculta BulkTreeGenerator a Admin", () => {
  const page = readFileSync(new URL("../../app/admin/arboles/page.jsx", import.meta.url), "utf8");
  assert.match(page, /\{isSuperAdmin\s*&&\s*<BulkTreeGenerator\b/);
  assert.match(page, /visibleCandidates\.map\(/);
  assert.match(page, /Paginación de árboles sugeridos por IA/);
});

test("la API del inventario masivo requiere is_super_admin desde perfil verificado", () => {
  const route = readFileSync(new URL("../../app/api/decision-tree-candidates/bulk-plan/route.js", import.meta.url), "utf8");
  assert.match(route, /await requireActor\(request, true\)/);
  assert.match(route, /auth\.actor\.is_super_admin !== true/);
  assert.match(route, /reservada a Superadmin.*403/);
});
