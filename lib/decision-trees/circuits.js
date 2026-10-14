import { supabaseAdmin } from "../supabase/admin";

// El circuito es propiedad de normative_social_works, NO del nombre de la obra social.
// No suponer Cámara o Colegio por título/archivo. No inventar un circuito para árboles manuales.
export async function attachCircuitContext(items) {
  if (!items?.length) return [];
  const ids = [...new Set(items.map(item => Number(item.normative_id)).filter(n => Number.isSafeInteger(n) && n > 0))];
  const works = [...new Set(items.map(item => Number(item.social_work_id)).filter(n => Number.isSafeInteger(n) && n > 0))];
  const { data: relations, error } = await supabaseAdmin.from("normative_social_works")
    .select("normative_id,social_work_id,billing_channel_id")
    .in("social_work_id", works);
  if (error) throw new Error(`No se pudieron resolver los circuitos: ${error.message}`);
  const channelIds = [...new Set((relations || []).map(r => r.billing_channel_id == null ? null : Number(r.billing_channel_id)).filter(n => Number.isSafeInteger(n) && n > 0))];
  let channels = [];
  if (channelIds.length) {
    const result = await supabaseAdmin.from("billing_channels")
      .select("id,name,code").in("id", channelIds);
    if (result.error) throw new Error(`No se pudo leer el catálogo de circuitos: ${result.error.message}`);
    channels = result.data || [];
  }
  const byChannel = new Map(channels.map(ch => [Number(ch.id), ch]));
  const byRelation = new Map();
  const byWork = new Map();
  for (const relation of relations || []) {
    const key = `${relation.social_work_id}:${relation.normative_id}`;
    if (!byRelation.has(key)) byRelation.set(key, new Set());
    if (relation.billing_channel_id != null) {
      const workKey = String(relation.social_work_id);
      if (!byWork.has(workKey)) byWork.set(workKey, new Set());
      byWork.get(workKey).add(Number(relation.billing_channel_id));
    }
    byRelation.get(key).add(relation.billing_channel_id == null ? null : Number(relation.billing_channel_id));
  }
  return items.map(item => {
    const key = `${item.social_work_id}:${item.normative_id}`;
    const keys = [...(byRelation.get(key) || new Set())];
    const ambiguous = keys.length > 1;
    const channelId = !ambiguous && keys.length === 1 ? keys[0] : null;
    const channel = channelId == null ? null : byChannel.get(channelId);
    const workCircuits = [...(byWork.get(String(item.social_work_id)) || new Set())]
      .map(id => byChannel.get(id)).filter(Boolean).map(ch => ({ id: ch.id, name: ch.name, code: ch.code }));
    return {
      ...item,
      billing_channel_id: channel?.id ?? null,
      billing_channel_name: channel?.name ?? null,
      billing_channel_code: channel?.code ?? null,
      circuit_ambiguous: ambiguous,
      social_work_circuits: workCircuits,
      social_work_has_multiple_channels: workCircuits.length > 1,
      circuit_missing: Boolean(item.normative_id) && (keys.length === 0 || (channelId == null && !ambiguous)),
    };
  });
}

// Bloqueo de publicación cuando la obra social tiene varios circuitos activos.
// Un árbol específico necesita una única normativa de origen y un circuito inequívoco.
export async function checkPublicationCircuit(socialWorkId, normativeId) {
  const { data: rels, error } = await supabaseAdmin.from("normative_social_works")
    .select("normative_id,billing_channel_id")
    .eq("social_work_id", socialWorkId);
  if (error) return `No se pudieron verificar los circuitos: ${error.message}`;
  const distinct = [...new Set((rels || []).map(r => r.billing_channel_id).filter(v => v != null).map(Number))];
  if (!normativeId) {
    return distinct.length > 1 ? "Esta obra social tiene más de un circuito. Asociá el árbol a una normativa del circuito correspondiente antes de publicarlo." : null;
  }
  const selected = [...new Set((rels || []).filter(r => Number(r.normative_id) === Number(normativeId)).map(r => r.billing_channel_id))];
  if (!selected.length) return "La normativa no está asociada a la obra social.";
  if (selected.length !== 1) return "La normativa está asociada a varios circuitos. Separá la asociación antes de publicar.";
  if (distinct.length > 1 && selected[0] == null) return "El circuito de esta normativa no está identificado y la obra social tiene varios circuitos.";
  return null;
}
