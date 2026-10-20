/**
 * Bloquea únicamente siglas de OOSS explícitas no resueltas.
 * Una repregunta sin nombre explícito conserva su contexto normal.
 * Un error de transposición unívoco aceptado por el detector también se admite.
 */
const norm = (value = '') => String(value).normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

function phrasesForToken(token, dictionary) {
  return (dictionary?.phrases || []).filter((p) => {
    const phrase = norm(p.phrase);
    return phrase.split(' ').includes(token) || phrase.replace(/\s/g, '') === token;
  });
}

export function unresolvedExplicitSocialWork({question = '', dictionary, matches = []} = {}) {
  const tokens = [...new Set(norm(question).split(' ').filter((t) => /^os[a-z0-9]{2,15}$/.test(t)))];
  for (const token of tokens) {
    const owners = phrasesForToken(token, dictionary);
    const transposed = matches.some((m) => m.source === 'UNIQUE_TRANSPOSITION' && norm(m.name).replace(/\s/g, '').startsWith('os'));
    if (!owners.length) {
      if (!transposed) return token.toUpperCase();
      continue;
    }
    const ownerIds = new Set(owners.map((p) => Number(p.socialWork.id)));
    if (!(matches || []).some((m) => ownerIds.has(Number(m.id)))) return token.toUpperCase();
  }
  return null;
}
