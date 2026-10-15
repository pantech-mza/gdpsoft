// Fuente de verdad: normative_social_works vincula documentos GENERALES y específicos
// al id INTERNO social_works.id (nunca al id_soft del sistema anterior).
// No se crean nuevas OOSS ni se usa el título de la normativa como ID de obra social.
export function scopeLinkedNormatives(rows, billingChannelId = null, limit = 32) {
  if (!Array.isArray(rows)) return {ok:false, reason:'No pude comprobar las normativas vinculadas.'};
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

export async function getLinkedCurrentNormativeScope(supabaseAdmin, socialWorkId, billingChannelId = null) {
  if (!Number.isInteger(Number(socialWorkId)) || Number(socialWorkId) <= 0) return {ok:false,reason:'Obra social sin identificador interno válido.'};
  const {data,error} = await supabaseAdmin.from('normative_social_works')
    .select('normative_id,billing_channel_id,normatives!inner(is_current)')
    .eq('social_work_id', Number(socialWorkId))
    .eq('normatives.is_current', true);
  if (error) return {ok:false,reason:'No pude verificar la asociación de normativas vigentes.'};
  return scopeLinkedNormatives(data || [], billingChannelId);
}
