// GDPSoft v3.13.98 — Importa a Supabase las propuestas de la auditoría (carpeta con archivos .jsonl).
// Escribe SOLO en audit_proposals. No modifica consultas, correcciones ni respuestas del bot.
//
// Uso:  node scripts/importar-auditoria.mjs --carpeta=C:\ruta\resultados --lote=2026-10-22
import fs from 'node:fs';
import path from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { normalizeProposal, computeAging } from '../lib/audit/proposals.mjs';
import { maskSensitive } from '../lib/audit/export-audit.mjs';

nextEnv.loadEnvConfig(process.cwd());
const arg = (n, d = null) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const dir = arg('carpeta'); const batch = arg('lote', new Date().toISOString().slice(0, 10));
if (!dir || !fs.existsSync(dir)) { console.error('Indicá --carpeta=<carpeta con los .jsonl de resultados>'); process.exit(1); }
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('Faltan SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local'); process.exit(1); }
const supabase = createClient(url, key, { auth: { persistSession: false } });

function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.jsonl') ? [path.join(d, e.name)] : []); }
const props = new Map(); let bad = 0;
for (const f of walk(dir)) for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  try { const p = normalizeProposal(JSON.parse(line), batch); if (p) props.set(p.query_id, p); else bad++; } catch { bad++; }
}
console.log(`Propuestas leídas: ${props.size} · líneas inválidas: ${bad}`);
const ids = [...props.keys()];

const logs = new Map();
for (let i = 0; i < ids.length; i += 200) {
  const { data, error } = await supabase.from('assistant_query_log')
    .select('id,question,answer,route,created_at,social_work_id,branch_id').in('id', ids.slice(i, i + 200));
  if (error) { console.error('No se pudieron leer las consultas:', error.message); process.exit(1); }
  for (const r of data) logs.set(r.id, r);
}
const [{ data: works }, { data: branches }, { data: reviews }] = await Promise.all([
  supabase.from('social_works').select('id,name'),
  supabase.from('branches').select('id,name'),
  supabase.from('branch_response_reviews').select('query_id,verdict,suggested_answer,comment,updated_at'),
]);
const workName = new Map((works || []).map((w) => [w.id, w.name]));
const branchName = new Map((branches || []).map((b) => [b.id, b.name]));
const logOfReview = new Map();
const needLogs = (reviews || []).map((r) => r.query_id).filter((id) => !logs.has(id));
for (let i = 0; i < needLogs.length; i += 200) {
  const { data } = await supabase.from('assistant_query_log').select('id,social_work_id').in('id', needLogs.slice(i, i + 200));
  for (const r of data || []) logOfReview.set(r.id, r.social_work_id);
}
const correctionsBySw = new Map();
for (const r of reviews || []) {
  if (r.verdict === 'CORRECT' || !String(r.suggested_answer || '').trim()) continue;
  const sw = (logs.get(r.query_id) || {}).social_work_id ?? logOfReview.get(r.query_id);
  if (!sw) continue;
  if (!correctionsBySw.has(sw)) correctionsBySw.set(sw, []);
  correctionsBySw.get(sw).push({ query_id: r.query_id, updated_at: r.updated_at });
}
const adminByQuery = new Map((reviews || []).map((r) => [r.query_id, r.verdict]));

const rows = []; let missing = 0;
for (const p of props.values()) {
  const q = logs.get(p.query_id);
  if (!q) { missing++; continue; }
  const sw = q.social_work_id ?? p._social_work_hint;
  const { _social_work_hint, ...base } = p;
  const row = { ...base, social_work_id: sw || null, social_work_name: workName.get(sw) || null,
    branch_name: branchName.get(q.branch_id) || null,
    question: maskSensitive(q.question || '', { bareNumbers: true }).slice(0, 2000),
    bot_answer: maskSensitive(q.answer || '', { bareNumbers: true }).slice(0, 6000),
    route: q.route || null, query_created_at: q.created_at, admin_verdict: adminByQuery.get(p.query_id) || null };
  const ag = computeAging(row, correctionsBySw.get(sw) || []);
  rows.push({ ...row, aging: ag.aging, aging_detail: ag.detail });
}
console.log(`A guardar: ${rows.length} · consultas inexistentes (omitidas): ${missing}`);
for (let i = 0; i < rows.length; i += 100) {
  const { error } = await supabase.from('audit_proposals').upsert(rows.slice(i, i + 100), { onConflict: 'batch,query_id' });
  if (error) { console.error('Error guardando:', error.message); process.exit(1); }
}
console.log(`Listo. Lote "${batch}" importado. Entrá a Admin → Auditoría de respuestas.`);
