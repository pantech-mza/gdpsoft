// v3.13.80 — sin normativa específica para la obra social: se responde con lo que hay en la Ficha.
const clean = (v) => String(v ?? '').trim();
const yn = (v) => (v === true ? 'Sí' : v === false ? 'No' : clean(v));
const FIELDS = [
  ['Validador', (d) => [clean(d.validator_name), clean(d.validator_type) && `(${clean(d.validator_type)})`].filter(Boolean).join(' ')],
  ['Tipo de receta', (d) => clean(d.recipe_type)],
  ['Vigencia de la receta', (d) => (d.recipe_validity_days ? `${d.recipe_validity_days} días` : '')],
  ['Membrete', (d) => yn(d.letterhead)],
  ['RP', (d) => yn(d.rp)],
  ['Diagnóstico', (d) => yn(d.diagnosis)],
  ['Monodroga', (d) => yn(d.monodrug)],
  ['Nombre comercial', (d) => yn(d.commercial_name)],
  ['Sustitución', (d) => yn(d.substitution)],
];

export function buildFichaSummary(ficha, { socialWorkName = '' } = {}) {
  if (!ficha) return null;
  const items = FIELDS.map(([label, get]) => [label, get(ficha)]).filter(([, v]) => v && v !== '__VACIO__');
  if (!items.length) return null;
  const name = clean(socialWorkName || ficha.name);
  return [
    `Información · ${name}`,
    'Intro: No tengo una normativa específica cargada para esta consulta. Esto es lo que figura en la Ficha de la obra social:',
    'Ficha:',
    ...items.map(([l, v]) => `- ${l}: ${v}`),
    'Aviso: Información de la Ficha, no de la normativa. Ante dudas, consultá con Obras Sociales.',
  ].join('\n');
}

// v3.13.82 — el validador de la Ficha puede traer la excepción de otra sucursal («GMS/SUC: San Francisco DP1»).
// Si la sucursal que consulta no tiene esa excepción, se muestra solo el validador general.
export function stripOtherBranchValidator(text) {
  return String(text ?? '').replace(/[ \t]*\/?[ \t]*SUC:[ \t]*[^\n.]+/gi, '').replace(/[ \t]+\./g, '.');
}
