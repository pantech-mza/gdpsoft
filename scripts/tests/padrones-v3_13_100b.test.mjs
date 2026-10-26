import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { looksLikeRoster, cleanText } from '../../lib/audit/roster.mjs';

test('un padrón con muchos documentos se omite y una norma operativa normal no', () => {
  const padron = Array.from({ length: 60 }, (_, i) => `PEREZ JUAN ${20000000 + i * 137} 12/05/1980 EMPRESA SA`).join('\n');
  assert.equal(looksLikeRoster(padron), true);
  const norma = 'Vigencia 30 días. Teléfono 0800-333-3031. Validar en misvalidaciones.com.ar. Tope $220000. Decreto 1234567 del 2022.';
  assert.equal(looksLikeRoster(norma), false);
  assert.equal(looksLikeRoster(''), false);
});

test('se elimina el carácter nulo que rompe el guardado en la base', () => {
  assert.equal(cleanText('hola\u0000 mundo'), 'hola mundo');
  assert.equal(cleanText(null), '');
});

test('el script ya no omite por la palabra "planilla" y limpia el texto antes de guardar', () => {
  const s = fs.readFileSync(new URL('../construir-conocimiento.mjs', import.meta.url), 'utf8');
  assert.match(s, /looksLikeRoster\(text\)/); assert.match(s, /cleanText\(extracted\.text\)/); assert.ok(!/\/PLANILLA\/i\.test\(extraction\)/.test(s));
});

test('el resumen compara el motor nuevo con el bot actual usando el mismo juez cuando está disponible', async () => {
  const { summarize } = await import('../../lib/audit/proposals.mjs');
  const rows = [
    { verdict_ai: 'INCORRECT', replay_verdict: 'CORRECT', current_judged: 'CORRECT', status: 'PENDING', aging: 'VIGENTE' },
    { verdict_ai: 'INCORRECT', replay_verdict: 'CORRECT', current_judged: 'INCORRECT', status: 'PENDING', aging: 'VIGENTE' },
  ];
  const s = summarize(rows).replay;
  assert.equal(s.correct_pct, 100); assert.equal(s.current_correct_pct, 50); assert.equal(s.same_judge, true);
  const old = summarize([{ verdict_ai: 'INCORRECT', replay_verdict: 'CORRECT', status: 'PENDING', aging: 'VIGENTE' }]).replay;
  assert.equal(old.same_judge, false); assert.equal(old.current_correct_pct, 0);
});

test('probar-motor califica la respuesta original con el mismo juez y no escribe fuera de audit_proposals', () => {
  const s = fs.readFileSync(new URL('../probar-motor.mjs', import.meta.url), 'utf8');
  assert.match(s, /--solo-actual/); assert.match(s, /current_verdict/); assert.match(s, /judge\(p\.question, p\.proposed_answer, p\.bot_answer\)/);
  const writes = [...s.matchAll(/\.from\('([a-z_]+)'\)\s*\.(?:upsert|insert|update|delete)/g)].map((m) => m[1]);
  assert.ok(writes.length && writes.every((w) => w === 'audit_proposals'));
});
