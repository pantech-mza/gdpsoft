import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * GDPSoft v3.13.7.1: recuperar exports que v3.13.7 omitió del ZIP.
 * Solo agrega funciones faltantes en lib/assistant/prescription-safety.mjs.
 * No reemplaza ningún archivo completo; conserva el código instalado.
 */
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const target = resolve(process.cwd(), 'lib/assistant/prescription-safety.mjs');
if (!existsSync(target)) {
  console.error('No encontré lib/assistant/prescription-safety.mjs. Ejecutá este script desde la raíz de GDPSoft.');
  process.exit(1);
}
const source = readFileSync(target, 'utf8');
const additions = [];

const missingFieldDetector = `
/** Consulta por una receta con datos faltantes, no sobre el circuito de la sucursal. */
export function isPrescriptionMissingFieldQuestion(question = '') {
  const q = String(question).normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
    .toLowerCase().replace(/\\s+/g, ' ').trim();
  if (!/\\b(receta|recetas|recetario|prescripcion)\\b/.test(q)) return false;
  const missing = /\\b(sin|falta|faltan|no tiene|no figura|no aparece|carece de)\\s+(?:(?:la|el|una|un|los|las)\\s+)?(?:fecha(?: de prescripcion)?|firma|sello|matricula|diagnostico|dni|numero de afiliado|datos del afiliado)\\b/.test(q);
  if (!missing) return false;
  return /\\b(puedo|podemos|recib|acept|dispens|valid|permit|debo|hago|corresponde|rechaz)\\w*\\b/.test(q);
}
`;
const normativeQuestion = `
/** Conserva la pregunta sobre el requisito faltante en la normativa de la OOSS confirmada. */
export function buildMissingFieldNormativeQuestion({question, socialWorkName} = {}) {
  const name = String(socialWorkName || '').trim();
  if (!name) return null;
  return \`Para la obra social \${name} (contexto activo), evaluá esta consulta: "\${question}". \` +
    \`Buscá si la normativa vigente de \${name} exige el dato faltante mencionado \` +
    \`y si especifica cómo proceder cuando no está. Respondé únicamente sobre \` +
    \`esa omisión; NO confundas aptitud de la receta con circuito Cámara/Colegio. \` +
    \`Si no existe respaldo documental, no autorices la recepción y derivá para revisión.\`;
}
`;

for (const [name, block] of [
  ['isPrescriptionMissingFieldQuestion', missingFieldDetector],
  ['buildMissingFieldNormativeQuestion', normativeQuestion],
]) {
  const declared = new RegExp(`\\b(?:function|const|let|var)\\s+${name}\\b`).test(source);
  const exported = new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${name}\\b`).test(source)
    || new RegExp(`\\bexport\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`, 's').test(source);
  if (exported) {
    console.log(`OK: ${name} ya está exportada.`);
  } else if (declared) {
    console.error(`Hay una implementación local de ${name} que no está exportada. Se detiene para evitar duplicarla.`);
    process.exitCode = 1;
  } else {
    additions.push(block);
    console.log(`Falta: ${name}`);
  }
}
if (process.exitCode) process.exit(process.exitCode);
if (additions.length === 0) {
  console.log('Sin cambios: ambas funciones ya existen.');
} else if (!apply) {
  console.log('Simulación: no se modificó ningún archivo. Repetí con --apply para aplicar.');
} else {
  const backup = `${target}.backup-v3_13_7_1`;
  if (!existsSync(backup)) copyFileSync(target, backup);
  writeFileSync(target, source.trimEnd() + '\n' + additions.join('') + '\n', 'utf8');
  console.log(`Actualizado: ${target}`);
  console.log(`Respaldo: ${backup}`);
}
