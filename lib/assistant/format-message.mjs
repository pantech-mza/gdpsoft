/**
 * Interpretación puramente visual de respuestas del asistente.
 * No modifica el texto almacenado, ni autoriza, corrige o inventa instrucciones.
 * Acepta respuestas antiguas con numeraciones seguidas en una única línea.
 */
export function splitInlineNumberedSteps(input) {
  const output = [];
  for (const line of String(input ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const matches = [...line.matchAll(/(^|[ \t])(\d{1,2})[.)][ \t]+/g)];
    const sequential = matches.length >= 2 &&
      matches[0][2] === '1' &&
      matches.every((match, index) => Number(match[2]) === index + 1);
    if (!sequential) {
      output.push(line);
      continue;
    }
    const preamble = line.slice(0, matches[0].index).trim();
    if (preamble) output.push(preamble);
    matches.forEach((match, index) => {
      const start = match.index + match[1].length;
      const end = index + 1 < matches.length
        ? matches[index + 1].index
        : line.length;
      output.push(line.slice(start, end).trim());
    });
  }
  return output.join('\n');
}

function cleanInline(s) {
  return String(s || '')
    .replace(/^[ \t]+|[ \t]+$/g, '')
    .replace(/\*\*/g, '')
    .replace(/__/g, '');
}

export function parseAssistantMessage(input) {
  const text = splitInlineNumberedSteps(input).trim();
  if (!text) return [];
  const blocks = [];
  const lines = text.split('\n');
  let last = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      last = null;
      continue;
    }
    const step = line.match(/^(\d{1,2})[.)][ \t]+(.+)$/);
    if (step) {
      blocks.push({ type: 'step', number: Number(step[1]), text: step[2].trim() });
      last = blocks[blocks.length - 1];
      continue;
    }
    const bullet = line.match(/^(?:[-•*]|[✓✔])\s+(.+)$/u);
    if (bullet) {
      blocks.push({ type: 'bullet', text: bullet[1].trim() });
      last = blocks[blocks.length - 1];
      continue;
    }
    const warning = line.match(/^(?:\*\*)?(?:⚠️?\s*)?(Importante|Atención|Advertencia|Precaución|Recordá|Nota)(?:\*\*)?\s*:\s*(.*)$/iu);
    if (warning) {
      blocks.push({ type: 'warning', title: warning[1], text: warning[2].trim() });
      last = blocks[blocks.length - 1];
      continue;
    }
    const header = line.match(/^#{1,4}\s+(.+)$/);
    if (header) {
      blocks.push({ type: 'heading', text: header[1].trim() });
      last = null;
      continue;
    }
    const explicitHeading = line.match(/^\*\*(.{2,90})\*\*\s*$/);
    if (explicitHeading) {
      blocks.push({ type: 'heading', text: explicitHeading[1] });
      last = null;
      continue;
    }
    if (last && ['step', 'bullet', 'warning', 'paragraph'].includes(last.type)) {
      last.text = `${last.text}\n${line}`;
    } else {
      blocks.push({ type: 'paragraph', text: line });
      last = blocks[blocks.length - 1];
    }
  }
  return blocks;
}

export function isStructuredAssistantMessage(blocks) {
  return blocks.some(block => ['step', 'bullet', 'heading', 'warning'].includes(block.type));
}

export function classifyStepIcon(text) {
  const s = cleanInline(text).toLocaleLowerCase('es');
  if (/no (?:se debe|forzar|continuar|dispensar)|detener|rechaz|riesgo|sin autorización|advert/.test(s)) return 'fluent:shield-error-20-regular';
  if (/verific|comprob|revis|confirm|control/.test(s)) return 'fluent:clipboard-task-20-regular';
  if (/página|validador externo|ingres|incógnito|tys|imed/.test(s)) return 'fluent:globe-search-20-regular';
  if (/inform|explic|paciente|afiliado|cliente/.test(s)) return 'fluent:person-feedback-20-regular';
  if (/reintegro|descuent|cobertura|precio|importe|pagar/.test(s)) return 'fluent:receipt-money-20-regular';
  if (/consult|llam|contact|obras sociales|farmacéutic/.test(s)) return 'fluent:people-community-20-regular';
  if (/imprim|adjunt|ticket|comprobante|receta|documentación/.test(s)) return 'fluent:document-bullet-list-20-regular';
  return 'fluent:arrow-circle-right-20-regular';
}
