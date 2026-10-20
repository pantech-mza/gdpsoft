/**
 * No reutilizar la obra social del contexto cuando la pregunta nombra OTRA
 * entidad que el detector no pudo reconocer inequívocamente.
 *
 * Una repregunta sin nombre explícito sí conserva el contexto anterior.
 * El cambio de obra social sigue siendo responsabilidad del router existente.
 */
import { mentionedCircuitBranches } from '../operations/camara-colegio-policy.mjs';

const norm = (value = '') => String(value)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function phrasesForToken(token, dictionary) {
  return (dictionary?.phrases || []).filter((p) => {
    const phrase = norm(p.phrase);
    return phrase.split(' ').includes(token) || phrase.replace(/\s/g, '') === token;
  });
}

function isAdjacentTransposition(a, b) {
  if (!a || !b || a.length !== b.length || a.length < 7) return false;
  let idx = 0;
  while (idx < a.length && a[idx] === b[idx]) idx += 1;
  return idx + 1 < a.length && a[idx] === b[idx + 1]
    && a[idx + 1] === b[idx] && a.slice(idx + 2) === b.slice(idx + 2);
}

/** Extrae una entidad nombrada en una pregunta inequívoca por Ficha/validador. */
function explicitTarget(text) {
  const q = norm(text);
  const patterns = [
    /\bpor donde (?:se )?valid(?:o|a|ar|an)\s+(.*)$/,
    /\b(?:que|cual) validador (?:usa|utiliza|tiene|emplea)\s+(.*)$/,
    /\bcomo se llama (?:el )?validador (?:de|para)\s+(.*)$/,
    /\b(?:necesito|quiero) validar (?:a |con |para )?(.*)$/,
    /\bobra social (?:llamada |denominada |de nombre |que se llama )(.+)$/,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].trim();
    if (!candidate || /^(?:con |en |por |online\b|el |la |un |una |que |cuya |sin )/.test(candidate)) continue;
    // «¿Por dónde valido?» no presenta entidad nombrada, mantiene contexto.
    if (/^(?:receta|recetas|medicamentos|mi receta|esta receta|aqui|hoy)$/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

const AFTER_NAME = /^(?:en|con|para|desde|del|de|y|segun|por)\b/;

function candidateIsRecognized(candidate, dictionary, matches = []) {
  if (!candidate) return true;
  const names = (dictionary?.phrases || []).filter((p) =>
    matches.some((m) => Number(m.id) === Number(p.socialWork?.id)));
  for (const named of names) {
    const phrase = norm(named.phrase);
    if (!phrase) continue;
    if (candidate === phrase) return true;
    if (candidate.startsWith(`${phrase} `) && AFTER_NAME.test(candidate.slice(phrase.length + 1))) return true;
  }
  // Preservar la corrección de error de transposición UNÍVOCO OSDEPMY → OSDEPYM.
  return matches.length === 1 && matches[0].source === 'UNIQUE_TRANSPOSITION'
    && candidate.split(' ').length === 1
    && (isAdjacentTransposition(candidate, norm(matches[0].name).replace(/\s/g, ''))
      || names.some(p => isAdjacentTransposition(candidate, norm(p.phrase).replace(/\s/g, ''))));
}

export function unresolvedExplicitSocialWork({question = '', dictionary, matches = []} = {}) {
  const tokens = [...new Set(norm(question).split(' ').filter((t) => /^os[a-z0-9]{2,15}$/.test(t)))];
  for (const token of tokens) {
    const owners = phrasesForToken(token, dictionary);
    const transposed = matches.some((m) => m.source === 'UNIQUE_TRANSPOSITION'
      && isAdjacentTransposition(token, norm(m.name).replace(/\s/g, '')));
    if (!owners.length) {
      if (!transposed) return token.toUpperCase();
      continue;
    }
    const ownerIds = new Set(owners.map((p) => Number(p.socialWork.id)));
    if (!matches.some((m) => ownerIds.has(Number(m.id)))) return token.toUpperCase();
  }
  const target = explicitTarget(question);
  // «¿Por dónde valido? ¿Econo Más?»: nombra una sucursal, no una obra social.
  if (target && target.split(' ').length <= 4 && mentionedCircuitBranches(target).length) return null;
  if (target && !candidateIsRecognized(target, dictionary, matches)) {
    return target.toUpperCase();
  }
  return null;
}
