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
test('estimación mensual: usa solo el gasto atribuible a consultas de sucursales, no el total de OpenAI', () => {
  // OpenAI: 3 días con gasto. El día 20 fue puro desarrollo/auditoría (sin consultas de sucursales).
  const daily = [
    { date: '2026-10-20', cost_usd: 9, total_tokens: 9000 },
    { date: '2026-10-21', cost_usd: 1, total_tokens: 1000 },
    { date: '2026-10-22', cost_usd: 3, total_tokens: 3000 },
  ];
  const appDaily = [
    { date: '2026-10-21', real_tokens: 800, internal_tokens: 200 }, // 80% sucursales, 20% pruebas
    { date: '2026-10-22', real_tokens: 1500, internal_tokens: 0 }, // 50% sucursales
  ];
  const rows = [
    { key: '1', branch_id: 1, name: 'DP1', requests: 30, share: 0.5, internal: false },
    { key: '2', branch_id: 2, name: 'Economas', requests: 10, share: 0.3, internal: false },
    { key: 'internal', branch_id: null, name: 'Pruebas internas', requests: 8, share: 0.2, internal: true },
  ];
  const p = projectMonthly({ daily, appDaily, rows, totalCostUsd: 13, branchesTotal: 20 });
  assert.equal(p.ok, true); assert.equal(p.activeDays, 2);
  assert.ok(Math.abs(p.total_period_usd - 13) < 1e-9);
  assert.ok(Math.abs(p.real_period_usd - 2.3) < 1e-9);       // 1×0,8 + 3×0,5
  assert.ok(Math.abs(p.internal_period_usd - 0.2) < 1e-9);   // 1×0,2
  assert.ok(Math.abs(p.other_period_usd - 10.5) < 1e-9);     // 13 − 2,3 − 0,2: el día de desarrollo y el resto
  assert.ok(Math.abs(p.dailyAvg - 1.15) < 1e-9);             // 2,3 ÷ 2 días con consultas
  assert.ok(Math.abs(p.monthly_real_usd - 34.5) < 1e-9);     // × 30
  assert.deepEqual(p.branches.map((b) => b.name), ['DP1', 'Economas']);
  assert.ok(Math.abs(p.branches.reduce((n, b) => n + b.monthly_usd, 0) - 34.5) < 1e-9);
  assert.ok(Math.abs(p.per_branch_usd - 17.25) < 1e-9); assert.ok(Math.abs(p.network_usd - 345) < 1e-9);
  assert.ok(Math.abs(projectMonthly({ daily, appDaily, rows, totalCostUsd: 13, daysInMonth: 22 }).monthly_real_usd - 25.3) < 1e-9);
  assert.equal(projectMonthly({ daily, appDaily: [], rows, totalCostUsd: 13 }).ok, false);
  assert.equal(projectMonthly({ daily, appDaily, rows, totalCostUsd: 13, branchesTotal: 0 }).network_usd, null);
});
test('el reparto diario de tokens de la app separa pruebas internas y se calcula antes del filtro por día', () => {
  const u = buildBranchUsage({
    logs: [L(1, { created_at: '2026-10-25T10:00:00Z' }), L(2, { device_name: 'Nico', created_at: '2026-10-26T10:00:00Z' })],
    shadow: [{ branch_id: 1, conversation_id: null, created_at: '2026-10-26T12:00:00Z', tokens_in: 400, tokens_out: 100 }],
    day: '2026-10-26',
  });
  assert.deepEqual(u.daily_tokens.map((d) => d.date), ['2026-10-25', '2026-10-26']);
  assert.equal(u.daily_tokens[0].real_tokens, 1100);
  assert.equal(u.daily_tokens[1].internal_tokens, 1100); assert.equal(u.daily_tokens[1].real_tokens, 500);
});
test('Gastos OpenAI: pestañas por sucursal/dispositivo, estimación mensual con PDF y ruta con total de sucursales', () => {
  const src = (fs.readFileSync(new URL('../../app/admin/openai/page.jsx', import.meta.url), 'utf8')+fs.readFileSync(new URL('../../components/admin/OpenAiPilotSpend.jsx', import.meta.url), 'utf8'));
  for (const re of [/Gasto por dispositivo/, /usage_devices/, /Estimado próximo mes/, /window\.print\(\)/, /openai-usage\/branches/]) assert.match(src, re);
  assert.match(fs.readFileSync(new URL('../../app/api/admin/openai-usage/branches/route.js', import.meta.url), 'utf8'), /branches_total/);
});
