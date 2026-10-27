// GDPSoft v3.13.109 — Obras sociales INACTIVAS: se reconocen y se ofrecen como alternativa.
// El diccionario de detección solo carga las activas, así que una obra social inactiva (p. ej. IOSFA) nunca se
// ofrecía ni se reconocía: el bot decía «no pude identificar OSFA» y sugería otra parecida (ROSFAR).
// Funciones puras; la consulta a la base la hace la ruta.
import { suggestSocialWorks } from './social-work-suggestions.mjs';
import { buildSocialWorkDictionary, detectSocialWorks } from './socialWorkDetection.js';

const fold = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC = new Set(['salud', 'obra', 'social', 'sociales', 'art', 'mutual', 'medica', 'medicina', 'seguros', 'plan', 'sistema', 'asistencia', 'todas', 'sucursales']);

/** ¿Alguna obra social inactiva está nombrada en el texto? Devuelve {id,name} o null. Solo coincidencias exactas. */
export function findInactiveMatch(text, inactiveWorks = []) {
  const hay = ` ${fold(text)} `;
  if (hay.trim().length < 3) return null;
  const tokens = new Set(hay.trim().split(' '));
  for (const work of inactiveWorks) {
    const name = fold(work?.name);
    if (!name) continue;
    if (hay.includes(` ${name} `)) return { id: work.id ?? null, name: String(work.name).trim() };
    const parts = name.split(' ');
    // sigla de una sola palabra («IOSFA»): alcanza con que aparezca como palabra
    if (parts.length === 1 && name.length >= 4 && !GENERIC.has(name) && tokens.has(name)) return { id: work.id ?? null, name: String(work.name).trim() };
  }
  return null;
}

export function buildInactiveAnswer(name) {
  const n = String(name ?? '').trim();
  return `${n} figura como obra social INACTIVA en GDPSoft, por eso no tengo información operativa para darte. Si necesitás confirmar si se puede atender, consultá con el área de Obras Sociales.`;
}

/** Sugerencias entre activas e inactivas (las inactivas se marcan). Devuelve { names, inactive:Set } */
export function suggestWithInactive(unresolved, activeNames = [], inactiveNames = [], max = 3) {
  const inactiveSet = new Set((inactiveNames || []).map((n) => String(n ?? '').trim()).filter(Boolean));
  const names = [...new Set([...(activeNames || []), ...inactiveSet])];
  const picked = suggestSocialWorks(unresolved, names, max);
  return { names: picked, inactive: new Set(picked.filter((n) => inactiveSet.has(String(n).trim()))) };
}

export function buildSuggestionAnswerWithInactive(unresolved, suggestion) {
  const picked = suggestion?.names || [];
  if (!picked.length) return null;
  const label = (n) => (suggestion.inactive?.has(n) ? `${n} (figura inactiva en GDPSoft)` : n);
  const list = picked.length === 1 ? label(picked[0])
    : `${picked.slice(0, -1).map(label).join(', ')} o ${label(picked[picked.length - 1])}`;
  return `No pude identificar ${String(unresolved ?? '').trim()} entre las obras sociales activas de GDPSoft. ¿Quizás quisiste consultar por ${list}? Confirmame el nombre para poder ayudarte con la información correspondiente.`;
}

/**
 * Detecta una obra social INACTIVA por su nombre o por un ALIAS cargado (p. ej. «FUERZA AEREA» → IOSFA).
 * Usa el mismo diccionario que las activas, pero solo con las inactivas. Devuelve {id,name,match,source} o null.
 * strict=true (cuando las activas solo coincidieron por una palabra suelta): se exige nombre/alias completo,
 * no una palabra distintiva, para no pisar una consulta que en realidad era de otra obra social.
 */
export function detectInactiveSocialWork({ question, inactiveWorks = [], aliases = [], strict = false }) {
  if (!inactiveWorks.length) return null;
  const dictionary = buildSocialWorkDictionary({ socialWorks: inactiveWorks, aliases });
  const matches = detectSocialWorks({ text: question, dictionary })
    .filter((m) => /^(NAME|ALIAS)(_COMPACT)?$/.test(m.source) || (!strict && m.source === 'UNIQUE_TOKEN'));
  const ids = [...new Set(matches.map((m) => Number(m.id)))];
  if (ids.length !== 1) return null; // si hay dudas entre varias inactivas, no se afirma nada
  const m = matches.find((x) => Number(x.id) === ids[0]);
  return { id: m.id, name: m.name, match: m.match, source: m.source };
}
