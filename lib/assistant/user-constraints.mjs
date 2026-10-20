// GDPSoft v3.13.26 — el bot respeta las condiciones que pone el usuario.
// «Detallame únicamente cómo se realiza la validación. No agregues presentación,
// auditoría ni facturación» => se responde solo eso, para cualquier obra social.
//
// splitUserConstraints separa la consulta en: tema (lo que se busca en la normativa,
// sin las palabras que podrían arrastrar temas excluidos) y condiciones (lo que se
// le exige al modelo). Todo es función pura y testeable.

const fold = (value) => String(value ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Frases que EXCLUYEN temas: se quitan de la búsqueda y pasan a condiciones.
const EXCLUSION = /\b(?:no (?:me )?(?:agregues|agregar|incluyas|incluir|menciones|mencionar|pongas|poner|des|quiero|expliques|explicar|necesito|hables|cuentes|detalles)|sin (?:agregar|incluir|mencionar|explicar|hablar|contar|detallar)|omiti\w*|omite\w*|exclui\w*|excepto|salvo|ignora\w*|no hace falta)\b/;
// Palabras que RESTRINGEN el alcance de lo pedido: la oración queda en la búsqueda
// (es el tema) y además se informa como condición.
const RESTRICTION = /\b(?:unicamente|solamente|exclusivamente|nada mas que|solo (?:quiero|necesito|me interesa|decime|detallame|explicame|contame))\b/;

function sentences(text) {
  return String(text ?? '').split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
}

export function splitUserConstraints(question) {
  const parts = sentences(question);
  const constraints = [];
  const topic = [];
  for (const part of parts) {
    const f = fold(part);
    if (EXCLUSION.test(f)) { constraints.push(part); continue; }
    if (RESTRICTION.test(f)) constraints.push(part);
    topic.push(part.replace(/(^|\s)(?:únicamente|unicamente|solamente|exclusivamente)(?=\s|$)/gi, '$1').replace(/\s+/g, ' ').trim());
  }
  if (!constraints.length) return { hasConstraints: false, topic: String(question ?? '').trim(), constraints: [] };
  const topicText = topic.join(' ').replace(/\s+/g, ' ').trim();
  // Si no queda un tema utilizable, se busca con la consulta completa.
  const usable = fold(topicText).split(' ').filter(Boolean).length >= 3;
  return {
    hasConstraints: true,
    topic: usable ? topicText : String(question ?? '').trim(),
    constraints,
  };
}

export function buildConstraintsPrompt(split) {
  if (!split?.hasConstraints) return '';
  const lines = split.constraints.map((c, i) => `${i + 1}. «${c.replace(/\s+/g, ' ').trim().slice(0, 400)}»`).join('\n');
  return `

CONDICIONES EXPRESAS DEL USUARIO (obligatorias; tienen prioridad sobre las reglas de brevedad, de completitud y de ofrecer más información):
${lines}

- Respondé exclusivamente lo que el usuario pidió, con el detalle necesario para que sea utilizable (pasos completos si pidió cómo se hace algo).
- Si pidió «únicamente» o «solamente» un tema, no incluyas ningún otro tema: ni presentación, auditoría, facturación, causales de débito, requisitos generales ni cierres sobre otros temas, aunque la normativa los mencione junto al tema pedido.
- Si pidió no agregar o omitir algo, omitilo por completo.
- No termines ofreciendo mostrar otros temas ni hagas preguntas finales.
- Usá solo la normativa recuperada; no inventes datos.
`;
}

// Quita la oferta final «¿Querés que te muestre …?» cuando el usuario fijó condiciones.
export function stripOfferLine(answer) {
  const text = String(answer ?? '');
  return text.replace(/\n*\s*¿\s*Quer[ée]s que te (?:muestre|detalle|explique|cuente)[^?\n]*\?\s*$/i, '').trimEnd();
}
