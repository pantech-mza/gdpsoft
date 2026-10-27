import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseIdList, parseActivityFilters, callActivityRpc } from '../../lib/server/activity-filters.mjs';
import { buildBranchUsage, allocateCost } from '../../lib/server/openai-branch-usage.mjs';

test('parseIdList: lista, un id, vacío e inválidos', () => {
  assert.deepEqual(parseIdList('1,2,2, 3'), { ids: [1, 2, 3], ok: true });
  assert.deepEqual(parseIdList('7'), { ids: [7], ok: true });
  assert.deepEqual(parseIdList(''), { ids: null, ok: true });
  assert.deepEqual(parseIdList(null), { ids: null, ok: true });
  assert.equal(parseIdList('1,a').ok, false);
  assert.equal(parseIdList('0').ok, false);
  assert.equal(parseIdList('1;DROP').ok, false);
});
test('parseActivityFilters acepta los nombres nuevos y los viejos, y exclude_internal', () => {
  const f = parseActivityFilters(new URLSearchParams('branch_ids=1,2&device_id=5&exclude_internal=1'));
  assert.deepEqual([f.ok, f.branchIds, f.deviceIds, f.socialIds, f.excludeInternal], [true, [1, 2], [5], null, true]);
  assert.equal(parseActivityFilters(new URLSearchParams('branch_ids=x')).ok, false);
  assert.equal(parseActivityFilters(new URLSearchParams('')).excludeInternal, false);
});
test('callActivityRpc usa _v4 con arreglos; si la migración no está, cae a _v3 con el primer id', async () => {
  const calls = [];
  const ok = { rpc: async (name, args) => { calls.push([name, args]); return { data: { total: 1 }, error: null }; } };
  const f = { branchIds: [1, 2], socialIds: null, deviceIds: [9], excludeInternal: true };
  const r = await callActivityRpc(ok, 'dashboard', f, { p_days: 0 });
  assert.equal(calls[0][0], 'gdp_assistant_activity_dashboard_v4');
  assert.deepEqual(calls[0][1].p_branch_ids, [1, 2]); assert.equal(calls[0][1].p_exclude_internal, true); assert.equal(r.legacy, false);
  const calls2 = [];
  const old = { rpc: async (name, args) => { calls2.push([name, args]); return name.endsWith('_v4') ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } } : { data: {}, error: null }; } };
  const r2 = await callActivityRpc(old, 'page', f, { p_days: 0, p_page: 1 });
  assert.deepEqual(calls2.map((c) => c[0]), ['gdp_assistant_activity_page_v4', 'gdp_assistant_activity_page_v3']);
  assert.equal(calls2[1][1].p_branch_id, 1); assert.equal(calls2[1][1].p_device_id, 9); assert.equal(r2.legacy, true);
  const bad = { rpc: async () => ({ data: null, error: { code: '57014', message: 'timeout' } }) };
  assert.equal((await callActivityRpc(bad, 'page', f, {})).legacy, false); // un error real no se disfraza de migración faltante
});
test('la migración define _v4 con arreglos y exclusión de pruebas internas, sin tocar _v3', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261027_activity_multi_filters.sql', import.meta.url), 'utf8');
  assert.match(sql, /activity_dashboard_v4/); assert.match(sql, /activity_page_v4/);
  assert.match(sql, /p_branch_ids bigint\[\]/); assert.match(sql, /=ANY\(p_device_ids\)/);
  assert.match(sql, /nico\|mica\|admin/); assert.match(sql, /traffic_type<>'ADMIN'/);
  assert.doesNotMatch(sql, /FUNCTION public\.gdp_assistant_activity_(dashboard|page)_v3/);
});
test('la página de Actividad usa selección múltiple y excluye pruebas internas por defecto', () => {
  const src = fs.readFileSync(new URL('../../app/admin/actividad/page.jsx', import.meta.url), 'utf8');
  assert.match(src, /MultiSelect label="Sucursal"/); assert.match(src, /MultiSelect label="Dispositivo"/); assert.match(src, /MultiSelect label="Obra social"/);
  assert.match(src, /\[exclude,setExclude\]=useState\(true\)/); assert.match(src, /exclude_internal/);
});

const L = (id, over = {}) => ({ id, branch_id: 1, device_id: 7, device_name: 'Caja 1', conversation_id: null, traffic_type: 'PILOT', created_at: '2026-10-26T15:00:00Z', input_tokens: 1000, output_tokens: 100, ...over });
test('gasto por sucursal: reparte por tokens y separa las pruebas internas', () => {
  const names = new Map([['1', 'Libertad'], ['2', 'Economas']]);
  const u = buildBranchUsage({
    logs: [L(1), L(2, { branch_id: 2 }), L(3, { branch_id: 2 }), L(4, { device_name: 'Nico', input_tokens: 5000, output_tokens: 500 }), L(5, { input_tokens: 0, output_tokens: 0 })],
    shadow: [{ branch_id: 1, conversation_id: null, created_at: '2026-10-26T16:00:00Z', tokens_in: 3000, tokens_out: 200 }],
    branchNames: names,
  });
  const by = Object.fromEntries(u.rows.map((r) => [r.key, r]));
  assert.equal(by['1'].name, 'Libertad'); assert.equal(by['1'].requests, 2); assert.equal(by['1'].input_tokens, 4000);
  assert.equal(by['2'].requests, 2);
  assert.equal(by.internal.internal, true); assert.equal(by.internal.requests, 1);
  assert.equal(u.rows.at(-1).key, 'internal'); // las pruebas internas van al final
  assert.ok(Math.abs(u.rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  const cost = allocateCost(u.rows, 10);
  assert.ok(Math.abs(cost.reduce((n, r) => n + r.cost_usd, 0) - 10) < 1e-3);
});
test('gasto por sucursal: el motor hereda dispositivo interno por la conversación y se puede filtrar por día', () => {
  const conv = '11111111-1111-1111-1111-111111111111';
  const u = buildBranchUsage({
    logs: [L(1, { device_name: 'Nicolás', conversation_id: conv }), L(2, { created_at: '2026-10-25T10:00:00Z' })],
    shadow: [{ branch_id: 1, conversation_id: conv, created_at: '2026-10-26T15:01:00Z', tokens_in: 2000, tokens_out: 100 }],
    day: '2026-10-26',
  });
  assert.deepEqual(u.rows.map((r) => r.key), ['internal']);
  assert.equal(u.rows[0].requests, 2);
});
test('Gastos OpenAI muestra el gasto por sucursal', () => {
  const src = fs.readFileSync(new URL('../../app/admin/openai/page.jsx', import.meta.url), 'utf8');
  assert.match(src, /Gasto por/); assert.match(src, /openai-usage\/branches/);
});

test('v3.13.110: gasto por dispositivo — DP1 real separado de las pruebas de Nico y Mica', () => {
  const names = new Map([['1', 'DP1']]);
  const conv = '22222222-2222-2222-2222-222222222222';
  const u = buildBranchUsage({
    logs: [
      L(1, { device_id: 7, device_name: 'Directorio' }), L(2, { device_id: 7, device_name: 'Directorio' }),
      L(3, { device_id: 8, device_name: 'Nico', conversation_id: conv }), L(4, { device_id: 9, device_name: 'Micaela' }),
    ],
    shadow: [{ branch_id: 1, conversation_id: conv, created_at: '2026-10-26T16:00:00Z', tokens_in: 2000, tokens_out: 100 }],
    branchNames: names,
  });
  const dev = Object.fromEntries(u.device_rows.map((r) => [r.name, r]));
  assert.equal(dev['DP1 · Directorio'].internal, false); assert.equal(dev['DP1 · Directorio'].requests, 2);
  assert.equal(dev['DP1 · Nico'].internal, true); assert.equal(dev['DP1 · Nico'].requests, 2); // su llamada del motor se atribuye por la conversación
  assert.equal(dev['DP1 · Micaela'].internal, true);
  assert.equal(u.device_rows.at(-1).internal, true);
  assert.ok(Math.abs(u.device_rows.reduce((n, r) => n + r.share, 0) - 1) < 1e-9);
  // por sucursal: todo lo interno va a su propia fila, DP1 real queda limpio
  assert.equal(u.rows.find((r) => r.key === '1').requests, 2);
});
test('Gastos OpenAI: pestañas por sucursal y por dispositivo', () => {
  const src = fs.readFileSync(new URL('../../app/admin/openai/page.jsx', import.meta.url), 'utf8');
  assert.match(src, /Por dispositivo/); assert.match(src, /device_rows/);
});
