import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const route = fs.readFileSync(
  path.resolve('app/api/assistant/analyze-image/route.js'),
  'utf8'
);
const anchor = route.indexOf('Necesito exclusivamente los requisitos');
assert.ok(anchor >= 0, 'Se encuentra el bloque de requisitos de recetas');
const start = route.indexOf('        tools: [', anchor);
const end = route.indexOf('        include: [', start);
assert.ok(start >= 0 && end > start, 'Se encuentra la configuración de búsqueda');
const toolsBlock = route.slice(start, end);

function getTool(normativeIds) {
  // Parsear realmente la estructura del objeto de búsqueda (no solo contar texto).
  const script = new vm.Script(`({ ${toolsBlock} include: [] }).tools[0]`);
  return script.runInNewContext({
    normativeIds,
    socialWorkId: 35,
    process: { env: { OPENAI_VECTOR_STORE_ID: 'test-vector-store' } },
  });
}

test('La configuración de file_search de recetas es JavaScript válido', () => {
  assert.equal(getTool([5]).type, 'file_search');
});

test('Las normativas generales y extras se buscan por sus IDs vinculados', () => {
  const filter = getTool([17, 29]).filters;
  const ids = filter.filters.find(x => x.type === 'or').filters.map(x => x.value);
  assert.deepEqual(Array.from(ids), [17, 29]);
  assert.ok(filter.filters.some(x => x.key === 'is_current' && x.value === true));
});

test('Sin vínculos retorna al filtro de la obra social', () => {
  const filter = getTool([]).filters;
  const keys = filter.filters.find(x => x.type === 'or').filters.map(x => x.key);
  assert.deepEqual(Array.from(keys), ['social_work_id', 'secondary_social_work_id']);
});
