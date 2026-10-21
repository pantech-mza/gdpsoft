import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildFaqPage,
  filterFaqs,
  pageNumbers,
  sortFaqsByPopularity,
  faqPopularity,
} from "../../lib/client/faq-view.mjs";

const mk = (id, extra = {}) => ({ id, question: `Pregunta ${id}`, answer: "r", social_work_id: id % 2 ? 1 : 2, ...extra });
const faqs = Array.from({ length: 30 }, (_, i) => mk(i + 1, { detected_count: i === 4 ? 9 : i === 7 ? 5 : i === 2 ? 2 : 0 }));

test("ordena por más consultadas", () => {
  const s = sortFaqsByPopularity(faqs);
  assert.deepEqual(s.slice(0, 3).map((f) => f.id), [5, 8, 3]);
  assert.equal(faqPopularity({ usage_count: 4, detected_count: 1 }), 4);
});

test("pagina: top solo en página 1 y sin duplicar", () => {
  const s = sortFaqsByPopularity(faqs);
  const p1 = buildFaqPage(s, { page: 1, pageSize: 8 });
  assert.equal(p1.top.length, 3);
  assert.equal(p1.pageItems.length, 8);
  assert.equal(p1.totalPages, Math.ceil(27 / 8));
  const ids = new Set([...p1.top, ...p1.pageItems].map((f) => f.id));
  assert.equal(ids.size, 11);
  const p2 = buildFaqPage(s, { page: 2, pageSize: 8 });
  assert.equal(p2.top.length, 0);
  assert.equal(p2.from, 9);
  assert.ok(!p2.pageItems.some((f) => ids.has(f.id)));
});

test("página fuera de rango se corrige y showTop=false", () => {
  const s = sortFaqsByPopularity(faqs);
  const p = buildFaqPage(s, { page: 99, pageSize: 8, showTop: false });
  assert.equal(p.page, p.totalPages);
  assert.equal(p.top.length, 0);
  assert.equal(buildFaqPage([], {}).totalPages, 1);
});

test("filtra por OOSS y búsqueda", () => {
  assert.equal(filterFaqs(faqs, { socialWorkId: "1" }).length, 15);
  assert.equal(filterFaqs(faqs, { search: "pregunta 12" }).length, 1);
});

test("números de página con elipsis", () => {
  assert.deepEqual(pageNumbers(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(pageNumbers(5, 12), [1, "…", 4, 5, 6, "…", 12]);
});

test("la página usa los helpers y el asistente escucha el evento", () => {
  const page = fs.readFileSync("app/sucursal/faqs/page.jsx", "utf8");
  assert.match(page, /Más consultadas/);
  assert.match(page, /Me sirvió/);
  assert.match(page, /Preguntarle al asistente/);
  assert.match(page, /gdpsoft:ask-assistant/);
  const fa = fs.readFileSync("components/FloatingAssistant.jsx", "utf8");
  assert.match(fa, /gdpsoft:ask-assistant/);
});
