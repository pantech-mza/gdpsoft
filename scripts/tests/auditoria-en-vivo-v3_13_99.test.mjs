import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { balance, chunk, verifyCitations, parseModelOutput, estimateCost, modelList, validModel, confidenceNote, buildUserPrompt, SYSTEM_PROMPT, DEFAULT_MODELS } from '../../lib/audit/live-core.mjs';
import { normalizeProposal } from '../../lib/audit/proposals.mjs';

test('reparte las obras sociales de forma equilibrada entre los agentes', () => {
  const groups = [60, 40, 30, 20, 10, 10, 5, 5].map((n, i) => ({ workName: `OS${i}`, items: Array.from({ length: n }) }));
  const w = balance(groups, 4);
  assert.equal(w.length, 4); assert.equal(w.reduce((a, x) => a + x.total, 0), 180);
  assert.ok(Math.max(...w.map((x) => x.total)) - Math.min(...w.map((x) => x.total)) <= 20);
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('verifica que las citas existan literalmente en la información entregada', () => {
  const know = 'Para validar  PMI por\nAdmifarm se ingresa a http://validacionesag.com/ con el código.';
  const r = verifyCitations([{ cita: 'para validar PMI por Admifarm se ingresa', seccion: 'Obs' }, { cita: 'esto no figura en ningún lado', seccion: 'X' }, { cita: '' }], know);
  assert.equal(r.length, 2); assert.equal(r[0].verificada, true); assert.equal(r[1].verificada, false);
  assert.match(confidenceNote(r), /1 de 2 citas NO/);
  assert.equal(confidenceNote([]), null);
});

test('la cita con credenciales se omite antes de guardarse', () => {
  const r = verifyCitations([{ cita: 'el usuario: pepe clave: 1234 sirve', seccion: 'x' }], 'el usuario: pepe clave: 1234 sirve');
  assert.ok(!/pepe|1234/.test(r[0].cita));
});

test('interpreta la salida del modelo y detecta consultas omitidas', () => {
  const ok = parseModelOutput(JSON.stringify({ resultados: [{ id: 1, veredicto: 'CORRECTA' }, { id: 99, veredicto: 'CORRECTA' }] }), [1, 2]);
  assert.equal(ok.results.length, 1); assert.deepEqual(ok.missing, [2]);
  assert.equal(parseModelOutput('no es json', [1]).ok, false);
});

test('un resultado del modelo se convierte en propuesta conservando la marca de verificación', () => {
  const p = normalizeProposal({ id: 7, veredicto: 'INCORRECTA', causa: 'RUTEO', circuito: 'COLEGIO', respuesta_propuesta: 'Valida por TYS',
    fuentes: [{ archivo: 'conocimiento', seccion: 'Ficha', cita: 'Validador: TYS', verificada: true }] }, 'run-1');
  assert.equal(p.sources[0].verificada, true); assert.equal(p.applies_to_suggested, 'COLEGIO');
});

test('modelos: lista configurable, validación y costo estimado', () => {
  assert.deepEqual(modelList(''), DEFAULT_MODELS); assert.deepEqual(modelList('gpt-x, gpt-y'), ['gpt-x', 'gpt-y']);
  assert.deepEqual(modelList('mal modelo!'), DEFAULT_MODELS);
  assert.ok(validModel('gpt-4.1-mini')); assert.ok(!validModel('a b')); assert.ok(!validModel('../x'));
  assert.equal(estimateCost('gpt-4.1', 1_000_000, 100_000), 2.8); assert.equal(estimateCost('desconocido', 1, 1), null);
});

test('el prompt exige citas literales, no inventar y no repetir credenciales', () => {
  assert.match(SYSTEM_PROMPT, /LITERALES/); assert.match(SYSTEM_PROMPT, /NO la inventes/); assert.match(SYSTEM_PROMPT, /CREDENCIAL OMITIDA/);
  const u = buildUserPrompt({ workName: 'OSECAC', knowledge: 'K', general: 'G', items: [{ id: 5, pregunta: 'q', respuesta_bot: 'a', circuito: 'CAMARA' }] });
  assert.match(u, /OBRA SOCIAL: OSECAC/); assert.match(u, /"id": 5/);
});

test('el script en vivo escribe solo en tablas de auditoría y respeta pausa/stop', () => {
  const t = fs.readFileSync(new URL('../auditar-en-vivo.mjs', import.meta.url), 'utf8');
  const writes = [...t.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:upsert|insert|update|delete)/g)].map((m) => m[1]);
  assert.ok(writes.length > 3 && writes.every((w) => w.startsWith('audit_')), `escribe en ${writes}`);
  assert.match(t, /'PAUSE'/); assert.match(t, /'STOP'/); assert.match(t, /failed/);
  assert.ok(!/\.storage\.from\([^)]*\)\s*\.(upload|remove)/.test(t));
});

test('la API de corridas exige superadmin, valida el modelo y no permite dos corridas a la vez', () => {
  const a = fs.readFileSync(new URL('../../app/api/admin/auditoria/runs/route.js', import.meta.url), 'utf8');
  assert.match(a, /is_super_admin !== true/); assert.match(a, /validModel\(model\)/); assert.match(a, /409/);
  assert.ok(a.indexOf('superAdmin(request)') < a.indexOf('audit_runs').valueOf());
});

test('la migración crea corridas, agentes y latido con RLS', () => {
  const s = fs.readFileSync(new URL('../../supabase/migrations/20261024_auditoria_en_vivo.sql', import.meta.url), 'utf8');
  for (const t of ['audit_runs', 'audit_run_workers', 'audit_runner']) { assert.match(s, new RegExp(`create table if not exists public.${t}`)); assert.match(s, new RegExp(`${t} enable row level security`)); }
});
