/**
 * GDPSoft v3.13.7.2: corrige tres regresiones puntuales sin sobrescribir
 * archivos enteros ni cambiar el flujo de contextos/circuitos/autenticacion.
 * Ejecutar desde la raiz del repositorio con --apply.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const apply = process.argv.includes('--apply');
const paths = [
  'lib/assistant/socialWorkDetection.js',
  'lib/assistant/prescription-safety.mjs',
  'lib/assistant/internal-procedures.js',
];
const read = (p) => {
  const file = resolve(repo, p);
  if (!existsSync(file)) throw new Error(`No existe ${p}; cancelado sin cambios.`);
  return readFileSync(file, 'utf8');
};

const transpFuncs = `/** Solo una transposición adyacente, sin hacer coincidencia difusa indiscriminada. */
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

`;

function fixSocialDetection(src) {
  let out = src;
  const declaration = 'export function detectSocialWorks({';
  if (!out.includes(declaration)) throw new Error('No se encontro detectSocialWorks(); no modificar.');
  if (!out.includes('function adjacentTransposition(') && !out.includes('function detectUniqueTransposedSocialWork(')) {
    out = out.replace(declaration, transpFuncs + declaration);
  } else if (!out.includes('function adjacentTransposition(') || !out.includes('detectUniqueTransposedSocialWork(')) {
    throw new Error('Deteccion parcial de transposiciones; requiere revision manual.');
  }

  const start = out.indexOf(declaration);
  const before = out.slice(0, start);
  let fn = out.slice(start);
  if (!fn.includes('return detectUniqueTransposedSocialWork(')) {
    const oldTail = /  return\s*\[\s*\.\.\.found\.values\(\),?\s*\];\s*\}/g;
    const matches = [...fn.matchAll(oldTail)];
    if (!matches.length) throw new Error('No se encontro retorno final de detectSocialWorks(); no modificar.');
    const match = matches[matches.length - 1];
    if (fn.slice(match.index + match[0].length).trim()) throw new Error('Retorno final detectSocialWorks no es fin de archivo; revisar.');
    fn = fn.slice(0, match.index) + `  // Solo tras agotar nombre completo, nombre compacto y token exacto.
  if (!found.size) return detectUniqueTransposedSocialWork(text, dictionary);
  return [...found.values()];
}` + fn.slice(match.index + match[0].length);
  }
  return before + fn;
}

function fixPrescriptionSafety(src) {
  const declaration = 'export function asksForPrescriptionChecklist(';
  const start = src.indexOf(declaration);
  if (start < 0) throw new Error('No se encontro asksForPrescriptionChecklist(); no modificar.');
  const end = src.indexOf('\n}', start);
  if (end < 0) throw new Error('No se pudo delimitar asksForPrescriptionChecklist(); no modificar.');
  const block = src.slice(start, end);
  if (block.includes('isSpecificNormativeTopic(question)') || block.includes('GDP_FIX_SUBTEMA_RECETA_31372')) return src;
  const matcher = /(const q\s*=\s*normalize\(question\);)/;
  if (!matcher.test(block)) throw new Error('Funcion checklist con estructura inesperada; no modificar.');
  const guard = `\n  // GDP_FIX_SUBTEMA_RECETA_31372: los anexos no son checklists generales.
  if (/\\b(?:vacun\\w*|antigripal\\w*|diabet\\w*|insulin\\w*|cronic\\w*|tiras\\s+reactivas|pmi|materno\\s+infantil)\\b/.test(q)) return false;`;
  const patched = block.replace(matcher, `$1${guard}`);
  return src.slice(0, start) + patched + src.slice(end);
}

function fixProcedureSource(src) {
  if (src.includes("const source = 'Procedimiento interno aprobado de GDP Salud';")) return src;
  const matcher = /const source\s*=\s*\[rule\.source_document,\s*rule\.source_pages\]\.filter\(Boolean\)\.join\(['\"]\s*·\s*['\"]\);/g;
  const matches = [...src.matchAll(matcher)];
  if (matches.length !== 1) throw new Error('Origen de protocolo no reconocido; no modificar.');
  return src.replace(matcher, `// Documentos/fechas siguen asociados al registro aprobado (procedure_id), no en pantalla.
  const source = 'Procedimiento interno aprobado de GDP Salud';`);
}

try {
  // Preparacion transaccional: validar TODOS los patrones antes de guardar alguno.
  const original = paths.map(read);
  const patched = [
    fixSocialDetection(original[0]),
    fixPrescriptionSafety(original[1]),
    fixProcedureSource(original[2]),
  ];
  const changed = paths.filter((_, i) => original[i] !== patched[i]);
  console.log('Parche GDPSoft v3.13.7.2');
  console.log(changed.length ? `Pendientes (${changed.length}):\n${changed.join('\n')}` : 'Sin cambios pendientes.');
  if (!apply) {
    console.log('\nModo revision. Para aplicar, agregar --apply.');
    process.exit(0);
  }
  for (let i = 0; i < paths.length; i++) {
    if (original[i] === patched[i]) continue;
    const file = resolve(repo, paths[i]);
    const backup = `${file}.backup-v3_13_7_2`;
    if (existsSync(backup)) throw new Error(`Ya existe respaldo ${backup}. No se sobrescribe: resolver manualmente.`);
  }
  for (let i = 0; i < paths.length; i++) {
    if (original[i] === patched[i]) continue;
    const file = resolve(repo, paths[i]);
    copyFileSync(file, `${file}.backup-v3_13_7_2`);
    writeFileSync(file, patched[i], 'utf8');
    console.log(`Actualizado: ${paths[i]}`);
  }
  console.log('Listo. Ejecutar pruebas y build antes del commit.');
} catch (e) {
  console.error(`ERROR: ${e.message}`);
  process.exitCode = 1;
}
