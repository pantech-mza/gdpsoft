// GDPSoft v3.13.138 — cuando la pregunta nombra más de una obra social, la frase decide cuál es.
// «el logo de Centro Médico Galeno sirve como membrete para la obra social OSPE»: Galeno es una clínica, la obra social es OSPE.
// Funciones puras. Solo reducen a UNA coincidencia si la frase lo deja claro; si no, devuelven todas (se sigue preguntando).
const fold = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POSITIVE = '(?:obra social|obras sociales|ooss|os|prepaga|cobertura)(?: de la| del| de| para la| para el| para)?';
const NEGATIVE = '(?:centro medico|centro de salud|clinica|sanatorio|hospital|instituto|laboratorio|logo de|membrete de|consultorio|medico de)';

export function narrowByCue(question, matches = []) {
  if (!Array.isArray(matches) || matches.length < 2) return matches;
  const text = ` ${fold(question)} `;
  const pos = (m) => {
    const t = fold(m.match || m.name);
    return !!t && new RegExp(` ${POSITIVE} ${esc(t)} `).test(text);
  };
  const neg = (m) => {
    const t = fold(m.match || m.name);
    return !!t && new RegExp(` ${NEGATIVE} (?:[a-z0-9]+ )?${esc(t)} `).test(text);
  };
  const positives = matches.filter(pos);
  if (positives.length === 1) return positives;
  const remaining = matches.filter((m) => !neg(m));
  if (remaining.length === 1) return remaining;
  return matches;
}
