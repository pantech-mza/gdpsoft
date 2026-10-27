import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBranchUsage, allocateCost } from '../../lib/server/openai-branch-usage.mjs';
import { projectMonthly } from '../../lib/openai/monthly-projection.mjs';

const L = (id, over = {}) => ({ id, branch_id: 1, device_id: 7, device_name: 'Caja 1', conversation_id: null, traffic_type: 'PILOT', created_at: '2026-10-26T15:00:00Z', input_tokens: 1000, output_tokens: 100, ...over });

test('gasto por sucursal: reparte por tokens y separa las pruebas internas', () => {
  const u = buildBranchUsage({
    logs: [L(1), L(2, { branch_id: 2 }), L(3, { branch_id: 2 }), L(4, { device_name: 'Nico', input_tokens: 5000, output_tokens: 500 }), L(5, { input_tokens: 0, output_tokens: 0 })],
    shadow: [{ branch_id: 1, conversation_id: null, created_at: '2026-10-26T16:00:00Z', tokens_in: 3000, tokens_out: 200 }],
    branchNames: new Map([['1', 'Libertad'], ['2', 'Economas']]),
  });
  const by = Object.fromEntries(u.rows.map((r) => [r.key, r]));
  assert.equal(by['1'].requests, 2); assert.equal(by['1'].input_tokens, 4000); assert.equal(by['2'].requests, 2);
  assert.equal(by.internal.internal, true); assert.equal(u.rows.at(-1).key, 'internal');
  assert.ok(Math.abs(u.rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  assert.ok(Math.abs(allocateCost(u.rows, 10).reduce((n, r) => n + r.cost_usd, 0) - 10) < 1e-3);
});
test('gasto por dispositivo: DP1 real separado de Nico y Micaela; el motor hereda el dispositivo por la conversación', () => {
  const conv = '22222222-2222-2222-2222-222222222222';
  const u = buildBranchUsage({
    logs: [L(1, { device_id: 7, device_name: 'Directorio' }), L(2, { device_id: 7, device_name: 'Directorio' }), L(3, { device_id: 8, device_name: 'Nico', conversation_id: conv }), L(4, { device_id: 9, device_name: 'Micaela' })],
    shadow: [{ branch_id: 1, conversation_id: conv, created_at: '2026-10-26T16:00:00Z', tokens_in: 2000, tokens_out: 100 }],
    branchNames: new Map([['1', 'DP1']]),
  });
  const dev = Object.fromEntries(u.device_rows.map((r) => [r.name, r]));
  assert.equal(dev['DP1 · Directorio'].internal, false); assert.equal(dev['DP1 · Directorio'].requests, 2);
  assert.equal(dev['DP1 · Nico'].internal, true); assert.equal(dev['DP1 · Nico'].requests, 2);
  assert.equal(dev['DP1 · Micaela'].internal, true); assert.equal(u.device_rows.at(-1).internal, true);
  assert.equal(u.rows.find((r) => r.key === '1').requests, 2);
});
test('estimación mensual: promedio de días con gasto × 30, reparto por sucursal y red completa', () => {
  const daily = [{ date: '2026-10-20', cost_usd: 1 }, { date: '2026-10-21', cost_usd: 0 }, { date: '2026-10-22', cost_usd: 3 }];
  const rows = [
    { key: '1', branch_id: 1, name: 'DP1', requests: 30, share: 0.5, internal: false },
    { key: '2', branch_id: 2, name: 'Economas', requests: 10, share: 0.3, internal: false },
    { key: 'internal', branch_id: null, name: 'Pruebas internas', requests: 8, share: 0.2, internal: true },
  ];
  const p = projectMonthly({ daily, rows, totalCostUsd: 4, branchesTotal: 20 });
  assert.equal(p.activeDays, 2); assert.equal(p.dailyAvg, 2); assert.equal(p.monthly_org_usd, 60);
  assert.ok(Math.abs(p.monthly_real_usd - 48) < 1e-9); assert.ok(Math.abs(p.monthly_internal_usd - 12) < 1e-9);
  assert.deepEqual(p.branches.map((b) => b.name), ['DP1', 'Economas']);
  assert.ok(Math.abs(p.per_branch_usd - 24) < 1e-9); assert.ok(Math.abs(p.network_usd - 480) < 1e-9);
  assert.equal(projectMonthly({ daily: [], rows, totalCostUsd: 0 }).ok, false);
  assert.equal(projectMonthly({ daily, rows, totalCostUsd: 4, branchesTotal: 0 }).network_usd, null);
});
test('Gastos OpenAI: pestañas por sucursal/dispositivo, estimación mensual con PDF y ruta con total de sucursales', () => {
  const src = fs.readFileSync(new URL('../../app/admin/openai/page.jsx', import.meta.url), 'utf8');
  for (const re of [/Por dispositivo/, /device_rows/, /Estimación mensual del gasto/, /window\.print\(\)/, /projectMonthly/, /openai-usage\/branches/]) assert.match(src, re);
  assert.match(fs.readFileSync(new URL('../../app/api/admin/openai-usage/branches/route.js', import.meta.url), 'utf8'), /branches_total/);
});
