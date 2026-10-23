import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { collectAudit, maskSensitive, toCsv, QUERY_COLUMNS, circuitOf } from '../../lib/audit/export-audit.mjs';

function fakeSupabase(tables) {
  return {
    from(name) {
      let rows = [...(tables[name] || [])];
      const b = {
        select() { return b; },
        eq(c, v) { rows = rows.filter((r) => r[c] === v); return b; },
        in(c, vs) { rows = rows.filter((r) => vs.includes(r[c])); return b; },
        is(c, v) { rows = rows.filter((r) => (r[c] ?? null) === v); return b; },
        gte(c, v) { rows = rows.filter((r) => String(r[c]) >= v); return b; },
        order() { return b; },
        range(from, to) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); },
      };
      return b;
    },
  };
}

const tables = {
  branches: [{ id: 1, name: 'Colegio 1', branch_type: 'COLEGIO' }, { id: 2, name: 'Cámara 1', branch_type: 'CAMARA' }],
  social_works: [{ id: 10, name: 'OSDOP', created_by: 'x' }, { id: 11, name: 'OSDE' }],
  assistant_query_log: [
    { id: 100, created_at: '2026-10-20T10:00:00Z', branch_id: 1, social_work_id: 10, question: 'afiliado 12345678 sirve?', answer: 'Sí. Usuario: juan clave: 1234', route: 'SEMANTIC', found: true, traffic_type: 'PILOT' },
    { id: 101, created_at: '2026-10-10T10:00:00Z', branch_id: 1, social_work_id: 10, question: 'vieja', answer: 'x' },
    { id: 102, created_at: '2026-10-20T11:00:00Z', branch_id: 2, social_work_id: 11, question: 'de cámara', answer: 'y' },
  ],
  branch_response_reviews: [{ query_id: 100, verdict: 'INCORRECT', suggested_answer: 'Usar SISAO', applies_to: 'BOTH', updated_at: '2026-10-21' }],
  social_work_notes: [
    { id: 1, social_work_id: 10, kind: 'GENERAL', review_status: 'APPROVED', body: 'Nota general' },
    { id: 2, social_work_id: 10, kind: 'ACCESS', review_status: 'APPROVED', body: 'usuario: admin clave: secreta' },
    { id: 3, social_work_id: 10, kind: 'GENERAL', review_status: 'PENDING', body: 'sin aprobar' },
  ],
  internal_procedures: [{ id: 5, social_work_id: 10, active: true, code: 'P1', title: 'Proc', question: 'q', answer: 'a' }, { id: 6, social_work_id: null, active: true, code: 'G', title: 'General', question: 'q', answer: 'a' }],
  normative_social_works: [{ normative_id: 50, social_work_id: 10, billing_channel_id: 7, document_role: 'PRINCIPAL' }],
  normatives: [{ id: 50, title: 'Normativa OSDOP', original_filename: 'osdop.pdf', is_current: true }],
  billing_channels: [{ id: 7, name: 'Colegio' }],
};

test('enmascara datos personales y credenciales', () => {
  assert.equal(maskSensitive('DNI: 30.123.456 ok'), 'DNI: [DATO DEL PACIENTE] ok');
  assert.equal(maskSensitive('Afiliado N° 123456789'), 'Afiliado N° [DATO DEL PACIENTE]');
  assert.match(maskSensitive('usuario: pepe clave: abc123'), /usuario: \[CREDENCIAL\].*clave: \[CREDENCIAL\]/);
  assert.equal(maskSensitive('Plazo de 30 días'), 'Plazo de 30 días');
  assert.match(maskSensitive('mi dni 30123456', { bareNumbers: true }), /\[/);
});

test('exporta solo el circuito pedido, desde la fecha, con el conocimiento de cada obra social', async () => {
  const r = await collectAudit({
    supabase: fakeSupabase(tables), circuit: 'COLEGIO', since: '2026-10-19T03:00:00Z',
    extractNormativeText: async () => ({ text: 'Texto con DNI: 30123456', extraction: 'PDF' }),
  });
  assert.equal(r.queryRows.length, 1);
  assert.equal(r.queryRows[0].id, 100);
  assert.equal(r.queryRows[0].circuito, 'COLEGIO');
  assert.equal(r.queryRows[0].veredicto_admin, 'INCORRECT');
  assert.equal(r.queryRows[0].correccion_admin, 'Usar SISAO');
  assert.doesNotMatch(r.queryRows[0].pregunta, /12345678/);
  assert.doesNotMatch(r.queryRows[0].respuesta_bot, /1234/);
  assert.equal(r.knowledge.length, 1);
  const md = r.knowledge[0].markdown;
  assert.match(md, /Nota general/);
  assert.doesNotMatch(md, /sin aprobar/);
  assert.doesNotMatch(md, /secreta/);          // las observaciones de acceso nunca se exportan
  assert.match(md, /Normativa OSDOP/);
  assert.match(md, /Canal de facturación: Colegio/);
  assert.doesNotMatch(md, /30123456/);          // datos del paciente dentro de la normativa
  assert.match(md, /Usar SISAO/);
  assert.equal(r.general.length, 1);
  assert.deepEqual(r.errors, []);
});

test('un fallo al leer una normativa no corta la exportación', async () => {
  const r = await collectAudit({
    supabase: fakeSupabase(tables), circuit: 'COLEGIO', since: '2026-10-19T03:00:00Z',
    extractNormativeText: async () => { throw new Error('boom'); },
  });
  assert.match(r.knowledge[0].markdown, /ERROR: boom/);
  assert.equal(r.errors.length, 1);
});

test('el CSV escapa comillas y saltos de línea y circuitOf reconoce Cámara/Colegio', () => {
  const csv = toCsv([{ id: 1, pregunta: 'a "b"\nc' }], ['id', 'pregunta']);
  assert.match(csv, /"a ""b""\nc"/);
  assert.equal(circuitOf('Cámara'), 'CAMARA');
  assert.equal(circuitOf('COLEGIO'), 'COLEGIO');
  assert.ok(QUERY_COLUMNS.includes('respuesta_bot'));
});

test('el script es de solo lectura', () => {
  for (const f of ['scripts/exportar-auditoria.mjs', 'lib/audit/export-audit.mjs']) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
    assert.doesNotMatch(src, /storage[\s\S]{0,40}\.(upload|remove)\(/);
  }
});

test('el script recupera el texto de normativas cuando falta el archivo procesado', () => {
  const src = fs.readFileSync('scripts/exportar-auditoria.mjs', 'utf8');
  assert.match(src, /textFromVectorStore/);
  assert.match(src, /vector_stores\/\$\{vs\}\/files/);
  assert.match(src, /TEXTO INDEXADO EN OPENAI/);
  assert.doesNotMatch(src, /method:\s*['"](POST|PUT|DELETE|PATCH)/i);
});

test('circuito TODOS exporta ambos circuitos y consultas sin sucursal', async () => {
  const t = { ...tables, assistant_query_log: [...tables.assistant_query_log,
    { id: 103, created_at: '2026-10-21T10:00:00Z', branch_id: null, social_work_id: 10, question: 'prueba admin', answer: 'z', traffic_type: 'ADMIN' }] };
  const r = await collectAudit({ supabase: fakeSupabase(t), circuit: 'TODOS', since: '1970-01-01T00:00:00Z',
    extractNormativeText: async () => ({ text: 'x', extraction: 'PDF' }) });
  assert.deepEqual(r.queryRows.map((q) => q.id).sort(), [100, 101, 102, 103]);
  assert.equal(r.queryRows.find((q) => q.id === 102).circuito, 'CAMARA');
  assert.equal(r.queryRows.find((q) => q.id === 103).circuito, '');
  const src = fs.readFileSync('scripts/exportar-auditoria.mjs', 'utf8');
  assert.match(src, /aprobadas\.csv/);
  assert.match(src, /corregidas\.csv/);
  assert.match(src, /INICIO/);
});
