import test from 'node:test';
import assert from 'node:assert/strict';
import { priceCells, startDate, applyFilters, summarize, byBranch } from '../../lib/openai/spend-filter.mjs';
import { buildUsageCells } from '../../lib/server/openai-branch-usage.mjs';

const daily = [{ date: '2026-10-20', cost_usd: 1, total_tokens: 1000, requests: 5 }, { date: '2026-10-21', cost_usd: 2, total_tokens: 1000, requests: 5 }];
const cells = [
  { date: '2026-10-20', branch_id: 1, device_id: 10, queries: 5, tokens: 400 },
  { date: '2026-10-21', branch_id: 1, device_id: 10, queries: 5, tokens: 300 },
  { date: '2026-10-21', branch_id: 2, device_id: 20, queries: 2, tokens: 200 },
];
test('reparte el costo del día según tokens', () => {
  const p = priceCells({ cells, daily });
  assert.equal(p[0].cost_usd, 0.4);
  assert.equal(p[1].cost_usd, 0.6);
  assert.equal(p[2].cost_usd, 0.4);
});
test('filtra por sucursal, dispositivo y día; vacío = todo', () => {
  const p = priceCells({ cells, daily });
  assert.equal(applyFilters(p, {}).length, 3);
  assert.equal(applyFilters(p, { branches: ['1'] }).length, 2);
  assert.equal(applyFilters(p, { devices: ['2:20'] }).length, 1);
  assert.equal(applyFilters(p, { from: '2026-10-21' }).length, 2);
  assert.equal(applyFilters(p, { from: '2026-10-20', to: '2026-10-20' }).length, 1);
});
test('resumen: participación, costo por consulta y próximo mes', () => {
  const p = applyFilters(priceCells({ cells, daily }), { branches: ['1'] });
  const s = summarize(p, { totalCost: 3, daysInMonth: 30 });
  assert.equal(s.queries, 10);
  assert.ok(Math.abs(s.cost - 1) < 1e-9);
  assert.ok(Math.abs(s.share - 1 / 3) < 1e-9);
  assert.ok(Math.abs(s.costPerQuery - 0.1) < 1e-9);
  assert.ok(Math.abs(s.nextMonth - 0.1 * 5 * 30) < 1e-9);
  assert.ok(Math.abs(summarize(p, { totalCost: 3, expectedQueries: 500 }).nextMonth - 50) < 1e-9);
});
test('start y totales por sucursal', () => {
  assert.equal(startDate({ daily, cells }), '2026-10-20');
  const b = byBranch(priceCells({ cells, daily }), new Map([['1', 'DP1']]));
  assert.equal(b[0].name, 'DP1');
});
test('buildUsageCells junta consultas y tokens del motor', () => {
  const r = buildUsageCells({
    logs: [{ created_at: '2026-10-20T10:00:00Z', branch_id: 1, device_id: 10, device_name: 'Caja 1', conversation_id: 'c1', input_tokens: 100, output_tokens: 50 }],
    shadow: [{ created_at: '2026-10-20T10:00:01Z', conversation_id: 'c1', branch_id: 1, tokens_in: 200, tokens_out: 20 }],
    branchNames: new Map([['1', 'DP1']]),
  });
  assert.equal(r.cells.length, 1);
  assert.equal(r.cells[0].queries, 1);
  assert.equal(r.cells[0].tokens, 370);
  assert.equal(r.branches[0].name, 'DP1');
});
