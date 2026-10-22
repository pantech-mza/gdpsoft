// GDPSoft v3.13.94 — exportación de auditoría (SOLO LECTURA).
// Reúne las consultas/respuestas de un circuito (Cámara o Colegio) y TODA la información con la que el bot
// debía responder (normativas, Ficha, observaciones aprobadas, protocolos, FAQs, reglas, correcciones),
// enmascarando datos personales y credenciales. No escribe nada en la base.

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

export function circuitOf(branchType) {
  const t = fold(branchType);
  if (/CAMARA/.test(t)) return 'CAMARA';
  if (/COLEGIO/.test(t)) return 'COLEGIO';
  return null;
}

// ---------- Privacidad ----------
export function maskSensitive(value, { bareNumbers = false } = {}) {
  let t = String(value ?? '');
  t = t.replace(/\b(usuario|user|usr|clave|contrase[ñn]a|password|pass|token)\b(\s*(?:de\s+\w+\s*)?[:=]\s*)\S+/gi, '$1$2[CREDENCIAL]');
  t = t.replace(/\b(dni|d\.n\.i\.?|afiliad[oa]|socio|credencial|nro\.?\s*de\s*afiliad[oa]|n[°º]\s*de\s*afiliad[oa])\b(\s*(?:n[°º.]*)?\s*[:#]?\s*)\d[\d .\-/]{4,}\d/gi, '$1$2[DATO DEL PACIENTE]');
  if (bareNumbers) t = t.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\b/g, '[NUMERO]').replace(/\b\d{9,}\b/g, '[NUMERO]');
  return t;
}

// ---------- CSV ----------
export function csvCell(value) {
  const s = String(value ?? '').replace(/\r?\n/g, '\n');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows, columns) {
  return '﻿' + [columns.join(',')].concat(rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))).join('\r\n') + '\r\n';
}

export function safeFileName(value) {
  return String(value ?? 'sin-nombre').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'sin-nombre';
}

// ---------- Lectura paginada ----------
const PAGE = 1000;
export async function fetchAll(makeQuery, { cap = 50000 } = {}) {
  const out = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}
async function fetchIn(supabase, table, select, column, values, extra = (q) => q) {
  const out = [];
  const list = [...new Set(values.filter((v) => v !== null && v !== undefined))];
  for (let i = 0; i < list.length; i += 150) {
    const chunk = list.slice(i, i + 150);
    out.push(...await fetchAll(() => extra(supabase.from(table).select(select).in(column, chunk))));
  }
  return out;
}

// ---------- Construcción de filas ----------
export function buildQueryRows({ queries, reviews, branches, works }) {
  const reviewByQuery = new Map();
  for (const r of reviews) {
    const key = String(r.query_id);
    if (!reviewByQuery.has(key)) reviewByQuery.set(key, []);
    reviewByQuery.get(key).push(r);
  }
  const branchMap = new Map(branches.map((b) => [String(b.id), b]));
  const workMap = new Map(works.map((w) => [String(w.id), w]));
  return queries.map((q) => {
    const rev = (reviewByQuery.get(String(q.id)) || []).sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0];
    const branch = branchMap.get(String(q.branch_id));
    return {
      id: q.id,
      fecha: q.created_at,
      sucursal: branch?.name || '',
      circuito: circuitOf(branch?.branch_type) || '',
      obra_social: workMap.get(String(q.social_work_id))?.name || 'No identificada',
      obra_social_id: q.social_work_id ?? '',
      tipo_trafico: q.traffic_type || '',
      pregunta: maskSensitive(q.question, { bareNumbers: true }),
      respuesta_bot: maskSensitive(q.answer, { bareNumbers: true }),
      ruta: q.route || '',
      fuente: q.source || '',
      encontro_info: q.found === null || q.found === undefined ? '' : (q.found ? 'SI' : 'NO'),
      conversacion: q.conversation_id || '',
      rastro: Array.isArray(q.trace) ? maskSensitive(JSON.stringify(q.trace)) : '',
      veredicto_admin: rev?.verdict || '',
      correccion_admin: maskSensitive(rev?.suggested_answer || ''),
      alcance_correccion: rev?.applies_to || '',
      comentario_admin: maskSensitive(rev?.comment || ''),
    };
  });
}
export const QUERY_COLUMNS = ['id', 'fecha', 'sucursal', 'circuito', 'obra_social', 'obra_social_id', 'tipo_trafico', 'pregunta', 'respuesta_bot',
  'ruta', 'fuente', 'encontro_info', 'conversacion', 'rastro', 'veredicto_admin', 'correccion_admin', 'alcance_correccion', 'comentario_admin'];

const SKIP_KEYS = new Set(['created_by', 'updated_by', 'approved_by', 'legacy_id']);
function renderRecord(record) {
  return Object.entries(record)
    .filter(([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== '' && v !== undefined && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `- **${k}:** ${typeof v === 'object' ? JSON.stringify(v) : maskSensitive(String(v))}`)
    .join('\n');
}

export function renderKnowledge({ work, circuit, circuitProfiles, notes, procedures, faqs, rules, normatives, corrections }) {
  const L = [];
  L.push(`# ${work?.name || 'Obra social'} (ID ${work?.id ?? '?'})`, '', `Circuito auditado: **${circuit === 'TODOS' ? 'CÁMARA y COLEGIO (ver ajustes por circuito)' : circuit}**`, '');
  L.push('## Ficha (datos base de la obra social)', '', renderRecord(work || {}) || '_sin datos_', '');
  L.push('## Ficha: ajustes por circuito (Cámara / Colegio)', '');
  if (circuitProfiles.length) circuitProfiles.forEach((p) => L.push(`### Circuito ${p.circuit_group}`, renderRecord(p), ''));
  else L.push('_sin ajustes por circuito_', '');
  L.push('## Observaciones aprobadas', '');
  if (notes.length) notes.forEach((n) => L.push(`### Observación #${n.id}`, maskSensitive(n.body), ''));
  else L.push('_sin observaciones aprobadas_', '');
  L.push('## Protocolos internos', '');
  if (procedures.length) procedures.forEach((p) => L.push(`### ${p.code || ''} ${p.title || ''} (ID ${p.id}${p.billing_channel_id ? `, canal ${p.billing_channel_id}` : ''})`, `**Pregunta:** ${p.question || ''}`, '', maskSensitive(p.answer), ''));
  else L.push('_sin protocolos_', '');
  L.push('## Preguntas frecuentes aprobadas', '');
  if (faqs.length) faqs.forEach((f) => L.push(`### FAQ #${f.id} — ${f.approved_at ? 'APROBADA (la usa el bot)' : 'PENDIENTE (aún no la usa el bot)'}`, renderRecord(f), ''));
  else L.push('_sin FAQs_', '');
  L.push('## Reglas de operación', '');
  if (rules.length) rules.forEach((r) => L.push(renderRecord(r), ''));
  else L.push('_sin reglas_', '');
  L.push('## Correcciones del administrador (prevalecen sobre lo demás)', '');
  if (corrections.length) corrections.forEach((c) => L.push(`### Corrección sobre consulta #${c.query_id} — alcance: ${c.applies_to || 'sin definir (según circuito de origen)'}`, `**Veredicto:** ${c.verdict}`, `**Pregunta original:** ${c.question || ''}`, '', maskSensitive(c.suggested_answer), ''));
  else L.push('_sin correcciones_', '');
  L.push('## Normativas vigentes', '');
  if (normatives.length) normatives.forEach((n) => {
    L.push(`### ${n.title} (ID ${n.id})`, `- Archivo: ${n.filename || ''}`, `- Canal de facturación: ${n.channel || 'sin canal'}`, `- Rol del documento: ${n.role || ''}`,
      `- Vigencia: ${n.effective_from || '—'} → ${n.effective_to || '—'}`, `- Extracción: ${n.extraction}`, '', maskSensitive(n.text || '_No se pudo extraer texto._'), '');
  });
  else L.push('_sin normativas_', '');
  return L.join('\n');
}

// ---------- Orquestación ----------
export async function collectAudit({ supabase, circuit, since, includeAllWorks = false, extractNormativeText, log = () => {} }) {
  const errors = [];
  const safe = async (label, fn, fallback) => {
    try { return await fn(); } catch (e) { errors.push(`${label}: ${e.message}`); log(`  ⚠ ${label}: ${e.message}`); return fallback; }
  };

  const allBranches = await fetchAll(() => supabase.from('branches').select('*'));
  // circuit = COLEGIO | CAMARA | TODOS (todas las sucursales y también consultas sin sucursal, p. ej. pruebas del admin).
  const all = circuit === 'TODOS';
  const branches = all ? allBranches : allBranches.filter((b) => circuitOf(b.branch_type) === circuit);
  if (!branches.length) throw new Error(`No hay sucursales del circuito ${circuit} (campo branches.branch_type)`);
  log(`Sucursales ${all ? 'de todos los circuitos' : circuit}: ${branches.length}`);

  const queries = await fetchAll(() => {
    let q = supabase.from('assistant_query_log').select('*');
    if (!all) q = q.in('branch_id', branches.map((b) => b.id));
    return q.gte('created_at', since).order('created_at', { ascending: true }).order('id', { ascending: true });
  });
  log(`Consultas desde ${since}: ${queries.length}`);

  const reviews = await safe('branch_response_reviews', () => fetchIn(supabase, 'branch_response_reviews', '*', 'query_id', queries.map((q) => q.id), (q) => q), []);
  const workIds = includeAllWorks ? null : [...new Set(queries.map((q) => q.social_work_id).filter(Boolean))];
  const works = workIds
    ? await fetchIn(supabase, 'social_works', '*', 'id', workIds)
    : await fetchAll(() => supabase.from('social_works').select('*'));
  log(`Obras sociales a exportar: ${works.length}`);

  const queryRows = buildQueryRows({ queries, reviews, branches, works });
  const queryById = new Map(queries.map((q) => [String(q.id), q]));

  // Correcciones del admin de TODO el circuito (aunque sean de consultas anteriores al corte).
  const allCorrections = await safe('correcciones', async () => {
    const reviewsAll = await fetchAll(() => supabase.from('branch_response_reviews').select('*').in('verdict', ['INCORRECT', 'PARTIAL']));
    const withText = reviewsAll.filter((r) => String(r.suggested_answer || '').trim());
    const missing = withText.map((r) => r.query_id).filter((id) => !queryById.has(String(id)));
    const extraQ = await fetchIn(supabase, 'assistant_query_log', 'id,question,social_work_id,branch_id', 'id', missing);
    extraQ.forEach((q) => queryById.set(String(q.id), q));
    return withText.map((r) => ({ ...r, question: maskSensitive(queryById.get(String(r.query_id))?.question || '', { bareNumbers: true }), social_work_id: queryById.get(String(r.query_id))?.social_work_id }));
  }, []);

  const general = await safe('protocolos generales', () => fetchAll(() => supabase.from('internal_procedures').select('*').is('social_work_id', null).eq('active', true)), []);
  const channels = await safe('billing_channels', () => fetchAll(() => supabase.from('billing_channels').select('*')), []);
  const channelMap = new Map(channels.map((c) => [String(c.id), c.name || c.code]));

  const knowledge = [];
  for (const work of works) {
    log(`· ${work.name}`);
    const byWork = (table, extra = (q) => q) => safe(`${table} (${work.name})`, () => fetchAll(() => extra(supabase.from(table).select('*').eq('social_work_id', work.id))), []);
    const [circuitProfiles, notes, procedures, faqs, rules, links] = await Promise.all([
      byWork('social_work_circuit_profiles'),
      byWork('social_work_notes', (q) => q.eq('kind', 'GENERAL').eq('review_status', 'APPROVED')), // nunca ACCESS (credenciales)
      byWork('internal_procedures', (q) => q.eq('active', true)),
      byWork('social_work_faqs'),
      byWork('social_work_operation_rules'),
      byWork('normative_social_works'),
    ]);
    const normatives = [];
    const normIds = [...new Set(links.map((l) => l.normative_id))];
    const normRows = normIds.length ? await safe(`normatives (${work.name})`, () => fetchIn(supabase, 'normatives', '*', 'id', normIds), []) : [];
    for (const n of normRows.filter((r) => r.is_current !== false)) {
      const link = links.find((l) => String(l.normative_id) === String(n.id));
      let text = '', extraction = 'OK';
      try { ({ text, extraction } = await extractNormativeText(n)); }
      catch (e) { extraction = `ERROR: ${e.message}`; errors.push(`normativa ${n.id} (${n.title}): ${e.message}`); }
      normatives.push({ id: n.id, title: n.title, filename: n.original_filename, channel: channelMap.get(String(link?.billing_channel_id)) || '',
        role: link?.document_role || n.document_kind || '', effective_from: n.effective_from, effective_to: n.effective_to, extraction, text });
    }
    const corrections = allCorrections.filter((c) => String(c.social_work_id) === String(work.id));
    knowledge.push({ work, markdown: renderKnowledge({ work, circuit, circuitProfiles, notes, procedures, faqs, rules, normatives, corrections }),
      stats: { normativas: normatives.length, sin_texto: normatives.filter((n) => !String(n.text || '').trim()).length, observaciones: notes.length, protocolos: procedures.length, faqs: faqs.length, correcciones: corrections.length,
        consultas: queryRows.filter((r) => String(r.obra_social_id) === String(work.id)).length } });
  }
  return { queryRows, knowledge, general, errors, branches };
}
