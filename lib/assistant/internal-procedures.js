/**
 * GDPSoft: procedimientos internos aprobados (no equivalen a normativas de OOSS).
 * Si no existe aprobación/vigencia/ámbito comprobable, NO devolver excepciones.
 */
import { supabaseAdmin } from '../supabase/admin';

const normalize = (v = '') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const today = () => new Date().toISOString().slice(0, 10);
const activeOn = (r, date) => (!r.valid_from || r.valid_from <= date) && (!r.valid_to || r.valid_to >= date);
const isImed = (v) => ['imed'].includes(normalize(v).trim());

/** Deterministic intent detection: no diagnosis of a real outage. */
export function detectInternalProcedureIntent(text = '') {
  const q = normalize(text);
  const failed = /\b(caid[oa]|se cayo|cae|falla|fallando|no anda|no funciona|sin servicio|fuera de servicio|no puedo validar|no valida|no me valida|no permite validar|esta lento|problemas? (?:con|en|de))\b/.test(q);
  if (failed && /\b(imed|i med)\b/.test(q)) return 'IMED_FAILURE';
  if (failed && /\b(validador|validacion|validar|tys|sistema de validacion|receta|pagina|sitio|portal)\b/.test(q)) return 'VALIDATOR_FAILURE';
  if (/\b(osep|oyte)\b/.test(q) && /\b(stock|cooperativa|drogueria|insulina|sensor|tiras|alimentos)\b/.test(q)) return 'OSEP_STOCK';
  if (/\bpami\b/.test(q) && /\b(camoyte|nutricional|remito|opf|comprobante)\b/.test(q)) return 'PAMI_DOCS';
  if (/\b(drogueria externa|operador logistico|documentacion.*remito|remito.*ticket)\b/.test(q)) return 'EXTERNAL_PHARMACY';
  if (/\b(receta|tys|validacion)\b/.test(q) && /\b(rechaz|error|no valida|no me valida|no se valida)\b/.test(q)) return 'RECIPE_ERROR';
  if (/\b(cobertura|descuento|porcentaje)\b/.test(q) && /\b(no toma|no aplica|no coincide|no reconoce|no sale|no aparece|forzar)\b/.test(q)) return 'COVERAGE_ERROR';
  if (/\b(receta|autorizacion)\b/.test(q) && /\b(no coincide|diferencia|cantidad.*distinta|marca comercial|sustituir|sustitucion)\b/.test(q)) return 'AUTH_MISMATCH';
  if (/\b(receta|autorizacion|prescripcion)\b/.test(q) && /\b(vencida|vencimiento|vigencia|caduc|fecha)\b/.test(q)) return 'EXPIRY';
  if (/\b(receta|afiliado)\b/.test(q) && /\b(faltan datos|dato incorrecto|datos incompletos|datos incorrectos|numero equivocado|no figura)\b/.test(q)) return 'RECIPE_DATA';
  if (/\b(receta|membrete|fotocopia|foto)\b/.test(q) && /\b(fotocopia|foto|digital|electronica|membrete|qr|firma digital|imagen de receta)\b/.test(q)) return 'FORMAT';
  if (/\b(obra social|convenio)\b/.test(q) && /\b(no figura|no aparece|no existe|no esta|sin convenio)\b/.test(q)) return 'MISSING_SW';
  if (/\b(foto|imagen|fotografia)\b/.test(q) && /\b(bot|inteligencia artificial|ia|analizar|revisar|leer|autoriza)\b/.test(q)) return 'IMAGE_REVIEW';
  return null;
}

async function approved(intent) {
  const { data, error } = await supabaseAdmin.from('internal_procedures')
    .select('id,code,scope,social_work_id,billing_channel_id,title,question,answer,intent,source_document,source_pages,valid_from,valid_to')
    .eq('status', 'APPROVED').eq('active', true).eq('intent', intent).order('id').limit(30);
  if (error) { console.error('[internal-procedures] read:', error.message); return []; }
  return data || [];
}

function circuitAllowed(record, billingChannelId) {
  if (!record.billing_channel_id) return true;
  return billingChannelId != null && Number(record.billing_channel_id) === Number(billingChannelId);
}

async function verifiedImedCircuit(socialWorkId, billingChannelId) {
  if (!socialWorkId) return { linked: false, ambiguous: false };
  const { data, error } = await supabaseAdmin.from('social_work_validators')
    .select('validator_id,validators!inner(name,slug),effective_from,effective_to,billing_channel_id')
    .eq('social_work_id', socialWorkId).limit(100);
  if (error) { console.error('[internal-procedures] validator:', error.message); return { linked: false, ambiguous: true }; }
  const date = today();
  const current = (data || []).filter(r => (!r.effective_from || r.effective_from <= date) && (!r.effective_to || r.effective_to >= date));
  const imed = current.filter(r => isImed(r.validators?.name) || isImed(r.validators?.slug));
  if (!imed.length) return { linked: false, ambiguous: false };
  if (billingChannelId != null) return { linked: imed.some(r => r.billing_channel_id == null || Number(r.billing_channel_id) === Number(billingChannelId)), ambiguous: false };
  // Si hay validadores por circuito diferentes, exigir contexto en lugar de adivinar.
  const scoped = current.filter(r => r.billing_channel_id != null);
  const mixed = scoped.length > 0 && (current.some(r => !imed.includes(r)) || new Set(scoped.map(r => Number(r.billing_channel_id))).size > 1);
  return { linked: !mixed, ambiguous: mixed };
}

async function isPami(socialWorkId) {
  if (!socialWorkId) return false;
  const { data, error } = await supabaseAdmin.from('social_works').select('name').eq('id', socialWorkId).maybeSingle();
  return !error && /\bpami\b/.test(normalize(data?.name || ''));
}

export { isSpecificNormativeQuestion, isImmediateOperationalContingency } from "./response-priority.mjs";

/** null => keep existing assistant logic. Restricted to approved records. */
export async function resolveInternalProcedure({ question, socialWorkId, billingChannelId = null }) {
  const detected = detectInternalProcedureIntent(question);
  if (!detected) return null;
  const swId = Number(socialWorkId) || null;
  const date = today();
  const outage = detected === 'VALIDATOR_FAILURE' || detected === 'IMED_FAILURE';
  const imed = outage ? await verifiedImedCircuit(swId, billingChannelId) : { linked: false, ambiguous: false };
  // La caída de TYS de una obra social IMED también puede ser un problema IMED.
  // Si falta relación confirmada o circuito, usar solo procedimiento general.
  const intent = outage ? (imed.linked ? 'IMED_FAILURE' : 'VALIDATOR_FAILURE') : detected;
  const list = await approved(intent);
  const allowed = p => activeOn(p, date) && circuitAllowed(p, billingChannelId) && (
    (p.scope === 'GENERAL') ||
    (p.scope === 'SOCIAL_WORK' && swId && Number(p.social_work_id) === swId) ||
    (p.scope === 'IMED' && imed.linked)
  );
  let rule = list.find(p => p.scope === 'SOCIAL_WORK' && allowed(p)) || list.find(p => p.scope === 'IMED' && allowed(p)) || list.find(p => p.scope === 'GENERAL' && allowed(p));
  if (!rule && outage) rule = (await approved('VALIDATOR_FAILURE')).find(p => p.scope === 'GENERAL' && allowed(p));
  if (!rule) return null;
  let answer = rule.answer;
  if (outage) {
    answer += '\n\nNo se declara una caída general ni una contingencia activa por el solo hecho de consultar: comprobar el estado real y seguir instrucciones del responsable.';
    if (imed.ambiguous) answer += '\n\nLa obra social tiene circuitos que requieren identificación. Confirmá Cámara/Colegio antes de aplicar instrucciones específicas de IMED.';
    else if (!imed.linked && detected === 'IMED_FAILURE') answer += '\n\nNo consta una asociación vigente IMED para el circuito consultado. Verificarla con Administración.';
    if (imed.linked && (await isPami(swId))) {
      const exception = (await approved('PAMI_IMED_FAILURE')).find(p => p.scope === 'PAMI_IMED' && activeOn(p,date) && circuitAllowed(p,billingChannelId));
      answer += exception ? '\n\nREFERENCIA HISTÓRICA PAMI (CONSULTABLE, NO AUTORIZACIÓN OPERATIVA):\n' + exception.answer
        : '\n\nExiste un antecedente histórico de procedimiento PAMI (OPF/cobertura forzada), pero NO se autoriza automáticamente. Consultar al responsable y la normativa vigente antes de proceder.';
    }
  }
  // Documentos/fechas siguen asociados al registro aprobado (procedure_id), no en pantalla.
  const source = 'Procedimiento interno aprobado de GDP Salud';
  answer += `\n\nFuente: ${source}. Prevalece la normativa específica vigente de la obra social, plan y circuito. Ante contradicción, solicitar revisión al área de Obras Sociales.`;
  return { answer, code: rule.code, procedure_id: rule.id, source };
}
