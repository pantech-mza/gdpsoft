// GDPSoft v3.13.20 — continuidad conversacional.
// Los textos de entrada son consultas reales del piloto (export del 20/10/2026).
// Son pruebas TÉCNICAS del estado conversacional; no validan exactitud normativa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildBareMentionAnswer, buildFollowUpSearchQuestion, buildNextState, detectChannelReply,
  isBareSocialWorkMention, isFollowUpMessage, loadConversationState, pendingRealQuestion,
  pickBillingChannel, resolveBranchBillingChannelId, resolveFollowUp, saveConversationState,
} from '../../lib/assistant/conversation-context.mjs';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const f4Json = {
  ok: true,
  question: 'Hola, sancor autorizados especiales formulario numero 4',
  answer: 'El Formulario de Autorización Nro. 4 se utiliza para recetas que no cumplen requisitos.',
  route: 'SEMANTIC', found: true, context: { social_work_id: 77 },
};
const f4State = () => buildNextState({ prev: null, rawQuestion: f4Json.question, json: f4Json, now: NOW });

// --- Respuesta a «¿Cámara o Colegio?» ---------------------------------------
test('detectChannelReply: respuestas reales del piloto', () => {
  for (const text of ['colegio', 'pertenezo a Camara', 'normativa de Cämara', 'yo pertenezco a Camara',
    'Estoy conectada en una sucursal de Camara.', 'Es para facturar en un sucursal de Colegio.']) {
    assert.ok(detectChannelReply(text), text);
  }
  assert.equal(detectChannelReply('colegio'), 'COLEGIO');
  assert.equal(detectChannelReply('pertenezo a Camara'), 'CAMARA');
});

test('detectChannelReply: «Cámara–Colegio» es un circuito, no una elección; los textos largos no cuentan', () => {
  assert.equal(detectChannelReply('camara colegio'), null);
  assert.equal(detectChannelReply('CAMARA COLEGIO OSECAC'), null);
  assert.equal(detectChannelReply('Con respecto a Provincia art, si tengo una receta con 2 medicamentos y no supera los $80.000, pero cada medicamento supera $20.000, en una sucursal de camara, necesito autorizacion?'), null);
  assert.equal(detectChannelReply('¿Qué requisitos tiene una receta de OSDE?'), null);
});

test('pickBillingChannel: no adivina si el catálogo es ambiguo', () => {
  const ok = [{ id: 1, code: 'CAMARA', name: 'Cámara' }, { id: 2, code: 'COLEGIO', name: 'Colegio' }];
  assert.equal(pickBillingChannel(ok, 'CAMARA').id, 1);
  assert.equal(pickBillingChannel(ok, 'COLEGIO').id, 2);
  assert.equal(pickBillingChannel([{ id: 3, code: 'CC', name: 'Cámara-Colegio' }], 'CAMARA'), null);
  assert.equal(pickBillingChannel([...ok, { id: 9, code: 'CAMARA2', name: 'Cámara' }], 'CAMARA'), null);
});

// --- Repreguntas -------------------------------------------------------------
test('el caso del Formulario 4: «Y por dónde se registra» continúa el tema', () => {
  const state = f4State();
  assert.equal(state.topic_question, f4Json.question);
  const follow = resolveFollowUp({ question: 'Y por donde se registra', state, socialWorkId: 77, now: NOW + 20_000 });
  assert.equal(follow.isFollowUp, true);
  assert.match(follow.searchQuestion, /formulario numero 4/i);
  assert.match(follow.searchQuestion, /Y por donde se registra/);
});

test('repreguntas y confirmaciones breves', () => {
  const state = f4State();
  for (const text of ['Y por donde se registra', 'sí', 'dale, mostrame', 'y si está vencido?', 'y eso donde se anota', 'más detalle',
    'Cual es el sistema?', 'Donde se anota?', '¿Cómo se hace?']) {
    assert.equal(isFollowUpMessage(text, state, { socialWorkId: 77, now: NOW + 5_000 }), true, text);
  }
});

test('NO es repregunta: consulta nueva, otra obra social, estado vencido o sin estado', () => {
  const state = f4State();
  const opts = { socialWorkId: 77, now: NOW + 5_000 };
  assert.equal(isFollowUpMessage('¿Cuál es el código TYS de OSDE?', state, opts), false);
  assert.equal(isFollowUpMessage('¿Qué hago si no tiene firma?', state, opts), false); // 6 palabras: consulta propia
  assert.equal(isFollowUpMessage('Tengo una receta sin fecha, ¿la puedo recibir?', state, opts), false);
  assert.equal(isFollowUpMessage('Y por donde se registra', state, { socialWorkId: 78, now: NOW + 5_000 }), false);
  assert.equal(isFollowUpMessage('Y por donde se registra', state, { socialWorkId: 77, now: NOW + 21 * 60_000 }), false);
  assert.equal(isFollowUpMessage('Y por donde se registra', null, opts), false);
  assert.equal(isFollowUpMessage('Y por donde se registra', {}, opts), false);
});

test('el tema se conserva a lo largo de varias repreguntas', () => {
  const s1 = f4State();
  const json2 = { ok: true, question: 'Y por donde se registra', answer: 'No se valida electrónicamente.', route: 'SEMANTIC', found: true, context: { social_work_id: 77 } };
  const s2 = buildNextState({ prev: s1, rawQuestion: 'Y por donde se registra', json: json2, now: NOW + 10_000 });
  assert.equal(s2.topic_question, f4Json.question);
  assert.equal(s2.last_question, 'Y por donde se registra');
  const s3 = buildNextState({ prev: s2, rawQuestion: 'Tengo una receta sin fecha, ¿la puedo recibir?',
    json: { ...json2, question: 'Tengo una receta sin fecha, ¿la puedo recibir?' }, now: NOW + 20_000 });
  assert.equal(s3.topic_question, 'Tengo una receta sin fecha, ¿la puedo recibir?');
});

// --- Estado pendiente por Cámara/Colegio ------------------------------------
const blockJson = (question) => ({
  ok: true, question, route: 'NORMATIVE_SCOPE_UNVERIFIED', found: false,
  answer: 'Esta obra social tiene normativas de Cámara y Colegio. Necesito confirmar el circuito antes de responder, para no mezclar requisitos.',
  context: { social_work_id: 5 },
});

test('un bloqueo por circuito deja la pregunta pendiente; el nombre suelto no es una pregunta', () => {
  const real = 'que tipos de recetarios son validos para MPN?';
  const s = buildNextState({ prev: null, rawQuestion: real, json: blockJson(real), now: NOW });
  assert.equal(s.pending.kind, 'NEEDS_CHANNEL');
  assert.equal(pendingRealQuestion(s), real);
  const bare = buildNextState({ prev: null, rawQuestion: 'Higea Salud', json: blockJson('Higea Salud'), now: NOW });
  assert.equal(bare.pending.kind, 'NEEDS_CHANNEL');
  assert.equal(pendingRealQuestion(bare), null);
});

test('con una respuesta de canal pendiente, el mensaje no se trata como repregunta', () => {
  const real = 'que tipos de recetarios son validos para MPN?';
  const s = buildNextState({ prev: null, rawQuestion: real, json: blockJson(real), now: NOW });
  assert.equal(isFollowUpMessage('y eso?', s, { socialWorkId: 5, now: NOW + 1000 }), false);
});

test('las respuestas con error no modifican el estado', () => {
  assert.equal(buildNextState({ prev: null, rawQuestion: 'x', json: { ok: false, error: 'boom' } }), null);
  assert.equal(buildNextState({ prev: null, rawQuestion: 'x', json: null }), null);
});

// --- Mensaje que solo nombra la obra social ---------------------------------
test('isBareSocialWorkMention: casos del piloto', () => {
  assert.equal(isBareSocialWorkMention('Higea Salud', 'HIGEA SALUD'), true);
  assert.equal(isBareSocialWorkMention('ART LA SEGUNDA', 'LA SEGUNDA ART / LA SEGUNDA PERSONAS'), true);
  assert.equal(isBareSocialWorkMention('La consulta es por Ospelsym', 'OSPELSYM'), true);
  assert.equal(isBareSocialWorkMention('Obra Social Ospelsym.', 'OSPELSYM'), true);
  assert.equal(isBareSocialWorkMention('Osde', 'OSDE'), true);
  assert.equal(isBareSocialWorkMention('¿OSEP requiere membrete?', 'OSEP'), false);
  assert.equal(isBareSocialWorkMention('osde', 'OSDEPYM'), false); // OSDE no es OSDEPYM
  assert.equal(isBareSocialWorkMention('', 'OSDE'), false);
  assert.equal(isBareSocialWorkMention('GDPsotf, necesito ayuda con la obra social Ospelsym', 'OSPELSYM'), true);
  assert.equal(isBareSocialWorkMention('Hola, tengo una consulta sobre OSDE', 'OSDE'), true);
  assert.equal(isBareSocialWorkMention('Qué es OSDE', 'OSDE'), false);
  assert.equal(isBareSocialWorkMention('Hola necesito ayuda', 'OSDE'), false);
  assert.match(buildBareMentionAnswer('HIGEA SALUD'), /^¿Qué necesitás saber sobre HIGEA SALUD\?/);
});

// --- Canal de la sucursal (sin preguntarle al usuario) -----------------------
function fakeSupabase({ branches = {}, channels = [], failBranches = false } = {}) {
  return {
    from(table) {
      const query = { filters: {} };
      const chain = {
        select() { return chain; },
        eq(column, value) { query.filters[column] = value; return chain; },
        maybeSingle() {
          if (table !== 'branches' || failBranches) return Promise.resolve({ data: null, error: failBranches ? { message: 'x' } : null });
          return Promise.resolve({ data: branches[query.filters.id] ?? null, error: null });
        },
        then(resolve) { resolve(table === 'billing_channels' ? { data: channels, error: null } : { data: null, error: null }); },
      };
      return chain;
    },
  };
}
const CHANNELS = [{ id: 1, code: 'CAMARA', name: 'Cámara' }, { id: 2, code: 'COLEGIO', name: 'Colegio' }];

test('resolveBranchBillingChannelId: DP1 → Cámara, Libertad → Colegio, desconocida → null', async () => {
  const db = fakeSupabase({ channels: CHANNELS, branches: {
    10: { id: 10, name: 'DP1', code: 'DP1', branch_type: 'CAMARA' },
    11: { id: 11, name: 'Libertad', code: 'LIBERTAD', branch_type: 'COLEGIO' },
    12: { id: 12, name: 'Sucursal X', code: 'XXX', branch_type: null },
    13: { id: 13, name: 'DP1', code: 'DP1', branch_type: 'COLEGIO' }, // conflicto de datos
  } });
  assert.equal(await resolveBranchBillingChannelId(db, 10), 1);
  assert.equal(await resolveBranchBillingChannelId(db, 11), 2);
  assert.equal(await resolveBranchBillingChannelId(db, 12), null);
  assert.equal(await resolveBranchBillingChannelId(db, 13), null);
  assert.equal(await resolveBranchBillingChannelId(db, null), null);
});

test('resolveBranchBillingChannelId: se puede desactivar y tolera errores', async () => {
  const db = fakeSupabase({ channels: CHANNELS, branches: { 10: { id: 10, name: 'DP1', code: 'DP1', branch_type: 'CAMARA' } } });
  process.env.GDP_AUTO_BRANCH_CHANNEL = '0';
  try { assert.equal(await resolveBranchBillingChannelId(db, 10), null); } finally { delete process.env.GDP_AUTO_BRANCH_CHANNEL; }
  assert.equal(await resolveBranchBillingChannelId(fakeSupabase({ channels: CHANNELS, failBranches: true }), 10), null);
});

// --- Degradación segura si la migración todavía no se aplicó ------------------
test('load/save del estado nunca lanzan errores si falta la columna', async () => {
  const broken = { from() { return { select() { return this; }, update() { return this; }, eq() { return Promise.resolve({ error: { message: 'column does not exist' } }); }, maybeSingle() { return Promise.resolve({ data: null, error: { message: 'column does not exist' } }); } }; } };
  assert.equal(await loadConversationState(broken, 'abc'), null);
  assert.equal(await saveConversationState(broken, 'abc', { v: 1 }), false);
  const throwing = { from() { throw new Error('boom'); } };
  assert.equal(await loadConversationState(throwing, 'abc'), null);
  assert.equal(await saveConversationState(throwing, 'abc', { v: 1 }), false);
  assert.equal(await loadConversationState(broken, null), null);
});

// --- Integración en el motor (verificación estática) -------------------------
const route = readFileSync(new URL('../../app/api/assistant/query/route.js', import.meta.url), 'utf8');

test('route.js: el estado se persiste en un único punto y la repregunta no envenena la caché', () => {
  assert.match(route, /export async function POST\(request\)[\s\S]*?handleAssistantQuery\(request, \{ conversationState \}\)/);
  assert.match(route, /branchId && !followUp\.isFollowUp/);
  assert.match(route, /forceDetailed: followUp\.isFollowUp/);
  assert.match(route, /const detailed = forceDetailed \|\| wantsDetailedAnswer\(question\)/);
});

test('route.js: el modo corto conserva las restricciones críticas y la repregunta tiene instrucciones propias', () => {
  assert.match(route, /RESTRICCIONES CRÍTICAS/);
  assert.match(route, /REPREGUNTA SOBRE EL MISMO TEMA/);
  assert.match(route, /No respondas solo "No encuentro esa información"/);
});

test('buildFollowUpSearchQuestion acota el largo', () => {
  const long = 'x'.repeat(2000);
  const text = buildFollowUpSearchQuestion(long, { topic_question: long, last_question: long });
  assert.ok(text.length < 1100);
});
