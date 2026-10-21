// GDPSoft v3.13.78 — variantes de plan dentro de una misma obra social (ej. OSEP vs OSEP OYTE).
// Cada vínculo normativa↔obra social puede llevar plan_variant ('OYTE'); sin variante = obra social general.
// Si la obra social tiene normativas con variante, una consulta general NO usa las de la variante y
// una consulta de la variante NO usa las generales: así no se mezclan requisitos ni validaciones.
export const PLAN_VARIANTS = Object.freeze(['OYTE']);

const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function detectPlanVariant(text) {
  const t = fold(text);
  if (/\b(?:oyte|o\s*y\s*te)\b/.test(t)) return 'OYTE';
  return null;
}

/** Nombrar la obra social («osep») sin el plan corta la variante heredada de la conversación. */
export function namesParentWithoutVariant(text) {
  return /\bosep\b/.test(fold(text)) && !detectPlanVariant(text);
}

/** La variante nombrada en la consulta manda; si no hay, se mantiene la de la conversación (misma obra social). */
export function resolvePlanVariant({ question = '', state = null, socialWorkId = null } = {}) {
  const asked = detectPlanVariant(question);
  if (asked) return asked;
  const prev = state?.variant;
  if (namesParentWithoutVariant(question)) return null;
  if (prev && PLAN_VARIANTS.includes(prev) &&
      (socialWorkId == null || state?.social_work_id == null || Number(state.social_work_id) === Number(socialWorkId))) return prev;
  return null;
}

/** Filtra filas de normative_social_works según la variante. Devuelve {rows, applied, missing}. */
export function filterRowsByVariant(rows, variant = null) {
  const list = Array.isArray(rows) ? rows : [];
  const hasVariants = list.some((r) => r?.plan_variant);
  if (!hasVariants) return { rows: list, applied: false, missing: false };
  const selected = list.filter((r) => (variant ? r.plan_variant === variant : !r.plan_variant));
  return { rows: selected, applied: true, missing: selected.length === 0 };
}

/** Filtro por texto para observaciones y protocolos internos: los que nombran OYTE son de OYTE; el resto, del plan general.
 *  Solo se aplica a obras sociales con alguna entrada que nombre OYTE. */
export function filterTextsByVariant(items, variant = null, getText = (x) => x) {
  const list = Array.isArray(items) ? items : [];
  const isOyte = (x) => detectPlanVariant(getText(x)) === 'OYTE';
  if (!list.some(isOyte)) return list;
  return list.filter((x) => (variant === 'OYTE' ? isOyte(x) : !isOyte(x)));
}
