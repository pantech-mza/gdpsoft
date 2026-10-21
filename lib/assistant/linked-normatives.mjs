// Fuente de verdad: normative_social_works vincula documentos GENERALES y específicos
// al id INTERNO social_works.id (nunca al id_soft del sistema anterior).
// No se crean nuevas OOSS ni se usa el título de la normativa como ID de obra social.
import { filterRowsByVariant } from './plan-variant.mjs';

export function scopeLinkedNormatives(rows, billingChannelId = null, limit = 32, variant = null) {
  if (!Array.isArray(rows)) return {ok:false, reason:'No pude comprobar las normativas vinculadas.'};
  // v3.13.78 — variantes de plan (OSEP / OSEP OYTE): no se mezclan.
  const byVariant = filterRowsByVariant(rows, variant);
  if (byVariant.missing) return {ok:false, variantMissing:true, reason: variant
    ? `No tengo normativa cargada para ${variant} de esta obra social.`
    : 'Esta obra social tiene normativa cargada solo para su plan especial (OYTE); no tengo normativa del plan general. Si tu consulta es por OSEP OYTE, escribí «OYTE» en la pregunta.'};
  if (byVariant.applied) { const r = scopeLinkedNormatives(byVariant.rows.map(({plan_variant, ...rest}) => rest), billingChannelId, limit, null); return r.ok ? {...r, variantApplied: variant || 'GENERAL'} : r; }
  const channels = [...new Set(rows.map(r => Number(r.billing_channel_id))
    .filter(n => Number.isInteger(n) && n > 0))];
  const channel = billingChannelId ? Number(billingChannelId) : null;
  if (channels.length > 1 && !channel) return {
    ok:false, ambiguous:true,
    reason:'Esta obra social tiene normativas de Cámara y Colegio. Necesito confirmar el circuito antes de responder, para no mezclar requisitos.',
  };
  const selected = rows.filter(r => r.billing_channel_id == null || !channel || Number(r.billing_channel_id) === channel);
  if (channel && channels.length && !selected.length) return {ok:false,reason:'No hay normativa vinculada al circuito correspondiente.'};
  const ids = [...new Set(selected.map(r => Number(r.normative_id)).filter(n => Number.isInteger(n) && n > 0))];
  if (!ids.length) return {ok:false,reason:'No encontré normativas vigentes asociadas a esta obra social.'};
  if (ids.length > limit) return {ok:false,reason:'Esta obra social tiene más normativas de las que puedo delimitar con seguridad. Requiere revisión administrativa.'};
  return {ok:true,normativeIds:ids,ambiguous:false};
}

// Consultas a subtemas requieren recuperar normativas generales y específicas,
// no separar «OMINT vacunas» como otra obra social.
export function isSpecificNormativeTopic(question) {
  return /\b(vacun\w*|antigripal\w*|insulin\w*|diabet\w*|tiras\s+reactivas|discapac\w*|cronico\w*|cr[oó]nico\w*|pmi|materno\s+infantil)\b/i.test(
    String(question || '').normalize('NFD').replace(/[\u0300-\u036f]/g,''),
  );
}

export async function getLinkedCurrentNormativeScope(supabaseAdmin, socialWorkId, billingChannelId = null, question = null, variant = null) {
  if (!Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return {ok:false,reason:'Obra social sin identificador interno válido.'};
  const query = (cols) => supabaseAdmin.from('normative_social_works')
    .select(cols)
    .eq('social_work_id', Number(socialWorkId))
    .eq('normatives.is_current', true);
  let {data,error} = await query('normative_id,billing_channel_id,plan_variant,normatives!inner(is_current,title)');
  // Si todavía no se corrió la migración de plan_variant, se consulta como antes.
  if (error) ({data,error} = await query('normative_id,billing_channel_id,normatives!inner(is_current,title)'));
  if (error) return {ok:false,reason:'No pude verificar la asociación de normativas vigentes.'};
  const scope = scopeLinkedNormatives(data || [], billingChannelId, 32, variant);
  return question ? scopeNormativeTopic(scope, data || [], question) : scope;
}

// Delimitación adicional dentro del mismo app_id. No crea OOSS y no cambia
// circuitos. Si no hay título suficiente, preserva todos los documentos
// vinculados: jamás afirma una separación que no pudo comprobar.
export function scopeNormativeTopic(scope, rows, question) {
  if (!scope?.ok || !question) return scope;
  const q = String(question).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  // Un pedido de requisitos GENERALES de receta no debe incorporar de forma
  // automática anexos sobre vacunas, diabetes, insulinas o cronicidad.
  if (!isSpecificNormativeTopic(question)) {
    if (!/\breceta(?:s|rio)?\b/.test(q) || !/\brequisit/.test(q)) return scope;
    const inScope = new Set(scope.normativeIds);
    const topicTitle = /vacun|antigripal|diabet|insulin|cronic|materno|infantil|\bpmi\b/;
    const generals = (rows || []).filter(row => inScope.has(Number(row.normative_id)) &&
      !topicTitle.test(String(row.normatives?.title || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g,'').toLowerCase()))
      .map(row => Number(row.normative_id));
    if (!generals.length) return scope; // si no sabemos discriminar, no inventamos exclusiones
    const allowed = new Set(generals);
    return {...scope, normativeIds: scope.normativeIds.filter(id => allowed.has(id)), allNormativeIds: scope.normativeIds};
  }
  let topic = null;
  if (/vacun|antigripal/.test(q)) topic = /vacun|antigripal/;
  else if (/diabet|insulin/.test(q)) topic = /diabet|insulin/;
  else if (/cronic/.test(q)) topic = /cronic|diabet|insulin/;
  else if (/materno|infantil|\bpmi\b/.test(q)) topic = /materno|infantil|\bpmi\b/;
  if (!topic) return scope;
  const allTopics = /vacun|antigripal|diabet|insulin|cronic|materno|infantil|\bpmi\b/;
  const inScope = new Set(scope.normativeIds);
  const matching = new Set();
  const shared = new Set();
  for (const row of rows || []) {
    const id = Number(row.normative_id);
    if (!inScope.has(id)) continue;
    const title = String(row.normatives?.title || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (!title || !allTopics.test(title)) shared.add(id);
    if (topic.test(title)) matching.add(id);
  }
  // Solamente filtrar cuando se identificó al menos un anexo pertinente.
  if (!matching.size) return scope;
  const normativeIds = scope.normativeIds.filter(id => shared.has(id) || matching.has(id));
  return {...scope, normativeIds, allNormativeIds: scope.normativeIds};
}
