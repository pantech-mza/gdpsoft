import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickDate, channelMatchesCircuit, correctionApplies, buildContextDocument, verifyEngineOutput, ENGINE_SYSTEM_PROMPT, buildEngineMessages, isExpired } from '../../lib/assistant/context-engine/core.mjs';
import { shadowConfig, shouldShadow } from '../../lib/assistant/context-engine/shadow.mjs';
import { maskSensitive } from '../../lib/audit/export-audit.mjs';

const records = () => ({
  work: { id: 7, name: 'OSECAC', recipe_validity_days: 30, updated_at: '2026-09-01T00:00:00Z', validator_name: 'GMS' },
  circuitProfile: { circuit_group: 'CAMARA', recipe_validity_days: 20, updated_at: '2026-10-01T00:00:00Z' },
  notes: [{ body: 'Vigencia 50 días', approved_at: '2026-10-20T10:00:00Z' }, { body: 'Vigencia 40 días', approved_at: '2026-10-02T10:00:00Z' }, { body: 'Sin fecha vieja' }],
  faqs: [{ question: 'a', answer: 'FAQ aprobada', approved_at: '2026-10-05T00:00:00Z', active: true }, { question: 'b', answer: 'FAQ rechazada', approved_at: '2026-10-05T00:00:00Z', status: 'REJECTED' }, { question: 'c', answer: 'FAQ pendiente', approved_at: null }],
  procedures: [], generalProcedures: [{ code: 'GDP-01', title: 'General', answer: 'Protocolo', updated_at: '2026-09-10T00:00:00Z' }], rules: [],
  corrections: [{ suggested_answer: 'Solo Colegio', applies_to: 'COLEGIO', updated_at: '2026-10-10T00:00:00Z', question: 'q1' },
    { suggested_answer: 'Para Cámara usuario: pepe clave: 123', applies_to: 'CAMARA', updated_at: '2026-10-11T00:00:00Z', question: 'q2' },
    { suggested_answer: 'Ambos', applies_to: 'BOTH', updated_at: '2026-10-12T00:00:00Z', question: 'q3' }],
  normatives: [{ title: 'Norma vieja', effective_from: '2025-01-01', text: 'texto viejo' }, { title: 'Norma nueva', effective_from: '2026-09-15', text: 'texto nuevo 30 días' },
    { title: 'Campaña vencida', effective_from: '2026-01-01', effective_to: '2026-08-31', text: 'vacunas' }],
});

test('cada pieza lleva fecha y dentro de cada sección va de la más reciente a la más antigua', () => {
  const { text } = buildContextDocument(records(), { circuit: 'CAMARA', mask: maskSensitive, now: Date.parse('2026-10-22') });
  assert.ok(text.indexOf('Vigencia 50 días') < text.indexOf('Vigencia 40 días'));
  assert.ok(text.indexOf('Vigencia 40 días') < text.indexOf('Sin fecha vieja'), 'sin fecha = la más antigua');
  assert.match(text, /Observación · fecha 2026-10-20/);
  assert.ok(text.indexOf('Norma nueva') < text.indexOf('Norma vieja'));
});

test('correcciones: solo las que aplican al circuito; FAQ solo las aprobadas y vigentes', () => {
  const { text } = buildContextDocument(records(), { circuit: 'CAMARA', mask: maskSensitive });
  assert.ok(!text.includes('Solo Colegio')); assert.match(text, /Ambos/); assert.match(text, /Para Cámara/);
  assert.match(text, /FAQ aprobada/); assert.ok(!text.includes('FAQ rechazada')); assert.ok(!text.includes('FAQ pendiente'));
  assert.ok(correctionApplies('COLEGIO', 'COLEGIO') && !correctionApplies('COLEGIO', 'CAMARA') && correctionApplies('BOTH', 'CAMARA'));
  assert.ok(correctionApplies(null, 'CAMARA', 'CAMARA') && !correctionApplies(null, 'CAMARA', 'COLEGIO'));
});

test('credenciales enmascaradas y normativa vencida señalada', () => {
  const { text } = buildContextDocument(records(), { circuit: 'CAMARA', mask: maskSensitive, now: Date.parse('2026-10-22') });
  assert.ok(!/pepe|clave: 123/.test(text)); assert.match(text, /VENCIDA/); assert.ok(isExpired('2026-08-31', Date.parse('2026-10-22')));
});

test('el ajuste por circuito se presenta con su fecha y la Ficha aclara que tiene una sola fecha', () => {
  const { text } = buildContextDocument(records(), { circuit: 'CAMARA', mask: maskSensitive });
  assert.match(text, /Ajustes de la Ficha para el circuito CAMARA · fecha 2026-10-01/); assert.match(text, /una sola fecha para todos sus campos/);
});

test('las normativas largas se recortan y se avisa', () => {
  const r = records(); r.normatives = [{ title: 'Enorme', effective_from: '2026-01-01', text: 'x'.repeat(5000) }];
  const out = buildContextDocument(r, { circuit: 'CAMARA', maxChars: 3000, maxNormativeChars: 1000, mask: (s) => s });
  assert.equal(out.truncated, true); assert.match(out.text, /recortado por tamaño/);
});

test('canal de facturación según el circuito', () => {
  assert.ok(channelMatchesCircuit('Cámara', 'CAMARA') && !channelMatchesCircuit('Cámara', 'COLEGIO'));
  assert.ok(channelMatchesCircuit('Cámara – Colegio', 'COLEGIO')); assert.ok(channelMatchesCircuit('Directo', 'COLEGIO')); assert.ok(channelMatchesCircuit('', 'CAMARA'));
});

test('verificación de la respuesta del modelo: citas literales', () => {
  const doc = 'La vigencia es de 30 días desde la fecha de prescripción.';
  const ok = verifyEngineOutput(JSON.stringify({ respuesta: '30 días', fuentes: [{ seccion: 'N', cita: 'La vigencia es de 30 días desde la fecha' }] }), doc);
  assert.equal(ok.status, 'OK'); assert.equal(ok.sources[0].verificada, true);
  const inv = verifyEngineOutput(JSON.stringify({ respuesta: '60 días', fuentes: [{ seccion: 'N', cita: 'La vigencia es de 60 días en todos los casos' }] }), doc);
  assert.equal(inv.status, 'UNVERIFIED');
  assert.equal(verifyEngineOutput(JSON.stringify({ respuesta: 'No hay info', sin_base: true, fuentes: [] }), doc).status, 'NO_BASIS');
  assert.equal(verifyEngineOutput(JSON.stringify({ respuesta: '¿De qué?', necesita_aclaracion: true }), doc).status, 'CLARIFY');
  assert.equal(verifyEngineOutput(JSON.stringify({ respuesta: '¡De nada!', es_cortesia: true }), doc).status, 'OK');
  assert.equal(verifyEngineOutput('basura', doc).status, 'ERROR');
  const c = verifyEngineOutput(JSON.stringify({ respuesta: 'x', fuentes: [{ cita: 'La vigencia es de 30 días' }], conflictos: [{ tema: 't', gana: { cita: 'La vigencia es de 30 días' }, pierde: { cita: 'inventada que no está' } }] }), doc);
  assert.equal(c.conflicts[0].gana.verificada, true); assert.equal(c.conflicts[0].pierde.verificada, false);
});

test('el prompt fija la precedencia por fecha y la prioridad de las correcciones del admin', () => {
  assert.match(ENGINE_SYSTEM_PROMPT, /CORRECCIONES DEL ADMINISTRADOR prevalecen siempre/); assert.match(ENGINE_SYSTEM_PROMPT, /FECHA MÁS RECIENTE/);
  assert.match(ENGINE_SYSTEM_PROMPT, /sin fecha se considera la más antigua/); assert.match(ENGINE_SYSTEM_PROMPT, /VENCIDA/); assert.match(ENGINE_SYSTEM_PROMPT, /NO mezcles|No mezcles/);
  const m = buildEngineMessages({ document: 'DOC', history: [{ question: 'a', answer: 'b' }], question: 'Y si vence?' });
  assert.ok(m[1].content.startsWith('DOC')); assert.ok(m[1].content.trim().endsWith('Y si vence?'));
});

test('modo sombra: apagado por defecto y filtros', () => {
  assert.equal(shadowConfig({}).enabled, false); assert.equal(shadowConfig({ CONTEXT_ENGINE_MODE: 'shadow' }).enabled, false, 'sin clave de OpenAI no corre');
  const cfg = shadowConfig({ CONTEXT_ENGINE_MODE: 'shadow', OPENAI_API_KEY: 'k', CONTEXT_ENGINE_BRANCHES: '1, 15', CONTEXT_ENGINE_SAMPLE: '1' });
  assert.ok(cfg.enabled && shouldShadow(cfg, { socialWorkId: 7, branchId: 1, route: 'SEMANTIC', ok: true }));
  assert.ok(!shouldShadow(cfg, { socialWorkId: 7, branchId: 2, route: 'SEMANTIC', ok: true }));
  assert.ok(!shouldShadow(cfg, { socialWorkId: 7, branchId: 1, route: 'IMAGE_VISION_SAFE', ok: true }));
  assert.ok(!shouldShadow(cfg, { socialWorkId: null, branchId: 1, route: 'SEMANTIC', ok: true }));
  assert.ok(!shouldShadow({ ...cfg, sample: 0.1 }, { socialWorkId: 7, branchId: 1, route: 'X', ok: true, rand: 0.5 }));
});

test('el hook del bot es solo sombra: va después de armar la respuesta, dentro de after() y sin tocar la respuesta', () => {
  const r = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
  const i = r.indexOf('motor de contexto completo en MODO SOMBRA'); assert.ok(i > 0);
  const seg = r.slice(i, r.indexOf('return response;', i));
  assert.match(seg, /after\(\(\) => runShadow/); assert.ok(!/response\s*=/.test(seg), 'no reasigna la respuesta');
  assert.match(r, /from "next\/server"/);
});

test('los scripts escriben solo donde corresponde y no tocan archivos de normativas', () => {
  const allowed = { 'construir-conocimiento': ['assistant_normative_text'], 'probar-motor': ['audit_proposals'] };
  for (const [f, tables] of Object.entries(allowed)) {
    const t = fs.readFileSync(new URL(`../${f}.mjs`, import.meta.url), 'utf8');
    const writes = [...t.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:upsert|insert|update|delete)/g)].map((m) => m[1]);
    assert.ok(writes.length && writes.every((w) => tables.includes(w)), `${f} escribe en ${writes}`);
    assert.ok(!/\.storage\.from\([^)]*\)\s*\.(upload|remove)/.test(t));
  }
  const s = fs.readFileSync(new URL('../../lib/assistant/context-engine/shadow.mjs', import.meta.url), 'utf8');
  assert.deepEqual([...s.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:upsert|insert|update|delete)/g)].map((m) => m[1]), ['assistant_shadow_results']);
});

test('la lectura de notas excluye las de acceso (credenciales) y la repetición excluye la corrección de la propia pregunta', () => {
  const e = fs.readFileSync(new URL('../../lib/assistant/context-engine/engine.mjs', import.meta.url), 'utf8');
  assert.match(e, /eq\('kind', 'GENERAL'\)/); assert.match(e, /eq\('review_status', 'APPROVED'\)/); assert.match(e, /excludeQueryIds\.includes/);
  assert.match(fs.readFileSync(new URL('../probar-motor.mjs', import.meta.url), 'utf8'), /excludeQueryIds: \[p\.query_id\]/);
});

test('la migración crea las tablas con RLS', () => {
  const s = fs.readFileSync(new URL('../../supabase/migrations/20261025_motor_contexto_completo.sql', import.meta.url), 'utf8');
  for (const t of ['assistant_normative_text', 'assistant_shadow_results']) { assert.match(s, new RegExp(`create table if not exists public.${t}`)); assert.match(s, new RegExp(`${t} enable row level security`)); }
  assert.match(s, /replay_model/);
});
