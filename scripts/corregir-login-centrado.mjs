import fs from 'node:fs';
import path from 'node:path';

// Corrección quirúrgica del CSS instalado por v3.13.4.
// No cambia los estilos .gdp-app-scale ni las rutas de login.
const projectDir = process.cwd();
const stylesheet = path.join(projectDir, 'app', 'styles.css');
const marker = 'GDPSoft v3.13.4 · Login al 65 % SOLO en escritorio';
const apply = process.argv.includes('--apply');

if (!fs.existsSync(path.join(projectDir, 'package.json')) || !fs.existsSync(stylesheet)) {
  console.error('ERROR: ejecutá este comando en la raíz de gdpsoft-pantech-publicar.');
  process.exit(1);
}
const original = fs.readFileSync(stylesheet, 'utf8');
const start = original.indexOf(marker);
if (start < 0) {
  console.error('ERROR: no se encontró el bloque v3.13.4. No se modificó el CSS.');
  process.exit(1);
}
const head = original.slice(0, start);
const tail = original.slice(start);
const ruleRx = /(@media\s*\(min-width:\s*1024px\)\s*\{\s*\.gdpLoginPage\s*\{)([\s\S]*?)(\}\s*\})/g;
const matches = [...tail.matchAll(ruleRx)];
if (matches.length !== 1 || !/\bzoom:\s*65%\s*;/.test(matches[0][2]) || !/\bmin-height:\s*153\.846154svh\s*;/.test(matches[0][2])) {
  console.error('ERROR: la regla del login no coincide con v3.13.4; no se modificó nada.');
  process.exit(1);
}
const rule = matches[0][0];
const widths = [...matches[0][2].matchAll(/(?:^|\s)width:\s*([^;]+);/g)];
if (widths.length !== 1) {
  console.error('ERROR: la regla tiene una cantidad inesperada de anchos; no se modificó nada.');
  process.exit(1);
}
const width = widths[0][1].trim();
if (width === '100%') {
  console.log('OK: login ya centrado al 65%. No hubo cambios.');
  process.exit(0);
}
if (width !== '153.846154%') {
  console.error(`ERROR: ancho inesperado (${width}); no se modificó nada.`);
  process.exit(1);
}
const updatedRule = rule.replace(/\bwidth:\s*153\.846154%\s*;/, 'width: 100%;');
const fixed = head + tail.replace(rule, updatedRule);
if (!apply) {
  console.log('VISTA PREVIA: se cambiará SOLO width: 153.846154% → width: 100% en .gdpLoginPage.');
  console.log('Se mantiene zoom: 65% y el tamaño 75% de Admin/Sucursal.');
  console.log('Ejecutá: node scripts/corregir-login-centrado.mjs --apply');
  process.exit(0);
}
const backup = path.join(path.dirname(projectDir), 'gdpsoft_styles_antes_login_centrado_' + new Date().toISOString().replace(/[:.]/g, '-') + '.css');
fs.copyFileSync(stylesheet, backup);
fs.writeFileSync(stylesheet, fixed, 'utf8');
console.log('OK: login al 65% centrado, sin desbordamiento por ancho adicional.');
console.log('El resto de la aplicación no fue modificado.');
console.log('Respaldo del CSS:', backup);
