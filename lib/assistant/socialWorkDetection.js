// lib/assistant/socialWorkDetection.js

export function normalizeSocialWorkText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_TOKENS = new Set([
  "art",
  "salud",
  "obra",
  "social",
  "obras",
  "sociales",
  "servicio",
  "servicios",
  "prepaga",
  "medicina",
  "medica",
  "medico",
  "argentina",
  "sociedad",
  "asociacion",
  "mutual",
  "sistema",
  "plan",
  "planes",
  "oficial",
  "comun",
  // Palabras corrientes que aparecen en alias («PASTELEROS - TODAS LAS SUCURSALES») y no identifican una obra social.
  "todas",
  "todos",
  "sucursal",
  "sucursales",
  "general",
  "generales",
  "marcas",
  "marca",
  "farmacia",
  "farmacias",
]);

function tokenize(value) {
  return normalizeSocialWorkText(value)
    .split(" ")
    .filter(Boolean);
}


// Une tokens tolerando una letra compartida en el límite.
// Ejemplo: "andes salud" -> "andesalud", equivalente a "ANDESALUD".
function compactTokens(tokens = []) {
  if (!tokens.length) return "";

  let result = String(tokens[0] || "");

  for (let i = 1; i < tokens.length; i += 1) {
    const token = String(tokens[i] || "");
    if (!token) continue;

    if (
      result &&
      result[result.length - 1] === token[0]
    ) {
      result += token.slice(1);
    } else {
      result += token;
    }
  }

  return result;
}

function compactSocialWorkText(value) {
  return compactTokens(tokenize(value));
}

function containsWholePhrase(text, phrase) {
  const normalizedText =
    ` ${normalizeSocialWorkText(text)} `;

  const normalizedPhrase =
    normalizeSocialWorkText(phrase);

  if (!normalizedPhrase) {
    return false;
  }

  return normalizedText.includes(
    ` ${normalizedPhrase} `
  );
}

function getDistinctiveTokens(value) {
  return tokenize(value).filter(
    (token) =>
      token.length >= 4 &&
      !GENERIC_TOKENS.has(token)
  );
}

export function buildSocialWorkDictionary({
  socialWorks = [],
  aliases = [],
}) {
  const byId = new Map();

  for (const sw of socialWorks) {
    const id = Number(sw?.id);

    if (
      Number.isInteger(id) &&
      id > 0
    ) {
      byId.set(id, sw);
    }
  }

  const phrases = [];

  for (const sw of socialWorks) {
    if (!sw?.id || !sw?.name) {
      continue;
    }

    phrases.push({
      socialWork: sw,
      phrase: sw.name,
      normalized:
        normalizeSocialWorkText(
          sw.name
        ),
      compact:
        compactSocialWorkText(
          sw.name
        ),
      source: "NAME",
    });
  }

  for (const alias of aliases) {
    const socialWorkId =
      Number(alias?.social_work_id);

    const socialWork =
      byId.get(socialWorkId);

    if (!socialWork) {
      continue;
    }

    const aliasValue =
      alias?.alias ||
      alias?.name ||
      alias?.alias_name ||
      alias?.value ||
      null;

    if (!aliasValue) {
      continue;
    }

    phrases.push({
      socialWork,
      phrase: aliasValue,
      normalized:
        normalizeSocialWorkText(
          aliasValue
        ),
      compact:
        compactSocialWorkText(
          aliasValue
        ),
      source: "ALIAS",
    });
  }

  const tokenOwners =
    new Map();

  for (const item of phrases) {
    const tokens =
      getDistinctiveTokens(
        item.phrase
      );

    for (const token of tokens) {
      if (!tokenOwners.has(token)) {
        tokenOwners.set(
          token,
          new Set()
        );
      }

      tokenOwners
        .get(token)
        .add(
          Number(
            item.socialWork.id
          )
        );
    }
  }

  const uniqueTokens = [];
  const ambiguousTokens = [];

  for (
    const [token, ids]
    of tokenOwners
  ) {
    if (ids.size !== 1) {
      // v3.13.60 — «oyte» en varias obras sociales: se ofrecen las opciones.
      if (ids.size > 1 && ids.size <= 5) {
        const owners = [...ids].map((id) => byId.get(id)).filter(Boolean);
        if (owners.length > 1) ambiguousTokens.push({ token, socialWorks: owners });
      }
      continue;
    }

    const socialWorkId =
      [...ids][0];

    const socialWork =
      byId.get(socialWorkId);

    if (!socialWork) {
      continue;
    }

    uniqueTokens.push({
      token,
      socialWork,
    });
  }

  phrases.sort(
    (a, b) =>
      b.normalized.length -
      a.normalized.length
  );

  return {
    byId,
    phrases,
    uniqueTokens,
    ambiguousTokens,
  };
}

/** Solo una transposición adyacente, sin hacer coincidencia difusa indiscriminada. */
function adjacentTransposition(a, b) {
  if (a.length !== b.length || a.length < 7 || a.slice(0, 4) !== b.slice(0, 4)) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return i + 1 < a.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

/** El error de escritura se acepta solo si señala UNA obra social inequívoca. */
export function detectUniqueTransposedSocialWork(text, dictionary) {
  const words = tokenize(text).filter((word) => word.length >= 7);
  const possible = new Map();
  for (const candidate of dictionary?.phrases || []) {
    const name = candidate.normalized;
    if (!name || !/^[a-z0-9]{7,}$/.test(name)) continue;
    if (!words.some((word) => adjacentTransposition(word, name))) continue;
    const id = Number(candidate.socialWork.id);
    possible.set(id, { id, name: candidate.socialWork.name, match: name, source: 'UNIQUE_TRANSPOSITION', strength: 85 });
  }
  return possible.size === 1 ? [...possible.values()] : [];
}

export function detectSocialWorks({
  text,
  dictionary,
}) {
  const normalizedText =
    normalizeSocialWorkText(text);

  if (!normalizedText) {
    return [];
  }

  const found = new Map();

  // 1. Nombre o alias completo.
  for (
    const candidate of
      dictionary?.phrases || []
  ) {
    if (
      !containsWholePhrase(
        normalizedText,
        candidate.phrase
      )
    ) {
      continue;
    }

    const id =
      Number(
        candidate.socialWork.id
      );

    found.set(id, {
      id,
      name:
        candidate.socialWork.name,
      match:
        candidate.phrase,
      source:
        candidate.source,
      strength: 100,
    });
  }

  if (found.size > 0) {
    // v3.13.60 — «OSEP» está contenido en «OSEP OYTE»: si ambos aparecen como frase
    // completa, la más específica manda y la más corta no cuenta como otra obra social.
    const entries = [...found.values()];
    const folded = (entry) => ` ${normalizeSocialWorkText(entry.match)} `;
    const specific = entries.filter((entry) => !entries.some((other) =>
      other !== entry && folded(other) !== folded(entry) && folded(other).includes(folded(entry))));
    return specific.length ? specific : entries;
  }

  // 2. Nombre/alias escrito con separadores distintos.
  // Ejemplo real: ANDESALUD <-> "andes salud".
  // Se comparan ventanas cortas de tokens para evitar coincidencias
  // accidentales sobre toda la oración.
  const textTokens = tokenize(normalizedText);

  for (const candidate of dictionary?.phrases || []) {
    const target = candidate.compact || compactSocialWorkText(candidate.phrase);

    // Nombres muy cortos continúan resolviéndose por frase/token exacto.
    if (!target || target.length < 6) continue;

    const candidateTokenCount = Math.max(1, tokenize(candidate.phrase).length);
    const maxWindow = Math.min(5, candidateTokenCount + 2);

    let matched = false;

    for (let start = 0; start < textTokens.length && !matched; start += 1) {
      for (let size = 1; size <= maxWindow && start + size <= textTokens.length; size += 1) {
        const window = textTokens.slice(start, start + size);
        if (compactTokens(window) === target) {
          matched = true;
          break;
        }
      }
    }

    if (!matched) continue;

    const id = Number(candidate.socialWork.id);
    found.set(id, {
      id,
      name: candidate.socialWork.name,
      match: candidate.phrase,
      source: `${candidate.source}_COMPACT`,
      strength: 95,
    });
  }

  if (found.size > 0) {
    return [...found.values()];
  }

  // 3. Token único.
  // BERKLEY ART -> "berkley"
  const questionTokens =
    new Set(
      tokenize(normalizedText)
    );

  for (
    const candidate of
      dictionary?.uniqueTokens ||
      []
  ) {
    if (
      !questionTokens.has(
        candidate.token
      )
    ) {
      continue;
    }

    const id =
      Number(
        candidate.socialWork.id
      );

    found.set(id, {
      id,
      name:
        candidate.socialWork.name,
      match:
        candidate.token,
      source:
        "UNIQUE_TOKEN",
      strength: 80,
    });
  }

  // v3.13.60 — token compartido por varias obras sociales: se devuelven todas
  // para que el asistente pregunte cuál es (nunca se elige una al azar).
  if (!found.size) {
    for (const candidate of dictionary?.ambiguousTokens || []) {
      if (!questionTokens.has(candidate.token)) continue;
      for (const socialWork of candidate.socialWorks) {
        const id = Number(socialWork.id);
        found.set(id, { id, name: socialWork.name, match: candidate.token, source: "AMBIGUOUS_TOKEN", strength: 60 });
      }
      break;
    }
    if (found.size) return [...found.values()];
  }
  // Solo tras agotar nombre completo, nombre compacto y token exacto.
  if (!found.size) return detectUniqueTransposedSocialWork(text, dictionary);
  return [...found.values()];
}