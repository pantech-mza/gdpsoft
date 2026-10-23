import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTrace, describeSearchResults, finalStep, ROUTE_LABELS } from '../../lib/assistant/trace.mjs';

test('el rastro registra pasos en orden y recorta textos largos', () => {
  const t = createTrace();
  t.add('correcciones_admin', { candidatas_de_este_circuito: 2, resultado: 'x'.repeat(500) });
  t.add('buscador_normativas', { fuentes_recuperadas: describeSearchResults([{ filename: 'a.pdf', score: 0.91234, text: 'texto '.repeat(100), attributes: { normative_id: 5 } }]) });
  const s = t.snapshot();
  assert.equal(s.length, 2);
  assert.equal(s[0].n, 1);
  assert.ok(s[0].resultado.length <= 240);
  assert.equal(s[1].fuentes_recuperadas[0].normativa_id, 5);
  assert.equal(s[1].fuentes_recuperadas[0].puntaje, 0.912);
  assert.ok(s[1].fuentes_recuperadas[0].extracto.length <= 220);
});

test('el rastro nunca tira error ni crece sin límite', () => {
  const t = createTrace();
  for (let i = 0; i < 100; i++) t.add('x', { circular: undefined });
  assert.ok(t.snapshot().length <= 40);
  assert.doesNotThrow(() => t.add('y', null));
  assert.equal(finalStep({ route: 'ADMIN_CORRECTION', source: 'ADMIN_CORRECTION', found: true }).descripcion, ROUTE_LABELS.ADMIN_CORRECTION);
});

test('la consulta guarda el rastro y Validación lo muestra', () => {
  const route = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(route, /createTrace\(\)/);
  assert.match(route, /trace\.add\("buscador_normativas"/);
  assert.match(route, /trace\.add\("correcciones_admin"/);
  assert.match(route, /extras\.trace = trace/);
  assert.match(fs.readFileSync('app/api/admin/validacion/route.js', 'utf8'), /trace:traceByQuery/);
  assert.match(fs.readFileSync('components/admin/AdminBranchValidation.jsx', 'utf8'), /¿Cómo llegó a esta respuesta\?/);
  assert.match(fs.readFileSync('supabase/migrations/20261022_trace_consultas.sql', 'utf8'), /add column if not exists trace jsonb/);
});

test('el rastro explica por qué se eligió cada fuente (Ficha, operación, protocolo, observaciones)', () => {
  const route = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  for (const stage of ['ficha', 'ficha_como_respaldo', 'regla_de_operacion', 'protocolo_interno', 'observaciones_aprobadas', 'protocolo_ultimo_recurso', 'requisitos_ficha_y_normativa']) {
    assert.match(route, new RegExp(`trace\\.add\\("${stage}"`));
  }
  assert.doesNotMatch(route, /respondProfileFallback = async \(\) => \{\s*const respondProfileFallback/);
  assert.match(fs.readFileSync('components/admin/AdminBranchValidation.jsx', 'utf8'), /Por qué: /);
});
