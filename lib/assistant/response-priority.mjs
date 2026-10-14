/** GDPSoft: fuente específica de la OOSS antes que protocolo interno. */
const normalize = (v = '') => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Consultas propias de una OOSS: siempre ficha/normativa, NUNCA un protocolo general.
 * Un fallo concreto del validador sí puede ser una contingencia operativa.
 */
export function isSpecificNormativeQuestion(text = '') {
  const q = normalize(text);
  const incident = /\b(se cayo|caido|caida|no funciona|sin servicio|fuera de servicio|error (?:tys|de validacion)|no valida|no me valida|no puedo validar|rechaza(?:da|do)?|falla (?:el|la) validador)\b/.test(q);
  if (incident) return false;
  return /\b(vigencia|validez|cuantos dias|vence|vencimiento|rp|diagnostico|membrete|monodroga|nombre comercial|sustitucion|tipo de receta|receta digital|receta electronica|matricula|firma|sello|cantidad de medicamentos|cobertura|porcentaje|tope|plan|facturacion|como valido|donde valido|por donde valido|autorizacion)\b/.test(q);
}

/** Solo contingencias inequívocas pueden adelantar la respuesta interna. */
export function isImmediateOperationalContingency(text = '') {
  const q = normalize(text);
  const event = /\b(se cayo|caido|caida|sin servicio|fuera de servicio|no funciona|no anda|error tys|error de validacion|fallando|no valida|no me valida|no puedo validar)\b/.test(q);
  const target = /\b(validador|validacion|validar|tys|sistema de validacion|portal|imed|receta)\b/.test(q);
  return event && target;
}

