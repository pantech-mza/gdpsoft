import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleApplies, ruleRank, procedureApplies, buildContextDocument, correctionApplies } from '../../lib/assistant/context-engine/core.mjs';
import { loadRecords } from '../../lib/assistant/context-engine/engine.mjs';

const groupOf = (t) => (/camara/i.test(String(t)) ? 'CAMARA' : /colegio/i.test(String(t)) ? 'COLEGIO' : null);
const TODAY = '2026-10-26';
const ctx = (branchId, circuit) => ({ branchId, circuit, today: TODAY, groupOf });

test('regla de SUCURSAL: solo para esa sucursal (DP1 = 1), nunca para otra', () => {
  const r = { rule_scope: 'BRANCH', branch_id: 1, approved: true, active: true };
  assert.equal(ruleApplies(r, ctx(1, 'CAMARA')), true);
  assert.equal(ruleApplies(r, ctx(24, 'COLEGIO')), false);
  assert.equal(ruleApplies(r, ctx(null, null)), false);
});
test('regla por TIPO de sucursal: Cámara solo para Cámara y Colegio solo para Colegio', () => {
  const cam = { rule_scope: 'BRANCH_TYPE', branch_type: 'CAMARA' }, col = { rule_scope: 'BRANCH_TYPE', branch_type: 'COLEGIO' };
  assert.equal(ruleApplies(cam, ctx(1, 'CAMARA')), true); assert.equal(ruleApplies(cam, ctx(24, 'COLEGIO')), false);
  assert.equal(ruleApplies(col, ctx(24, 'COLEGIO')), true); assert.equal(ruleApplies(col, ctx(1, 'CAMARA')), false);
});
test('regla GLOBAL aplica a todas; las no aprobadas, inactivas o fuera de vigencia no aplican', () => {
  assert.equal(ruleApplies({ rule_scope: 'GLOBAL' }, ctx(1, 'CAMARA')), true);
  assert.equal(ruleApplies({ rule_scope: 'GLOBAL', approved: false }, ctx(1, 'CAMARA')), false);
  assert.equal(ruleApplies({ rule_scope: 'GLOBAL', active: false }, ctx(1, 'CAMARA')), false);
  assert.equal(ruleApplies({ rule_scope: 'GLOBAL', valid_to: '2026-10-01' }, ctx(1, 'CAMARA')), false);
  assert.equal(ruleApplies({ rule_scope: 'GLOBAL', valid_from: '2026-12-01' }, ctx(1, 'CAMARA')), false);
});
test('especificidad: sucursal > tipo > global', () => {
  assert.ok(ruleRank({ rule_scope: 'BRANCH' }) < ruleRank({ rule_scope: 'BRANCH_TYPE' }));
  assert.ok(ruleRank({ rule_scope: 'BRANCH_TYPE' }) < ruleRank({ rule_scope: 'GLOBAL' }));
});
test('protocolos: aprobados, vigentes y del canal de facturación del circuito', () => {
  const channelName = new Map([['1', 'Cámara'], ['2', 'Colegio']]);
  const o = (circuit) => ({ circuit, today: TODAY, channelName });
  assert.equal(procedureApplies({ status: 'APPROVED', billing_channel_id: 1 }, o('CAMARA')), true);
  assert.equal(procedureApplies({ status: 'APPROVED', billing_channel_id: 1 }, o('COLEGIO')), false);
  assert.equal(procedureApplies({ status: 'APPROVED' }, o('COLEGIO')), true);
  assert.equal(procedureApplies({ status: 'DRAFT' }, o('CAMARA')), false);
  assert.equal(procedureApplies({ status: 'APPROVED', valid_to: '2026-01-01' }, o('CAMARA')), false);
});
test('correcciones: las de Colegio sin alcance no llegan a Cámara y viceversa; BOTH llega a todos', () => {
  assert.equal(correctionApplies(null, 'CAMARA', 'COLEGIO'), false);
  assert.equal(correctionApplies(null, 'COLEGIO', 'COLEGIO'), true);
  assert.equal(correctionApplies('BOTH', 'CAMARA', 'COLEGIO'), true);
  assert.equal(correctionApplies('COLEGIO', 'CAMARA', 'CAMARA'), false);
});

test('el documento indica sucursal y circuito, ordena las reglas por especificidad y no mezcla circuitos', () => {
  const doc = buildContextDocument({ work: { id: 7, name: 'OSECAC' }, branch: { id: 1, name: 'DP1', type: 'CAMARA' }, variant: null,
    rules: [{ rule_scope: 'GLOBAL', operation_summary: 'REGLA_GLOBAL', updated_at: '2026-10-25' }, { rule_scope: 'BRANCH', branch_id: 1, operation_summary: 'REGLA_DP1', updated_at: '2026-09-01' }, { rule_scope: 'BRANCH_TYPE', branch_type: 'CAMARA', operation_summary: 'REGLA_TIPO', updated_at: '2026-10-01' }],
    corrections: [{ suggested_answer: 'COFA_COLEGIO', applies_to: null, origin_circuit: 'COLEGIO', updated_at: '2026-10-21', question: 'q' }, { suggested_answer: 'TYS_CAMARA', applies_to: 'CAMARA', origin_circuit: 'CAMARA', updated_at: '2026-10-20', question: 'q' }] },
    { circuit: 'CAMARA' }).text;
  assert.match(doc, /Sucursal que consulta: DP1 \(CÁMARA\)/);
  assert.ok(doc.indexOf('REGLA_DP1') < doc.indexOf('REGLA_TIPO') && doc.indexOf('REGLA_TIPO') < doc.indexOf('REGLA_GLOBAL'));
  assert.match(doc, /prevalece sobre la del TIPO DE SUCURSAL/);
  assert.ok(!doc.includes('COFA_COLEGIO')); assert.ok(doc.includes('TYS_CAMARA'));
});

// Base de datos simulada: cada tabla devuelve todas sus filas; los filtros del motor (en código) son los que se prueban.
function fakeDb(tables) {
  const builder = (name) => { const filters = []; const rowsNow = () => (tables[name] || []).filter((row) => filters.every((f) => f(row)));
    const b = { select: () => b, eq: () => b, is: () => b, not: () => b, order: () => b, limit: () => b, in: (col, vals) => { filters.push((row) => vals.includes(row[col])); return b; },
      maybeSingle: () => Promise.resolve({ data: rowsNow()[0] || null }), then: (res, rej) => Promise.resolve({ data: rowsNow() }).then(res, rej) }; return b; };
  return { from: (name) => builder(name) };
}
const baseTables = (extra = {}) => ({ social_works: [{ id: 5, name: 'OSEP' }], social_work_circuit_profiles: [], social_work_notes: [], internal_procedures: [], social_work_faqs: [],
  social_work_operation_rules: [], billing_channels: [{ id: 1, name: 'Cámara' }, { id: 2, name: 'Colegio' }], branches: [{ id: 1, name: 'DP1', branch_type: 'CAMARA' }, { id: 24, name: 'Libertad', branch_type: 'COLEGIO' }],
  branch_response_reviews: [], normative_social_works: [], normatives: [], assistant_normative_text: [], ...extra });

test('loadRecords en DP1: reglas de otra sucursal y de otro tipo quedan afuera', async () => {
  const db = fakeDb(baseTables({ social_work_operation_rules: [
    { id: 1, rule_scope: 'BRANCH', branch_id: 1, approved: true, active: true, operation_summary: 'DP1' },
    { id: 2, rule_scope: 'BRANCH', branch_id: 24, approved: true, active: true, operation_summary: 'LIBERTAD' },
    { id: 3, rule_scope: 'BRANCH_TYPE', branch_type: 'COLEGIO', approved: true, active: true, operation_summary: 'TIPO_COLEGIO' },
    { id: 4, rule_scope: 'GLOBAL', approved: true, active: true, operation_summary: 'GLOBAL' }] }));
  const r = await loadRecords(db, { socialWorkId: 5, branchId: 1, circuit: 'CAMARA' });
  assert.deepEqual(r.rules.map((x) => x.id).sort(), [1, 4]);
  assert.equal(r.branch.name, 'DP1'); assert.equal(r.branch.type, 'CAMARA');
});
test('loadRecords en Libertad (Colegio): solo ve lo de Colegio', async () => {
  const db = fakeDb(baseTables({ social_work_operation_rules: [
    { id: 1, rule_scope: 'BRANCH', branch_id: 1, approved: true, active: true }, { id: 3, rule_scope: 'BRANCH_TYPE', branch_type: 'COLEGIO', approved: true, active: true }, { id: 5, rule_scope: 'BRANCH_TYPE', branch_type: 'CAMARA', approved: true, active: true }] }));
  const r = await loadRecords(db, { socialWorkId: 5, branchId: 24, circuit: 'COLEGIO' });
  assert.deepEqual(r.rules.map((x) => x.id), [3]);
});
test('loadRecords con plan OYTE: no mezcla normativas ni observaciones de OSEP general', async () => {
  const db = fakeDb(baseTables({
    normative_social_works: [{ normative_id: 10, billing_channel_id: null, plan_variant: null }, { normative_id: 11, billing_channel_id: null, plan_variant: 'OYTE' }],
    normatives: [{ id: 10, title: 'OSEP general', is_current: true }, { id: 11, title: 'OSEP OYTE', is_current: true }],
    assistant_normative_text: [{ normative_id: 10, text: 'texto general' }, { normative_id: 11, text: 'texto oyte' }],
    social_work_notes: [{ body: 'Nota del plan OYTE: padrón' }, { body: 'Nota general de OSEP' }] }));
  const oyte = await loadRecords(db, { socialWorkId: 6, branchId: 1, circuit: 'CAMARA', variant: 'OYTE' });
  assert.deepEqual(oyte.normatives.map((n) => n.id), [11]); assert.deepEqual(oyte.notes.map((n) => n.body), ['Nota del plan OYTE: padrón']);
  const general = await loadRecords(db, { socialWorkId: 6, branchId: 1, circuit: 'CAMARA', variant: null });
  assert.deepEqual(general.normatives.map((n) => n.id), [10]); assert.deepEqual(general.notes.map((n) => n.body), ['Nota general de OSEP']);
});
