import fs from 'node:fs';
import path from 'node:path';

// GDPSoft v3.13.16: responde nombre del validador desde Recordá/Ficha.
// Instalación conservadora: primero valida ambos archivos y después escribe,
// sin reemplazarlos por versiones de otra fecha.
const root = process.cwd();
const mode = process.argv.includes('--apply') ? 'apply' : process.argv.includes('--check') ? 'check' : null;
if (!mode) {
  console.error('Uso: node scripts/qa/fix-validator-ficha-v3_13_16.mjs --check | --apply');
  process.exit(2);
}
const routePath = path.join(root, 'app/api/assistant/query/route.js');
const priorityPath = path.join(root, 'lib/assistant/validation-profile-priority.mjs');
if (![routePath, priorityPath].every(fs.existsSync)) {
  console.error('Faltan archivos del proyecto. Ejecutá desde la raíz de GDPSoft.');
  process.exit(2);
}
const srcRoute = fs.readFileSync(routePath, 'utf8');
const srcPriority = fs.readFileSync(priorityPath, 'utf8');
let route = srcRoute;
let priority = srcPriority;
function replaceOnce(source, needle, replacement, label) {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error('Estructura inesperada: ' + label + '. No se modificó nada.');
  if (source.indexOf(needle, index + needle.length) >= 0) throw new Error('Coincidencia ambigua: ' + label);
  return source.replace(needle, replacement);
}
try {
  if (!route.includes('key: "VALIDATOR_NAME"')) {
    const location = '  if (!asksTysCode && (';
    const added = `  // Preguntas por el NOMBRE del validador: Recordá/Ficha, no File Search.\n  // La validación de circuitos y las contingencias mantienen su propio enrutamiento.\n  const asksValidatorName = !asksTysCode && /\\bvalidador(?:es)?\\b/.test(q) &&\n    /\\b(?:como se llama|nombre del validador|nombre de validador|cual es el validador|cual validador|que validador|validador (?:usa|utiliza|tiene|de|para))\\b/.test(q) &&\n    !/\\b(?:se cayo|no funciona|no anda|sin servicio|caido|caida|falla|error|rechaza|rechazo|circuito|camara|colegio)\\b/.test(q);\n  const asksWhere = /\\b(?:por donde valido|donde valido|por donde se valida|tipo de validacion|por donde validar)\\b/.test(q);\n  if (asksValidatorName && !asksWhere) {\n    return { field: "validator_name", key: "VALIDATOR_NAME" };\n  }\n\n`;
    route = replaceOnce(route, location, added + location, 'detector de Ficha');
  }
  if (!route.includes('intent.key === "VALIDATOR_NAME"')) {
    route = replaceOnce(route,
      'const hasValidationInfo = intent.key === "VALIDATION_METHOD" && (hasValidator || hasMethod);',
      'const hasValidationInfo = (intent.key === "VALIDATION_METHOD" && (hasValidator || hasMethod)) || intent.key === "VALIDATOR_NAME";',
      'campos del validador');
  }
  if (!route.includes('case "VALIDATOR_NAME":')) {
    route = replaceOnce(route,
      '    case "VALIDATION_METHOD":',
      [
        '    case "VALIDATOR_NAME":',
        '      answer = hasValidator',
        '        ? "El validador de " + data.name + " es " + String(data.validator_name).trim() + "." + (hasMethod ? "\\nPor dónde valida: " + String(data.validator_type).trim() + "." : "")',
        '        : "No hay un nombre de validador confirmado en Recordá/Ficha de " + data.name + ".";',
        '      break;',
        '',
        '    case "VALIDATION_METHOD":',
      ].join('\n'),
      'respuesta de Ficha');
  }
  if (!priority.includes("'VALIDATOR_NAME'")) {
    priority = replaceOnce(priority,
      "profileKey !== 'VALIDATION_METHOD'",
      "!['VALIDATION_METHOD', 'VALIDATOR_NAME'].includes(profileKey)",
      'prioridad sobre circuitos');
  }
  if (!route.includes('key: "VALIDATOR_NAME"') || !route.includes('case "VALIDATOR_NAME":') || !priority.includes("'VALIDATOR_NAME'")) {
    throw new Error('No se verificaron todos los cambios esperados.');
  }
  // Comprobación de sintaxis del fragmento interpolado.
  if (!route.includes('El validador de " + data.name + " es')) throw new Error('Formato del mensaje incompatible.');
  for (const [file, before, after] of [[routePath,srcRoute,route],[priorityPath,srcPriority,priority]]) {
    console.log((before === after ? 'Ya está aplicado: ' : 'Cambio necesario: ') + path.relative(root,file));
  }
  if (mode === 'check') { console.log('Verificación OK. No se escribió ningún archivo.'); process.exit(0); }
  const changes = [[routePath,srcRoute,route],[priorityPath,srcPriority,priority]].filter(([,before,after])=>before!==after);
  for (const [file,before] of changes) {
    const backup = file + '.backup-v3_13_16';
    if (!fs.existsSync(backup)) fs.writeFileSync(backup,before);
  }
  for (const [file,,after] of changes) fs.writeFileSync(file,after);
  console.log('Aplicación OK. Respaldos *.backup-v3_13_16 (NO agregarlos a Git).');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
