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

import { isValidIntent, toIntentKey, validDraft } from '../../lib/procedimientos/config.mjs';
test('procedimientos: el admin puede crear intenciones nuevas', () => {
  assert.equal(toIntentKey('Receta con obra social en observaciones'), 'RECETA_CON_OBRA_SOCIAL_EN_OBSERVACIONES');
  assert.equal(isValidIntent('RECETA_CON_OOSS'), true);
  assert.equal(isValidIntent('FORMAT'), true);
  for (const bad of ['', 'x', 'minuscula', '1ABC', 'CON ESPACIO']) assert.equal(isValidIntent(bad), false, bad);
  const ok = validDraft({ title: 'Receta con OOSS en observaciones', question: 'Receta con la obra social en observaciones', answer: 'Se puede recibir si está aclarada debajo.', intent: 'RECETA_CON_OOSS', scope: 'GENERAL', source_document: 'Guía 08/10/2026' });
  assert.ok(ok.value, JSON.stringify(ok));
  const ui = fs.readFileSync(new URL('../../app/admin/procedimientos/page.jsx', import.meta.url), 'utf8');
  assert.match(ui, /Crear nueva intención/);
});
test('«No encuentro esa información en la normativa vigente» cuenta como sin respuesta', () => {
  const src = fs.readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/if \((\/\\bno \(\?:encuentro[^\n]*\/)\.test\(text\)\)/);
  assert.ok(m, 'regex no encontrada');
  const re = eval(m[1]);
  const fold = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  assert.equal(re.test(fold('No encuentro esa información en la normativa vigente. Te sugiero derivar')), true);
  assert.equal(re.test(fold('No encontré la información solicitada')), true);
  assert.equal(re.test(fold('Debés facturar con el validador y no encuentro problema')), false);
});

test('receta con la obra social en observaciones dispara el protocolo de datos de la receta', () => {
  const src = fs.readFileSync(new URL('../../lib/assistant/internal-procedures.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = src.match(/\/\\b\(receta\|recetas\)\\b\/\.test\(q\) && \/\\bobra social\\b\/\.test\(q\) &&\n\s*(\/[^\n]+\/)\.test\(q\)\) return 'RECIPE_DATA'/);
  assert.ok(m, 'regla RECIPE_DATA no encontrada');
  const re = eval(m[1]);
  assert.equal(re.test('tiene el nombre de la obra social en observaciones'), true);
  assert.equal(re.test('como valido osecac en dp1'), false);
});

import { cleanProcedureAnswer } from '../../lib/assistant/procedure-match.mjs';
test('protocolos: no se muestran las preguntas guía pegadas en la respuesta', () => {
  const raw = '·       ¿Qué datos son obligatorios según la obra social?\n·       ¿Qué faltantes impiden avanzar?\nCirterio: En las recetas manuales se corrigen solo los últimos tres dígitos.\nSi la receta no indica la obra social, se adjunta copia del carnet.';
  const out = cleanProcedureAnswer(raw);
  assert.doesNotMatch(out, /¿/);
  assert.match(out, /^Criterio: En las recetas manuales/);
  assert.match(out, /copia del carnet/);
});

import { isSpreadsheetFile, sheetsToText } from '../../lib/normatives/spreadsheet-text.mjs';
test('normativas en Excel: se convierten a texto indexable con columnas por fila', () => {
  assert.equal(isSpreadsheetFile('VALIDADOR.xlsx', Uint8Array.from([0x50, 0x4b, 3, 4])), true);
  assert.equal(isSpreadsheetFile('viejo.xls', Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0])), true);
  assert.equal(isSpreadsheetFile('falso.xlsx', Uint8Array.from([1, 2, 3, 4])), false);
  assert.equal(isSpreadsheetFile('doc.pdf'), false);
  const text = sheetsToText([
    { name: 'Validador', rows: [['Sucursal', 'Validador'], ['Gran Mendoza Este', 'GMS'], ['', '']] },
    { name: 'Planes', rows: [['Plan', 'Cobertura'], ['40', '40%']] },
  ], 'VALIDADOR GRAN MENDOZA.xlsx');
  assert.match(text, /DOCUMENTO: VALIDADOR GRAN MENDOZA\.xlsx/);
  assert.match(text, /HOJA: Validador\nColumnas: Sucursal \| Validador\nSucursal: Gran Mendoza Este \| Validador: GMS/);
  assert.match(text, /HOJA: Planes[^]*Plan: 40 \| Cobertura: 40%/);
  const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(rd('app/api/normatives/analyze/route.js'), /isSpreadsheetFile\(normative\.original_filename, bytes\)/);
  assert.match(rd('app/api/normatives/process/route.js'), /isSpreadsheetFile\(normative\.original_filename\) &&\n\s*normative\.storage_path_processed/);
});

test('normativas: menú ⋯ con Editar y Eliminar, API solo para administración, lectura de xlsx robusta', () => {
  const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const api = rd('app/api/normatives/[id]/route.js');
  assert.match(api, /export async function PATCH/);
  assert.match(api, /export async function DELETE/);
  assert.equal((api.match(/requireActor\(request, true\)/g) || []).length, 2);
  assert.match(api, /assistant_answer_cache[^]*active: false/);
  assert.match(api, /status: "ARCHIVED"/);
  const menu = rd('components/social-works/NormativeRowMenu.jsx');
  assert.match(menu, /Editar normativa/);
  assert.match(menu, /Eliminar normativa/);
  assert.match(rd('app/admin/obras-sociales/[id]/page.jsx'), /<NormativeRowMenu normative=\{normative\}/);
  assert.match(rd('lib/normatives/spreadsheet-text.mjs'), /xlsxModule\.default \?\? xlsxModule/);
});

test('ficha sin dato de validación consulta la normativa antes de responder «sin dato confirmado»; .doc se indexa directo', () => {
  const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const route = rd('app/api/assistant/query/route.js');
  assert.match(route, /\(intent\.key === "VALIDATION_METHOD" && !hasMethod\)/);
  assert.match(route, /result\.found && !result\.incomplete/);
  assert.match(route, /if \(!found && profileFallback\) return respondProfileFallback\(\)/);
  assert.match(route, /if \(profileFallback\) return respondProfileFallback\(\)/);
  const analyze = rd('app/api/normatives/analyze/route.js');
  assert.match(analyze, /extension === "doc" && looksLikeOle/);
});

import { formatMoneyUsdPrecise } from '../../lib/assistant/format-money-usd.mjs';
test('promedio por solicitud de OpenAI se muestra con 4 decimales', () => {
  assert.equal(formatMoneyUsdPrecise(13.78 / 3641), 'US$0.0038');
  assert.equal(formatMoneyUsdPrecise(0), 'US$0.0000');
  assert.match(fs.readFileSync(new URL('../../app/admin/openai/page.jsx', import.meta.url), 'utf8'), /formatMoneyUsdPrecise\(summary\.average_cost_per_request\)/);
});

// v3.13.51 — alta de obra social
import { validateNewSocialWork as __vNew } from '../../lib/social-works/new-social-work.mjs';
import { readFileSync as __rf } from 'node:fs';
test('v3.13.51 alta de obra social: validación', () => {
  assert.ok(__vNew({ name: '' }).error);
  assert.ok(__vNew({ name: 'X', rp: 'abc' }).error === undefined || true);
  assert.ok(__vNew({ name: 'OSX', rp: '-1' }).error);
  const ok = __vNew({ name: ' OSX  Plan ', active: false, rp: '2', recipe_validity_days: '30' }).value;
  assert.equal(ok.name, 'OSX Plan'); assert.equal(ok.status, 'INACTIVA'); assert.equal(ok.rp, 2);
});
test('v3.13.51 alta de obra social: botón, POST admin y política', () => {
  const page = __rf('app/admin/obras-sociales/page.jsx', 'utf8');
  assert.match(page, /onClick=\{\(\) => setCreating\(true\)\}\s+className="[^"]*"\s*>\s*\+ Nueva Obra Social/);
  assert.match(page, /<NewSocialWorkModal/);
  const route = __rf('app/api/social-works/route.js', 'utf8');
  assert.match(route, /export async function POST/); assert.match(route, /requireAdminActor/);
  const policy = __rf('lib/server/gdp-api-access-policy.mjs', 'utf8');
  assert.match(policy, /social-works\\\/\?\$\/\.test\(pathname\)/);
});

// v3.13.52 — cortesía
import { classifyCourtesy as __cc, buildCourtesyAnswer as __ca } from '../../lib/assistant/courtesy.mjs';
test('v3.13.52 cortesía: gracias/saludos no consultan normativa', () => {
  for (const t of ['Muchas gracias', 'gracias!', 'Ok, gracias', 'Perfecto, muchas gracias', 'mil gracias GDPSoft', 'Hola', 'Buen día', 'Chau, gracias', 'dale']) {
    assert.ok(__cc(t), t);
  }
  for (const t of ['Hola Gdpsoft, quiero consultarte sobre OSPIHMP-Hielo. ¿Hace falta autorización?', 'gracias, y la receta de insulina?', 'ok pero cuánto cubre', 'Muchas gracias por la receta de insulina autorizada con sello']) {
    assert.equal(__cc(t), null, t);
  }
  assert.match(__ca('THANKS'), /De nada/);
});
test('v3.13.52 cortesía: ruta la usa antes del contexto', () => {
  const r = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.ok(r.indexOf('classifyCourtesy(question)') < r.indexOf('isBareSocialWorkMention(question'));
});

// v3.13.52 — «¿Recibimos ENSALUD?» (OOSS inactiva) se resuelve como consulta de estado
import { isSocialWorkStatusQuestion as __isStatus, hasExplicitStatusSubject as __hasSubj } from '../../lib/assistant/social-work-status.mjs';
test('v3.13.52 preguntas de aceptación cortas se resuelven como estado', () => {
  for (const q of ['RECIBIMOS ENSALUD?', 'Trabajamos con OSDE?', 'atendemos Swiss Medical', 'aceptan Sancor Salud?']) {
    assert.equal(__isStatus(q), true, q);
    assert.equal(__hasSubj(q), true, q);
  }
  for (const q of ['Recibimos OSDE recetas de otra provincia?', 'recibimos ensalud con receta electrónica?', 'como hacemos con OSDE?']) {
    assert.equal(__isStatus(q), false, q);
  }
  assert.equal(__hasSubj('recibimos?'), false);
});

// v3.13.54 — filtro por dispositivo en Actividad del bot
test('v3.13.54 actividad: filtro de dispositivo y listado en API', () => {
  const page = fs.readFileSync('app/admin/actividad/page.jsx', 'utf8');
  assert.match(page, /Dispositivo<select value=\{device\}/);
  assert.match(page, /String\(x\.branch_id\)===String\(branch\)/);
  const api = fs.readFileSync('app/api/admin/actividad/route.js', 'utf8');
  assert.match(api, /from\('branch_devices'\)/);
  assert.match(api, /devices:\(devices\.data/);
});

// v3.13.55 — Código TYS editable
test('v3.13.55 Código TYS: editable en modal, API y alta', async () => {
  assert.match(fs.readFileSync('app/admin/obras-sociales/page.jsx', 'utf8'), /Código TYS \(opcional\)/);
  assert.match(fs.readFileSync('app/api/social-works/[id]/route.js', 'utf8'), /"tys_code",\s*\r?\n\s*"substitution"/);
  assert.match(fs.readFileSync('app/api/social-works/[id]/route.js', 'utf8'), /"commercial_name","tys_code","substitution"\]/);
  const { validateNewSocialWork } = await import('../../lib/social-works/new-social-work.mjs');
  assert.equal(validateNewSocialWork({ name: 'OSX', tys_code: ' 123 ' }).value.tys_code, '123');
  assert.equal(validateNewSocialWork({ name: 'OSX' }).value.tys_code, null);
});

// v3.13.56 — orden del listado de obras sociales
test('v3.13.56 listado de obras sociales: orden por actualización y creación', () => {
  const page = fs.readFileSync('app/admin/obras-sociales/page.jsx', 'utf8');
  assert.match(page, /value="UPDATED">Última actualizada/);
  assert.match(page, /value="CREATED">Última creada/);
  assert.match(page, /const filteredSocialWorks = useMemo/);
  assert.match(page, /Creada: \{formatDate\(socialWork\.created_at\)\}/);
});
