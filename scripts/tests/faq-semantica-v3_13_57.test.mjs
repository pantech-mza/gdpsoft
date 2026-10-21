import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canServeSemanticFaq, cosineSimilarity, findBestMatch, getSuggestThreshold, isFaqEligible,
} from '../../lib/faqs/semantic.mjs';
import { applyFaqSignal, findSemanticApprovedFaq } from '../../lib/server/faq-detection.mjs';

// ---- Supabase falso mínimo (filtros eq/is/not/gte, insert/update/delete, count) ----
function fakeDb(seed = {}) {
  const tables = { faq_clusters: [], faq_cluster_hits: [], social_work_faqs: [], admin_notifications: [], social_works: [{ id: 1, name: 'OSDE' }], ...seed };
  const ids = {};
  const nextId = (t) => (ids[t] = (ids[t] || 100) + 1);
  function builder(table) {
    const state = { filters: [], op: 'select', payload: null, head: false, single: false };
    const run = () => {
      const rows = tables[table];
      const match = (row) => state.filters.every((f) => f(row));
      if (state.op === 'insert') {
        const row = { id: nextId(table), ...state.payload };
        if (table === 'faq_cluster_hits' && row.query_log_id != null &&
          rows.some((r) => r.query_log_id === row.query_log_id)) return { data: null, error: { code: '23505', message: 'dup' } };
        rows.push(row); return { data: state.single || state.returning ? row : null, error: null };
      }
      if (state.op === 'update') { const hit = rows.filter(match); hit.forEach((r) => Object.assign(r, state.payload)); return { data: hit.map((r) => ({ id: r.id })), error: null }; }
      if (state.op === 'delete') { tables[table] = rows.filter((r) => !match(r)); return { data: null, error: null }; }
      const hit = rows.filter(match);
      if (state.head) return { count: hit.length, error: null };
      if (state.single) return { data: hit[0] ?? null, error: null };
      return { data: hit.slice(0, state.limit ?? 1e9), error: null };
    };
    const api = {
      select(_c, opts) { if (state.op === 'select') state.head = !!opts?.head; else state.returning = true; return api; },
      insert(p) { state.op = 'insert'; state.payload = p; return api; },
      update(p) { state.op = 'update'; state.payload = p; return api; },
      delete() { state.op = 'delete'; return api; },
      eq(c, v) { state.filters.push((r) => r[c] === v); return api; },
      is(c, v) { state.filters.push((r) => (r[c] ?? null) === v); return api; },
      not(c, _o, v) { state.filters.push((r) => (r[c] ?? null) !== v); return api; },
      gte(c, v) { state.filters.push((r) => r[c] >= v); return api; },
      limit(n) { state.limit = n; return api; },
      single() { state.single = true; return api; },
      maybeSingle() { state.single = true; return api; },
      then(res, rej) { return Promise.resolve(run()).then(res, rej); },
    };
    return api;
  }
  return { tables, from: builder };
}

const V_A = [1, 0, 0.1];
const V_A2 = [0.98, 0.05, 0.1];
const V_B = [0, 1, 0];
const sig = (n, extra = {}) => ({ socialWorkId: 1, branchId: n % 3, deviceId: n, question: `¿Cuántos días vale la receta ${n}?`, answer: 'La receta vale 30 días corridos.', route: 'FILE_SEARCH', found: true, trafficType: 'PILOT', queryLogId: n, ...extra });

test('similitud y selección del grupo más parecido', () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([], []), 0);
  const best = findBestMatch(V_A, [{ id: 1, embedding: V_B }, { id: 2, embedding: V_A2 }], 0.84);
  assert.equal(best.candidate.id, 2);
  assert.equal(findBestMatch(V_A, [{ id: 1, embedding: V_B }], 0.84), null);
});

test('elegibilidad: solo piloto, respondida, no cortesía ni aclaraciones', () => {
  assert.equal(isFaqEligible(sig(1)), true);
  assert.equal(isFaqEligible(sig(1, { trafficType: 'ADMIN' })), false);
  assert.equal(isFaqEligible(sig(1, { found: false })), false);
  assert.equal(isFaqEligible(sig(1, { route: 'COURTESY' })), false);
  assert.equal(isFaqEligible(sig(1, { route: 'CLARIFICATION_NEEDED' })), false);
  assert.equal(isFaqEligible(sig(1, { question: 'gracias' })), false);
  assert.equal(canServeSemanticFaq('receta?'), false);
  assert.equal(canServeSemanticFaq('cuantos dias vale la receta'), true);
  assert.equal(getSuggestThreshold({}), 10);
  assert.equal(getSuggestThreshold({ GDP_FAQ_SUGGEST_THRESHOLD: '5' }), 5);
});

test('10 consultas parecidas (distintas sucursales) proponen UNA FAQ y notifican', async () => {
  const db = fakeDb();
  let last;
  for (let n = 1; n <= 12; n += 1) {
    last = await applyFaqSignal({ db, signal: sig(n), embedding: n % 2 ? V_A : V_A2, threshold: 10 });
    if (n < 10) assert.notEqual(last.status, 'SUGGESTED', `n=${n}`);
  }
  assert.equal(db.tables.faq_clusters.length, 1);
  assert.equal(db.tables.faq_cluster_hits.length, 12);
  assert.equal(db.tables.social_work_faqs.length, 1);
  const faq = db.tables.social_work_faqs[0];
  assert.equal(faq.status, 'SUGGESTED');
  assert.equal(faq.branch_id, null);
  assert.equal(db.tables.admin_notifications.length, 1);
  assert.match(db.tables.admin_notifications[0].title, /OSDE/);
  assert.match(db.tables.admin_notifications[0].body, /3 sucursales/);
  assert.equal(faq.detected_count, 12);
});

test('preguntas distintas no se mezclan y no hay duplicados por la misma consulta', async () => {
  const db = fakeDb();
  for (let n = 1; n <= 5; n += 1) await applyFaqSignal({ db, signal: sig(n), embedding: V_A, threshold: 10 });
  await applyFaqSignal({ db, signal: sig(6, { question: 'otra cosa distinta aqui' }), embedding: V_B, threshold: 10 });
  assert.equal(db.tables.faq_clusters.length, 2);
  const dup = await applyFaqSignal({ db, signal: sig(1), embedding: V_A, threshold: 10 });
  assert.equal(dup.status, 'DUPLICATE');
  assert.equal(db.tables.faq_cluster_hits.length, 6);
  assert.equal(db.tables.admin_notifications.length, 0);
});

test('FAQ rechazada o archivada no se vuelve a proponer', async () => {
  const db = fakeDb();
  for (let n = 1; n <= 10; n += 1) await applyFaqSignal({ db, signal: sig(n), embedding: V_A, threshold: 10 });
  db.tables.social_work_faqs[0].status = 'REJECTED';
  for (let n = 11; n <= 25; n += 1) await applyFaqSignal({ db, signal: sig(n), embedding: V_A, threshold: 10 });
  assert.equal(db.tables.social_work_faqs.length, 1);
  assert.equal(db.tables.social_work_faqs[0].status, 'REJECTED');
  assert.equal(db.tables.admin_notifications.length, 1);
});

test('FAQ aprobada responde preguntas parecidas; pendientes no', async () => {
  const db = fakeDb();
  for (let n = 1; n <= 10; n += 1) await applyFaqSignal({ db, signal: sig(n), embedding: V_A, threshold: 10 });
  const embed = async () => [V_A2];
  const args = { db, embed, socialWorkId: 1, branchId: 2, question: 'cuantos dias es valida la receta' };
  assert.equal(await findSemanticApprovedFaq(args), null); // todavía SUGGESTED
  Object.assign(db.tables.social_work_faqs[0], { status: 'APPROVED', active: true });
  const hit = await findSemanticApprovedFaq(args);
  assert.ok(hit && hit.answer.includes('30 días'));
  assert.equal(await findSemanticApprovedFaq({ ...args, socialWorkId: 2 }), null);
  assert.equal(await findSemanticApprovedFaq({ ...args, question: 'receta' }), null);
  const far = async () => [V_B];
  assert.equal(await findSemanticApprovedFaq({ ...args, embed: far }), null);
});

test('cableado: bot, API de notificaciones, campana y migración', () => {
  const route = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(route, /recordFaqSignal\(/);
  assert.match(route, /lookupSemanticFaq\(\{ branchId, socialWorkId, question \}\)/);
  assert.match(fs.readFileSync('components/admin/AdminHeader.jsx', 'utf8'), /<AdminNotifications \/>/);
  assert.match(fs.readFileSync('app/admin/faqs/page.jsx', 'utf8'), /Detectar FAQs del piloto/);
  assert.match(fs.readFileSync('app/api/admin/notifications/route.js', 'utf8'), /requireAdminActor/);
  assert.match(fs.readFileSync('app/api/faqs/detect/route.js', 'utf8'), /requireAdminActor/);
  const sql = fs.readFileSync('supabase/migrations/20261021_faq_semantic_detection.sql', 'utf8');
  for (const t of ['faq_clusters', 'faq_cluster_hits', 'admin_notifications']) assert.match(sql, new RegExp(`TABLE IF NOT EXISTS public.${t}`));
});

// v3.13.58 — sucursal con grupo conocido no debe recibir «¿Cámara o Colegio?»
import { resolveBranchChannelAmongLinked } from '../../lib/assistant/conversation-context.mjs';
function channelDb({ branch, links, channels }) {
  return {
    from(table) {
      const rows = table === 'branches' ? [branch] : table === 'normative_social_works' ? links : channels;
      const api = { select() { return api; }, eq() { return api; }, not() { return api; }, in() { return api; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
        then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej) };
      return api;
    },
  };
}
test('v3.13.58 DP1 (Cámara) elige el canal Cámara entre los vinculados aunque el catálogo tenga varios', async () => {
  const db = channelDb({
    branch: { id: 1, name: 'DP1', code: 'DP1', branch_type: 'CAMARA' },
    links: [{ billing_channel_id: 7 }, { billing_channel_id: 8 }, { billing_channel_id: 8 }],
    channels: [{ id: 7, code: 'CAM', name: 'Cámara' }, { id: 8, code: 'COL', name: 'Colegio' }],
  });
  assert.equal(await resolveBranchChannelAmongLinked(db, 1, 55), 7);
});
test('v3.13.58 sin grupo de sucursal o sin canales vinculados no adivina', async () => {
  const unknown = channelDb({ branch: { id: 9, name: 'Otra', code: 'X', branch_type: null }, links: [{ billing_channel_id: 7 }], channels: [{ id: 7, name: 'Cámara' }] });
  assert.equal(await resolveBranchChannelAmongLinked(unknown, 9, 55), null);
  const none = channelDb({ branch: { id: 1, name: 'DP1', code: 'DP1', branch_type: 'CAMARA' }, links: [], channels: [] });
  assert.equal(await resolveBranchChannelAmongLinked(none, 1, 55), null);
});
test('v3.13.58 la ruta usa el respaldo y la revisión muestra la sucursal', () => {
  assert.match(fs.readFileSync('app/api/assistant/query/route.js', 'utf8'), /resolveBranchChannelAmongLinked\(supabaseAdmin, Number\(branchId\), socialWorkId\)/);
  assert.match(fs.readFileSync('components/admin/AdminBranchValidation.jsx', 'utf8'), /selected\.branch_name/);
});

// v3.13.59 — el circuito de la sucursal rige siempre
import { buildBranchCircuitPrompt } from '../../lib/assistant/conversation-context.mjs';
test('v3.13.59 prompt de circuito: solo cuando la sucursal tiene grupo', () => {
  assert.equal(buildBranchCircuitPrompt(null), '');
  assert.match(buildBranchCircuitPrompt('CAMARA'), /CIRCUITO DE LA SUCURSAL QUE CONSULTA: Cámara/);
  assert.match(buildBranchCircuitPrompt('COLEGIO'), /no menciones requisitos de Cámara/);
  assert.match(buildBranchCircuitPrompt('CAMARA'), /No le preguntes/);
});
test('v3.13.59 la ruta aplica el circuito en normativa, protocolos y prompt', () => {
  const r = fs.readFileSync('app/api/assistant/query/route.js', 'utf8');
  assert.match(r, /const getBranchCircuit = async/);
  assert.match(r, /branchCircuit: buildBranchCircuitPrompt\(\(await getBranchCircuit\(\)\)\.group\)/);
  assert.equal((r.match(/billingChannelId: activeBillingChannelId \|\| \(await getBranchCircuit\(\)\)\.channelId/g) || []).length, 4);
});
test('v3.13.59 FAQ: Cámara y Colegio no comparten grupo ni respuesta', async () => {
  const db = fakeDb();
  for (let n = 1; n <= 10; n += 1) await applyFaqSignal({ db, signal: sig(n, { branchGroup: 'CAMARA' }), embedding: V_A, threshold: 10 });
  for (let n = 11; n <= 15; n += 1) await applyFaqSignal({ db, signal: sig(n, { branchGroup: 'COLEGIO' }), embedding: V_A, threshold: 10 });
  assert.equal(db.tables.faq_clusters.length, 2);
  assert.equal(db.tables.social_work_faqs.length, 1);
  assert.match(db.tables.admin_notifications[0].title, /Cámara/);
  Object.assign(db.tables.social_work_faqs[0], { status: 'APPROVED', active: true });
  const embed = async () => [V_A];
  const base = { db, embed, socialWorkId: 1, branchId: 2, question: 'cuantos dias vale la receta' };
  assert.ok(await findSemanticApprovedFaq({ ...base, branchGroup: 'CAMARA' }));
  assert.equal(await findSemanticApprovedFaq({ ...base, branchGroup: 'COLEGIO' }), null);
  assert.equal(await findSemanticApprovedFaq({ ...base, branchGroup: null }), null);
});
