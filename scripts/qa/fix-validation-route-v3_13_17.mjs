import fs from 'node:fs';
import path from 'node:path';

// GDPSoft v3.13.17 — prioridad estable de Recordá/Ficha para medio/nombre validador.
// No reemplaza archivos completos; verifica los anclajes antes de escribir y guarda respaldos.
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : null;
if (!mode) { console.error('Uso: node scripts/qa/fix-validation-route-v3_13_17.mjs --check | --apply'); process.exit(2); }
const root = process.cwd();
const filename = path.join(root, 'app/api/assistant/query/route.js');
if (!fs.existsSync(filename)) { console.error('Falta app/api/assistant/query/route.js. Ejecutá desde la raíz GDPSoft.'); process.exit(2); }
const original = fs.readFileSync(filename, 'utf8');
let modified = original;
const pin = '// GDPSoft v3.13.17: prioridades fijas de Ficha para nombre y medio de validación.';
function replaceUnique(a, b, why) {
  const first = modified.indexOf(a);
  if (first === -1 || modified.indexOf(a, first + a.length) !== -1) throw new Error('No se encontró anclaje único: ' + why + '. No se modificó nada.');
  modified = modified.replace(a,b);
}
try {
  if (!modified.includes(pin)) {
    const oldDetector = `  const asksWhere = /\\b(?:por donde valido|donde valido|por donde se valida|tipo de validacion|por donde validar)\\b/.test(q);
  if (asksValidatorName && !asksWhere) {
    return { field: "validator_name", key: "VALIDATOR_NAME" };
  }

  if (!asksTysCode && (
    /\\btys\\b/.test(q) ||
    containsAny(q, ["por donde valido", "por dónde valido", "tipo de validacion", "tipo de validación", "por donde se valida", "por dónde se valida", "que validador", "qué validador"])
  )) {
    return { field: "validator_type", key: "VALIDATION_METHOD" };
  }`;
    const newDetector = `  ${pin}
  // Sólo el nombre del validador y su medio (TYS, etc.) vienen de social_works.
  // "por dónde valida" y "por dónde valido" son consultas sobre la Ficha,
  // no direcciones físicas, documentación normativa ni circuitos de sucursal.
  const asksWhere = /\\b(?:por donde (?:valido|valida|validamos|validan|validar|se valida)|donde (?:valido|valida|validamos|validan|validar|se valida)|en que (?:sistema|plataforma|medio) (?:se )?valida|tipo de validacion|medio de validacion)\\b/.test(q);
  const isValidationProblem = /\\b(?:se cayo|caido|caida|no funciona|no anda|falla|fallando|error|rechazo|rechaza|fuera de servicio|sin servicio|no puedo validar|no valida|no me valida)\\b/.test(q);
  if (asksValidatorName && !asksWhere) {
    return { field: "validator_name", key: "VALIDATOR_NAME" };
  }
  // Sin dato cargado en Ficha: informar que falta, NUNCA ir a File Search.
  if (!asksTysCode && !isValidationProblem && (asksWhere || /\\btys\\b/.test(q) || containsAny(q, ["que validador", "qué validador"]))) {
    return { field: "validator_type", key: "VALIDATION_METHOD" };
  }`;
    replaceUnique(oldDetector,newDetector,'detector de medio de validación (v3.13.16)');
    const oldFound = 'const hasValidationInfo = (intent.key === "VALIDATION_METHOD" && (hasValidator || hasMethod)) || intent.key === "VALIDATOR_NAME";';
    const newFound = `// Campos de validador: la Ficha es autoritativa aun cuando no esté completo el dato.
  // Una ausencia jamás habilita una búsqueda normativa como sustituto.
  const hasValidationInfo = ["VALIDATION_METHOD", "VALIDATOR_NAME"].includes(intent.key);`;
    replaceUnique(oldFound,newFound,'barrera de fallback normativo');
    const oldLine = 'hasMethod ? `¿Por dónde valida?: ${String(data.validator_type).trim()}.` : "¿Por dónde valida?: sin dato confirmado en Ficha.",';
    const newLine = 'hasMethod ? `Por dónde valida: ${String(data.validator_type).trim()}.` : "Por dónde valida: sin dato confirmado en Recordá/Ficha.",';
    replaceUnique(oldLine,newLine,'respuesta breve de Ficha');
  }
  if (!modified.includes(pin) || !modified.includes('const hasValidationInfo = ["VALIDATION_METHOD", "VALIDATOR_NAME"].includes(intent.key);')) throw new Error('La regla de prioridad no quedó verificada.');
  console.log(original===modified?'Ya aplicado: sin modificaciones necesarias':'Listo para actualizar: app/api/assistant/query/route.js');
  if (mode==='check') { console.log('CHECK OK (sin escribir archivos).'); process.exit(0); }
  if (original !== modified) {
    const backup = filename + '.backup-v3_13_17';
    if (!fs.existsSync(backup)) fs.writeFileSync(backup,original);
    fs.writeFileSync(filename,modified);
    console.log('Actualizado; respaldo creado: '+path.relative(root,backup));
  }
  console.log('OK — La prioridad de Recordá/Ficha queda bloqueada para medio y nombre del validador.');
} catch(e) { console.error('Abortado: '+e.message); process.exitCode=1; }
