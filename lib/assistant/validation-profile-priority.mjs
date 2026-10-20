/**
 * Distinguish asking where/how a social work is validated (Recordá/Ficha)
 * from asking how a particular branch may operate (reception/circuit rules).
 *
 * This helper does NOT approve accepting, authorizing, or dispensing a recipe.
 * It only allows reading stored validation metadata without being blocked by a
 * missing branch-specific operational rule.
 */
export function shouldPreferValidationProfile({ operationType, profileKey, question } = {}) {
  if (operationType !== 'VALIDATION' || !['VALIDATION_METHOD', 'VALIDATOR_NAME'].includes(profileKey)) {
    return false;
  }

  const normalized = String(question ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // An explicit branch context makes this an operational question; let the
  // branch/circuit resolver decide rather than inferring a dispensing route
  // from the informational ficha fields.
  const namesBranch = /\b(?:en|desde|para) (?:la |mi |nuestra |esta )?(?:sucursal\b|sucu\b|suc\b|dp\s*\d+\b|econo mas\b|libertad\b|san francisco\b)/;
  if (namesBranch.test(normalized)) return false;

  return true;
}
