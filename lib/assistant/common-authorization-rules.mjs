/**
 * GDPSoft: reglas normativas comunes CONFIRMADAS por documentos de ambos
 * circuitos. No depende de la sucursal, no decide la habilitación de
 * convenios y nunca confunde importes con el circuito de facturación.
 *
 * Versión inicial aprobada para consulta: Provincia ART, anexo 30/01/2025
 * (página 2, puntos 5.2 y 5.3) y Normas Octubre 2024 (página 2).
 * Las modificaciones requieren revisión documental y una nueva versión.
 */
const strip = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

// Tabla común por OOSS: permite añadir nuevas reglas revisadas sin crear
// parches específicos para cada sucursal. IMPORTANTE: no incorporar reglas
// de una sola vía como si rigieran para todas.
export const COMMON_AUTHORIZATION_RULES = Object.freeze({
  PROVINCIA_ART: Object.freeze({
    socialWork: 'Provincia ART',
    perProduct: 20_000,
    perPrescription: 80_000,
    source: 'Provincia ART: Anexo Farmacias 30/01/2025, pág. 2 (5.2–5.3); Normas octubre 2024, pág. 2',
    sourceStatus: 'Documentos cargados, sujetos a actualizaciones posteriores aprobadas',
  }),
});

function identifyRule(name) {
  const n = strip(name);
  if (/^provincia art(?: camara| colegio)?$/.test(n)) return COMMON_AUTHORIZATION_RULES.PROVINCIA_ART;
  return null;
}

export function isAuthorizationAmountQuestion(question) {
  const q = strip(question);
  const amount = /\b(?:monto|montos|importe|importes|precio|precios|costo|valor|tope|topes|limite|limites|presupuesto|20\s*000|80\s*000|20\s*mil|80\s*mil)\b/.test(q) || /\$\s*\d/.test(String(question));
  const authorization = /\b(?:autorizacion|autorizar|autorizada|autorizado|autorizaciones|solicitar|pedir|requiere|necesita|necesito|debo|hay que)\b/.test(q);
  const prescription = /\b(?:receta|renglon|producto|medicamento|farmaco|medicamentos|unidades|por cada|cada uno)\b/.test(q);
  return (amount && (authorization || prescription)) ||
    (/\b(?:tope|topes|limite|limites)\b/.test(q) && /\b(?:autorizacion|receta|medicamento)\b/.test(q));
}

function formatARS(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

// 'Cada uno supera los $20.000' es una evidencia inequívoca de superar
// el umbral individual. El importe TOTAL nunca equivale a importe unitario.
function perProductAbove(text, limit) {
  const q = strip(text);
  const implicit = /\b(?:cada|c\/u|individual|por (?:cada )?(?:medicamento|producto|renglon)|ambos|los dos)\b/.test(q);
  const exceeds = /\b(?:supera|superan|mayor|mas de|por encima|excede|exceden)\b/.test(q);
  const explicitThreshold = new RegExp('\\b' + String(limit) + '\\b').test(q.replace(/\b20\s+000\b/g, '20000')) ||
    (limit === 20_000 && /\b20 mil\b/.test(q));
  // «cada producto supera $20.000» y «supera $20.000 cada uno».
  if (implicit && exceeds && explicitThreshold) return true;
  // «Cada medicamento cuesta $25.000» o «por producto $30.000».
  if (implicit && !/\b(?:no|sin)\s+(?:supera|superan|excede|exceden)\b/.test(q)) {
    const amounts = [...String(text).matchAll(/\$\s*([\d.,]+)/g)]
      .map(m => Number(m[1].replace(/\./g, '').replace(/,/g, '.')))
      .filter(n => Number.isFinite(n));
    if (amounts.some(n => n > limit) &&
        /\b(?:cada|por|un)\b.{0,45}\b(?:medicamento|producto|renglon)\b|\b(?:medicamento|producto|renglon)\b.{0,45}\b(?:cada|por|cuesta|vale)\b/.test(q)) return true;
  }
  return false;
}

function totalAbove(text, limit) {
  const q = strip(text);
  const isTotal = /\b(?:total|receta|suma)\b/.test(q);
  const higher = /\b(?:supera|superan|excede|exceden|mayor|mas de)\b/.test(q);
  const hasThreshold = new RegExp('\\b' + String(limit) + '\\b').test(q.replace(/\b80\s+000\b/g, '80000')) ||
    (limit === 80_000 && /\b80 mil\b/.test(q));
  if (isTotal && higher && hasThreshold && !/\b(?:no|sin)\s+(?:supera|superan|excede|exceden)\b/.test(q)) return true;
  return false;
}

/**
 * Devuelve null si la pregunta NO es sobre autorizaciones por importe, o
 * no existe una regla COMÚN revisada para esa OOSS. Para otras entidades
 * el router original debe consultar la normativa aplicable sin inventar topes.
 */
export function resolveCommonAuthorizationAmount({question, socialWorkName} = {}) {
  if (!isAuthorizationAmountQuestion(question)) return null;
  const rule = identifyRule(socialWorkName);
  if (!rule) return null;
  const product = perProductAbove(question, rule.perProduct);
  const prescription = totalAbove(question, rule.perPrescription);
  const sourceLine = `Referencia: ${rule.source}.`;
  if (product || prescription) {
    const explanation = product
      ? `un medicamento/renglón supera el límite individual de ${formatARS(rule.perProduct)}`
      : `la receta supera el límite total de ${formatARS(rule.perPrescription)}`;
    return {
      found:true,
      answer:`Sí, requiere autorización porque ${explanation}, aunque no se alcance el otro tope.\n${sourceLine}\nVerificá la vigencia de los importes y la autorización de la entidad antes de dispensar.`,
      ruleId:'PROVINCIA_ART_AUTHORIZATION_LIMITS_2025',
    };
  }
  // Sin evidencia suficiente sobre los importes, informar ambos límites,
  // no inferir que una receta es válida o no necesita autorizaciones.
  return {
    found:true,
    answer:`Según las normativas cargadas de Provincia ART, se solicita autorización si un producto/renglón supera ${formatARS(rule.perProduct)} o la receta completa supera ${formatARS(rule.perPrescription)}. Son límites independientes.\n${sourceLine}\nSi me indicás los importes por medicamento y el total, puedo evaluar esos topes; verificá también la vigencia y otras condiciones.`,
    ruleId:'PROVINCIA_ART_AUTHORIZATION_LIMITS_2025',
  };
}
