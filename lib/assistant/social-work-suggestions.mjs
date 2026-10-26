// GDPSoft v3.13.30 — «¿Quisiste decir…?» cuando la obra social escrita no existe.
// Función pura: recibe el texto no reconocido y los nombres de las obras sociales activas.

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function editDistance(a, b) {
  const x = String(a), y = String(b);
  if (x === y) return 0;
  const prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i += 1) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j += 1) {
      const temp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
      diagonal = temp;
    }
  }
  return prev[y.length];
}

const maxDistance = (length) => (length <= 5 ? 1 : length <= 9 ? 2 : 3);

// Devuelve hasta `max` nombres (tal como figuran en GDPSoft), los más parecidos primero.
export function suggestSocialWorks(unresolved, names, max = 3) {
  const target = fold(unresolved).replace(/\s+/g, '');
  if (target.length < 3) return [];
  const prefixHits = [];
  const distanceHits = [];
  for (const name of names || []) {
    const display = String(name ?? '').trim();
    if (!display) continue;
    const variants = [fold(display).replace(/\s+/g, ''), ...fold(display).split(' ').filter((t) => t.length >= 3)];
    let best = null;
    for (const variant of variants) {
      if (variant === target) { best = null; break; } // coincidencia exacta: no es una sugerencia
      const prefix = (variant.startsWith(target) || target.startsWith(variant)) &&
        Math.abs(variant.length - target.length) <= 3 && Math.min(variant.length, target.length) >= 3;
      const distance = editDistance(target, variant);
      const near = distance <= maxDistance(Math.max(target.length, variant.length));
      if (prefix || near) {
        const candidate = { display, prefix, distance };
        if (!best || (candidate.prefix && !best.prefix) ||
            (candidate.prefix === best.prefix && candidate.distance < best.distance)) best = candidate;
      }
    }
    if (best) (best.prefix ? prefixHits : distanceHits).push(best);
  }
  // Si alguna palabra del texto es IGUAL a una palabra del nombre («ampes salud» → AMPES ASISTIR), esas obras sociales van primero.
  const GENERIC = new Set(['salud', 'obra', 'social', 'sociales', 'art', 'mutual', 'medica', 'medicina', 'seguros', 'plan', 'sistema', 'asistencia']);
  const words = fold(unresolved).split(' ').filter((w) => w.length >= 4 && !GENERIC.has(w));
  if (words.length) {
    const shared = [...new Set((names || []).map((n) => String(n ?? '').trim()).filter((n) => n && fold(n) !== fold(unresolved) && fold(n).split(' ').some((t) => words.includes(t))))];
    if (shared.length) return shared.slice(0, max);
  }
  let pool = prefixHits;
  if (!pool.length) {
    const minDistance = Math.min(...distanceHits.map((h) => h.distance));
    pool = distanceHits.filter((h) => h.distance === minDistance);
  }
  return [...new Map(pool.sort((a, b) => a.distance - b.distance || a.display.length - b.display.length)
    .map((h) => [h.display, h])).values()].slice(0, max).map((h) => h.display);
}

export function buildSuggestionAnswer(unresolved, suggestions) {
  const name = String(unresolved ?? '').trim();
  if (!suggestions?.length) return null;
  const list = suggestions.length === 1 ? suggestions[0]
    : `${suggestions.slice(0, -1).join(', ')} o ${suggestions[suggestions.length - 1]}`;
  return `No pude identificar ${name} entre las obras sociales activas de GDPSoft. ¿Quizás quisiste consultar por ${list}? Confirmame el nombre para poder ayudarte con la información correspondiente.`;
}
