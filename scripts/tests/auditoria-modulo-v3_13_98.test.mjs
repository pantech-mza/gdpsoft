import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeProposal, normalizeVerdict, computeAging, summarize, validateDecision, stripSecrets, defaultAppliesTo } from '../../lib/audit/proposals.mjs';

test('normaliza lo que devuelven los agentes', () => {
  const p = normalizeProposal({ id: 5014, obra_social_id: '0007', circuito: 'CÁMARA', veredicto: 'INCORRECTA', causa: 'RUTEO',
    respuesta_propuesta: 'Valida por TYS', fuentes: [{ archivo: 'a.md', seccion: 'Ficha', cita: 'usuario: pepe clave: 1234 resto' }], coincide_admin: true }, 'L1');
  assert.equal(p.query_id, 5014); assert.equal(p.verdict_ai, 'INCORRECT'); assert.equal(p.circuit, 'CAMARA');
  assert.equal(p.applies_to_suggested, 'CAMARA'); assert.equal(p.agrees_admin, true);
  assert.ok(!/pepe|1234/.test(p.sources[0].cita)); assert.match(p.sources[0].cita, /CREDENCIAL OMITIDA/);
  assert.equal(normalizeProposal({ id: 'x', veredicto: 'CORRECTA' }, 'L'), null);
  assert.equal(normalizeProposal({ id: 1, veredicto: 'rara' }, 'L'), null);
  assert.equal(normalizeVerdict('sin base'), 'NO_BASE');
  assert.equal(defaultAppliesTo(null), 'BOTH');
});

test('antigüedad: marca posiblemente resuelta si hubo una corrección posterior de esa obra social', () => {
  const prop = { query_id: 10, verdict_ai: 'INCORRECT', query_created_at: '2026-10-19T12:00:00Z' };
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(computeAging(prop, [{ query_id: 99, updated_at: '2026-10-20T10:00:00Z' }], now).aging, 'POSIBLEMENTE_RESUELTA');
  assert.equal(computeAging(prop, [{ query_id: 99, updated_at: '2026-10-18T10:00:00Z' }], now).aging, 'VIGENTE');
  assert.equal(computeAging(prop, [{ query_id: 10, updated_at: '2026-10-20T10:00:00Z' }], now).aging, 'VIGENTE', 'la corrección de la propia consulta no cuenta');
  assert.equal(computeAging({ ...prop, verdict_ai: 'CORRECT' }, [], now).aging, 'SIN_CAMBIOS');
  assert.equal(computeAging(prop, [], now).detail.age_days, 3);
});

test('resumen calcula aceptación y agrupa', () => {
  const rows = [{ verdict_ai: 'CORRECT', circuit: 'CAMARA', social_work_name: 'A', status: 'PENDING', aging: 'SIN_CAMBIOS' },
    { verdict_ai: 'INCORRECT', circuit: 'CAMARA', social_work_name: 'A', cause: 'RUTEO', status: 'APPROVED', aging: 'VIGENTE' },
    { verdict_ai: 'PARTIAL', circuit: 'COLEGIO', social_work_name: 'B', status: 'PENDING', aging: 'VIGENTE' },
    { verdict_ai: 'NA', circuit: null, status: 'PENDING', aging: 'SIN_CAMBIOS' }];
  const s = summarize(rows);
  assert.equal(s.judged, 3); assert.equal(s.acceptance_pct, 33.3); assert.equal(s.acceptance_with_partial_pct, 66.7);
  assert.equal(s.by_circuit.CAMARA.total, 2); assert.equal(s.by_cause.RUTEO, 1); assert.equal(s.by_status.APPROVED, 1);
});

test('decisión del superadmin se valida', () => {
  assert.ok(validateDecision({ id: 1, action: 'APPROVE', finalAnswer: '' }).error);
  assert.ok(validateDecision({ id: 0, action: 'REJECT' }).error);
  assert.ok(validateDecision({ id: 1, action: 'BORRAR' }).error);
  const ok = validateDecision({ id: 3, action: 'approve', finalAnswer: 'Respuesta correcta completa', appliesTo: 'colegio' });
  assert.equal(ok.action, 'APPROVE'); assert.equal(ok.appliesTo, 'COLEGIO');
  assert.equal(stripSecrets('password=abc y más'), '[CREDENCIAL OMITIDA] y más');
});

test('el endpoint exige superadmin, aprueba creando la corrección con alcance y no toca nada sin decisión', () => {
  const api = fs.readFileSync(new URL('../../app/api/admin/auditoria/route.js', import.meta.url), 'utf8');
  assert.match(api, /is_super_admin !== true/);
  assert.match(api, /branch_response_reviews/); assert.match(api, /deactivateCachedAnswers/); assert.match(api, /applies_to/);
  assert.ok(api.indexOf('superAdmin(request)') < api.indexOf('branch_response_reviews'));
});

test('los scripts de importación escriben solo en las tablas de auditoría', () => {
  for (const f of ['importar-auditoria', 'generar-variantes']) {
    const t = fs.readFileSync(new URL(`../${f}.mjs`, import.meta.url), 'utf8');
    const writes = [...t.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:upsert|insert|update|delete)/g)].map((m) => m[1]);
    assert.ok(writes.every((w) => w.startsWith('audit_')), `${f} escribe en ${writes}`);
  }
});

test('la migración crea las tablas con RLS y sin acceso público', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261023_auditoria_propuestas.sql', import.meta.url), 'utf8');
  for (const t of ['audit_proposals', 'audit_variants']) {
    assert.match(sql, new RegExp(`create table if not exists public.${t}`)); assert.match(sql, new RegExp(`${t} enable row level security`)); assert.match(sql, new RegExp(`revoke all on public.${t} from anon`));
  }
});
