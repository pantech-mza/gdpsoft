/** Consultas del estado administrativo de una obra social en GDPSoft.
 * Nunca equiparar active con convenio/circuito/dispensa habilitados.
 */
export function normalizeStatusText(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const ACCEPTANCE_VERBS = /^(?:(?:hoy|actualmente|ahora|aun|todavia)\s+)?(?:recibimos|recibimo|reciben|atendemos|atienden|aceptamos|aceptan|tomamos|toman|trabajamos con|trabajan con|tenemos|tienen|estamos con|seguimos con|seguimos atendiendo|seguimos recibiendo)\b/;
const ACCEPTANCE_STRIP = /\b(?:hoy|actualmente|ahora|aun|todavia|recibimos|recibimo|reciben|atendemos|atienden|aceptamos|aceptan|tomamos|toman|trabajamos|trabajan|con|tenemos|tienen|estamos|seguimos|atendiendo|recibiendo|la|el|las|los|una|un|obra|obras|social|sociales|de|en|gdpsoft|sistema|nosotros|ustedes|ya|aca|aqui)\b/g;
/** «¿Recibimos ENSALUD?»: pregunta corta de aceptación que solo nombra la obra social.
 * Se resuelve como consulta de estado (incluye obras sociales inactivas). */
export function isSocialWorkAcceptanceQuestion(question = '') {
  const q = normalizeStatusText(question);
  if (!q || !ACCEPTANCE_VERBS.test(q)) return false;
  if (/\b(?:receta|recetas|normativa|normativas|plan|planes|convenio|convenios|cobertura|coberturas|campana|campanas|prestacion|prestaciones|validador|validadores|validacion|medicamento|medicamentos|autorizacion|autorizada|autorizadas|como|cuando|donde|que|cual|cuanto|requisitos|requiere|necesita|hace|falta)\b/.test(q)) return false;
  const remainder = q.replace(ACCEPTANCE_STRIP, ' ').replace(/\s+/g, ' ').trim();
  return remainder.split(' ').filter(Boolean).length <= 3;
}

export function isSocialWorkStatusQuestion(question = '') {
  const q = normalizeStatusText(question);
  if (isSocialWorkAcceptanceQuestion(question)) return true;
  if (!q || !/\b(?:inactiv[ao]s?|activ[ao]s?)\b/.test(q)) return false;
  // La vigencia de un convenio, receta, plan o normativa NO es social_works.active.
  if (/\b(?:receta|recetas|normativa|normativas|plan|planes|convenio|convenios|cobertura|coberturas|campana|campanas|prestacion|prestaciones|validador|validadores|validacion|medicamento|medicamentos|autorizacion)\b/.test(q)) return false;
  return /\b(?:esta|estan|sigue|siguen|figura|figuran|aparece|aparecen|encuentra|encuentran|permanece|permanecen)\b/.test(q) ||
    /\b(?:inactiv[ao]s?|activ[ao]s?)$/.test(q);
}

/** Si se nombró una entidad desconocida, NO reemplazarla por la OOSS del chat. */
export function hasExplicitStatusSubject(question = '') {
  const remainder = normalizeStatusText(question)
    .replace(ACCEPTANCE_STRIP, ' ')
    .replace(/\b(?:esta|estan|sigue|siguen|figura|figuran|aparece|aparecen|se|encuentra|encuentran|permanece|permanecen|inactiva|inactivo|inactivas|inactivos|activa|activo|activas|activos|la|el|una|un|obra|social|de|las|los|en|gdpsoft|sistema|actualmente|hoy|aun|todavia|o|no|si|que|como|es)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return remainder.length > 0;
}

export function formatSocialWorkStatus(socialWork) {
  if (!socialWork || typeof socialWork.active !== 'boolean') {
    return 'No pude verificar el estado registrado de esta obra social. Consultá con Administración.';
  }
  const name = String(socialWork.name || 'La obra social').trim();
  const status = socialWork.active
    ? `Sí, ${name} está activa en GDPSoft.`
    : `No, ${name} figura inactiva en GDPSoft.`;
  return `${status}\n\nFuente: Recordá/Ficha de ${name}. Este estado no confirma la habilitación del convenio en tu sucursal.`;
}
