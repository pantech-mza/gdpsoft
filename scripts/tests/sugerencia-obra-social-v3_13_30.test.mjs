import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSuggestionAnswer, editDistance, suggestSocialWorks } from '../../lib/assistant/social-work-suggestions.mjs';
import { applySuggestion, buildNextState, isSuggestionConfirmation } from '../../lib/assistant/conversation-context.mjs';

const NAMES = ['OSTES', 'OSDE', 'OSDEPYM', 'OSECAC', 'OSEP', 'PREMEDIC', 'LA SEGUNDA ART / LA SEGUNDA PERSONAS', 'GALENO'];

test('editDistance básico', () => {
  assert.equal(editDistance('oste', 'ostes'), 1);
  assert.equal(editDistance('abc', 'abc'), 0);
});

test('OSTE sugiere OSTES (prefijo gana a OSDE, que también está a distancia 1)', () => {
  assert.deepEqual(suggestSocialWorks('OSTE', NAMES), ['OSTES']);
});

test('errores de tipeo y casos sin sugerencia', () => {
  assert.deepEqual(suggestSocialWorks('PREMEDIK', NAMES), ['PREMEDIC']);
  assert.deepEqual(suggestSocialWorks('OSECAK', NAMES), ['OSECAC']);
  assert.deepEqual(suggestSocialWorks('SALUD XYZ INVENTADA', NAMES), []);
  assert.deepEqual(suggestSocialWorks('OSDE', NAMES), ['OSDEPYM']); // OSDE existe, pero la lista no lo excluye por prefijo
  assert.deepEqual(suggestSocialWorks('xx', NAMES), []);
});

test('texto de la respuesta', () => {
  assert.equal(buildSuggestionAnswer('OSTE', ['OSTES']),
    'No pude identificar OSTE entre las obras sociales activas de GDPSoft. ¿Quizás quisiste consultar por OSTES? Confirmame el nombre para poder ayudarte con la información correspondiente.');
  assert.match(buildSuggestionAnswer('OS', ['A', 'B', 'C']), /por A, B o C\?/);
  assert.equal(buildSuggestionAnswer('X', []), null);
});

test('confirmación: «sí» o el nombre continúan la consulta original con la obra social corregida', () => {
  const json = { ok: true, question: 'Oste en mi sucursal va por camara-colegio?', answer: 'x', route: 'UNKNOWN_EXPLICIT_SOCIAL_WORK',
    found: false, suggestion: { unresolved: 'OSTE', name: 'OSTES', options: ['OSTES'] } };
  const state = buildNextState({ prev: null, rawQuestion: 'Oste en mi sucursal va por camara-colegio?', json });
  assert.equal(state.pending.kind, 'CONFIRM_SOCIAL_WORK');
  for (const reply of ['Si', 'sí, esa', 'OSTES', 'Obra social OSTES', 'dale']) assert.equal(isSuggestionConfirmation(reply, state), true, reply);
  for (const reply of ['y si esta vencida con osde?', 'como valido osde en mi sucursal hoy']) assert.equal(isSuggestionConfirmation(reply, state), false, reply);
  assert.equal(applySuggestion(state.pending), 'OSTES en mi sucursal va por camara-colegio?');
  assert.equal(isSuggestionConfirmation('si', null), false);
});

test('route.js ofrece la sugerencia y continúa al confirmar', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /suggestSocialWorks\(name,/);
  assert.match(src, /question = applySuggestion\(conversationState\.pending\)/);
  assert.match(src, /suggestion: \{ unresolved: name, name: suggestions\[0\]/);
});

import { isFollowUpMessage } from '../../lib/assistant/conversation-context.mjs';
test('repreguntas largas que empiezan con «Y» siguen el tema anterior', () => {
  const state = { v: 1, updated_at: new Date().toISOString(), social_work_id: 9, topic_question: 'pap descuento', last_question: 'si es con obra social?', pending: null };
  assert.equal(isFollowUpMessage('Y novo a la par? Que descuento tiene y que productos entran?', state, { socialWorkId: 9 }), true);
  assert.equal(isFollowUpMessage('Requisitos de la receta para validar con descuento en la farmacia de turno hoy mismo por favor y gracias', state, { socialWorkId: 9 }), false);
  assert.equal(isFollowUpMessage('Y novo a la par? Que descuento tiene y que productos entran?', state, { socialWorkId: 10 }), false);
});

import { buildPartialAnswerQuestion, isNotFoundAnswer } from '../../lib/assistant/conversation-context.mjs';
test('repregunta sin respuesta literal: se reintenta con lo que la normativa sí dice', () => {
  assert.equal(isNotFoundAnswer('No encuentro esa información en la normativa vigente.'), true);
  assert.equal(isNotFoundAnswer('PAP Descuento se aplica sobre el PVP.'), false);
  const q = buildPartialAnswerQuestion('y novo a la par? que descuento tiene?', { topic_question: 'pap descuento' });
  assert.match(q, /«pap descuento»/);
  assert.match(q, /NO figura/);
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /followUp\.isFollowUp && isNotFoundAnswer\(result\?\.answer\)/);
});

test('route.js: el prompt exige decir qué dato específico no figura', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /DATOS ESPECÍFICOS QUE NO FIGURAN/);
  assert.match(src, /Nunca reemplaces el dato pedido por una descripción general/);
});

test('analyze: los documentos de texto (DOCX) se marcan listos para indexar en modo DIRECT', () => {
  const src = fs.readFileSync(new URL('../../app/api/normatives/analyze/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /extension === "docx" && looksLikeZip/);
  assert.match(src, /processing_recommended: "DIRECT"/);
  // el PDF sigue validándose igual
  assert.match(src, /signature !== "%PDF-"/);
  assert.ok(src.indexOf('isTextDocument') < src.indexOf('El archivo almacenado no parece ser un PDF válido'));
});

test('Cómo facturar: el bucket se iguala a los 100 MB que anuncia la app', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261020_billing_files_limit_100mb.sql', import.meta.url), 'utf8');
  assert.match(sql, /file_size_limit = 104857600/);
  assert.match(sql, /id = 'gdp-billing-files'/);
  const ui = fs.readFileSync(new URL('../../components/social-works/ResourcesPanel.jsx', import.meta.url), 'utf8');
  assert.match(ui, /exceeded the maximum allowed size/);
});

import {
  buildNotesInstructions, formatNotesAnswer, loadApprovedNotes, parseNotesAnswer, pickApprovedNotes,
} from '../../lib/assistant/approved-notes.mjs';
test('observaciones de apoyo: solo GENERAL y APROBADAS; nunca accesos ni históricas pendientes', () => {
  const notes = pickApprovedNotes([
    { kind: 'GENERAL', review_status: 'APPROVED', body: '1° unión personal (40%)\n2° bonos pap (30%)' },
    { kind: 'GENERAL', review_status: 'PENDING', body: 'histórica sin revisar' },
    { kind: 'ACCESS', review_status: 'APPROVED', body: 'usuario: x clave: y' },
    { kind: 'GENERAL', review_status: 'APPROVED', body: '   ' },
  ]);
  assert.deepEqual(notes, ['1° unión personal (40%)\n2° bonos pap (30%)']);
  const prompt = buildNotesInstructions('SECASFPI', notes);
  assert.match(prompt, /EXCLUSIVAMENTE las observaciones/);
  assert.match(prompt, /NO_APLICA/);
  assert.match(prompt, /Los correos electrónicos sí podés incluirlos/);
  assert.match(prompt, /NUNCA incluyas usuarios, claves[^]*Ver credenciales/);
  assert.ok(!/histórica sin revisar|clave: y/.test(prompt));
});

test('observaciones de apoyo: NO_APLICA se descarta y la respuesta aclara su origen', () => {
  assert.equal(parseNotesAnswer('NO_APLICA'), null);
  assert.equal(parseNotesAnswer(' no_aplica. '), null);
  assert.equal(parseNotesAnswer(''), null);
  assert.equal(parseNotesAnswer('1. Unión personal'), '1. Unión personal');
  assert.match(formatNotesAnswer('1. Unión personal'), /Fuente: observación operativa aprobada por Administración \(no es normativa oficial\)\.$/);
});

test('observaciones de apoyo: degradan sin romper y la consulta filtra por GENERAL + APPROVED', async () => {
  assert.deepEqual(await loadApprovedNotes({ from() { throw new Error('boom'); } }, 5), []);
  assert.deepEqual(await loadApprovedNotes({}, null), []);
  const calls = [];
  const chain = { select() { return chain; }, eq(k, v) { calls.push([k, v]); return chain; }, order() { return chain; },
    then(res) { res({ data: [{ kind: 'GENERAL', review_status: 'APPROVED', body: 'ok' }], error: null }); } };
  assert.deepEqual(await loadApprovedNotes({ from: () => chain }, 5), ['ok']);
  assert.deepEqual(calls, [['social_work_id', 5], ['kind', 'GENERAL'], ['review_status', 'APPROVED']]);
});

test('route.js usa las observaciones solo si no hay normativa o no respondió', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal((src.match(/route: "APPROVED_NOTES_FALLBACK"/g) || []).length, 4); // 2 puntos de uso × (log + respuesta)
  assert.match(src, /if \(!normativeScope\.ambiguous\) \{\n\s+const notesSupport/);
  assert.ok(src.indexOf('v3.13.36 — la normativa no respondió') < src.indexOf('resolveInternalProcedure({\n        question, socialWorkId, billingChannelId: activeBillingChannelId,'));
});

import { buildCredentialAnswer, extractEmails, isCredentialQuestion } from '../../lib/assistant/approved-notes.mjs';
test('usuarios y claves: el bot no los dice, indica «Ver credenciales» y sí pasa los correos', () => {
  for (const q of ['cual es el usuario de secasfpi', 'me pasas la clave?', 'contraseña de ingreso', 'credenciales de OSDE', 'password del validador']) {
    assert.equal(isCredentialQuestion(q), true, q);
  }
  for (const q of ['como valido osecac', 'requisitos de receta', 'acceso a la web de validacion']) {
    assert.equal(isCredentialQuestion(q), false, q);
  }
  assert.deepEqual(extractEmails(['* mail: mterraza@gdpsalud.com.ar, F108', 'otra nota', 'mterraza@gdpsalud.com.ar']), ['mterraza@gdpsalud.com.ar']);
  const withAccess = buildCredentialAnswer({ socialWorkName: 'SECASFPI', hasAccessNotes: true, emails: ['a@b.com'] });
  assert.match(withAccess, /cifrados y no puedo verlos/);
  assert.match(withAccess, /«Ver credenciales»/);
  assert.match(withAccess, /Correo registrado: a@b\.com\./);
  assert.match(buildCredentialAnswer({ socialWorkName: 'X', hasAccessNotes: false }), /No hay credenciales cargadas/);
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /route: "CREDENTIALS_PROTECTED"/);
  assert.ok(src.indexOf('isCredentialQuestion(question)') < src.indexOf('const cachedAnswer'));
});

test('«Ver fuente» abre el archivo subido con un enlace generado al hacer clic', () => {
  const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(rd('app/api/normatives/[id]/file/route.js'), /createSignedUrl\(data\.storage_path_original/);
  assert.match(rd('components/social-works/NormativeFileButton.jsx'), /\/api\/normatives\/\$\{id\}\/file/);
  for (const p of ['app/admin/obras-sociales/[id]/page.jsx', 'app/sucursal/obras-sociales/[id]/page.jsx', 'app/sucursal/normativas/page.jsx']) {
    assert.match(rd(p), /<NormativeFileButton/, p);
  }
});

import { isPrescriptionMissingFieldQuestion, buildMissingFieldNormativeQuestion } from '../../lib/assistant/prescription-safety.mjs';
test('receta con la obra social en Observaciones se consulta en normativa, no como recepción por circuito', () => {
  const q = 'Hola tengo una receta de DAMSU, que tiene el nombre de la obra social en observaciones, puedo recibirla?';
  assert.equal(isPrescriptionMissingFieldQuestion(q), true);
  assert.match(buildMissingFieldNormativeQuestion({ question: q, socialWorkName: 'DAMSU' }), /campo Observaciones[^]*NO respondas sobre circuito/);
  for (const other of ['puedo recibir recetas de DAMSU en DP1', 'como valido osecac en mi suc', 'tengo una receta de OSDE puedo recibirla']) {
    assert.equal(isPrescriptionMissingFieldQuestion(other), false, other);
  }
});

import { buildProcedureSelectionInstructions, formatProcedureAnswer, parseProcedureSelection } from '../../lib/assistant/procedure-match.mjs';
test('protocolos internos: el modelo solo elige el código y la respuesta es el texto aprobado', () => {
  const procs = [
    { code: 'GDP-DATOS', title: 'Receta con datos incompletos', question: 'datos faltantes', answer: 'En recetas electrónicas se puede recibir si la obra social está aclarada debajo.' },
    { code: 'GDP-VENC', title: 'Vigencia', question: 'vencida', answer: 'Se cuenta desde la fecha de prescripción.' },
  ];
  assert.match(buildProcedureSelectionInstructions(procs), /\[GDP-DATOS\][^]*\[GDP-VENC\]/);
  assert.equal(parseProcedureSelection('[GDP-DATOS]', procs).code, 'GDP-DATOS');
  assert.equal(parseProcedureSelection('gdp-venc', procs).code, 'GDP-VENC');
  assert.equal(parseProcedureSelection('NINGUNO', procs), null);
  assert.equal(parseProcedureSelection('GDP-INVENTADO', procs), null);
  assert.match(formatProcedureAnswer(procs[0]), /aclarada debajo[^]*Prevalece la normativa específica/);
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /route: "INTERNAL_PROCEDURE_BY_MEANING"/);
  assert.match(src, /\(!found && prescriptionMissingField\)/);
  assert.match(src, /\|\| await answerFromProceduresByMeaning\(/);
});
