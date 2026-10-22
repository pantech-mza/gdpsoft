import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripOtherBranchValidator } from '../../lib/assistant/ficha-summary.mjs';

const route = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');
const chat = fs.readFileSync(new URL('../../app/api/assistant/chat/route.js', import.meta.url), 'utf8');
const widget = fs.readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url), 'utf8');

test('validador de otra sucursal se quita si la sucursal no tiene la excepción', () => {
  assert.equal(stripOtherBranchValidator('Por dónde valida: TYS.\nValidador: GMS/SUC: San Francisco DP1.'), 'Por dónde valida: TYS.\nValidador: GMS.');
  assert.equal(stripOtherBranchValidator('Validador: MIS VALIDACIONES.'), 'Validador: MIS VALIDACIONES.');
});
test('opciones de «¿Quisiste decir…?» salen como botones', () => {
  assert.match(chat, /type: "CHOICES"/);
  assert.match(chat, /UNKNOWN_EXPLICIT_SOCIAL_WORK", "AMBIGUOUS_SOCIAL_WORK"/);
  assert.match(widget, /message\?\.ui\?\.type === "CHOICES"/);
  assert.match(widget, /action\.type === "CHOICE"/);
});
test('pregunta general sin normativa: la Ficha se prueba antes que notas y procedimientos', () => {
  const early = route.indexOf('earlyFicha');
  const notes = route.indexOf('const notesSupport = await answerFromApprovedNotes', early);
  assert.ok(early > 0 && notes > early);
});
test('un procedimiento general solo responde si nombra el tema puntual', () => {
  assert.match(route, /procedure\.scope === "GENERAL"/);
});
