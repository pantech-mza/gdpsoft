import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const target = path.join(root, 'app', 'styles.css');
const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'login-65.css');
const marker = 'GDPSoft v3.13.4 · Login al 65 % SOLO en escritorio';
const apply = process.argv.includes('--apply');

if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(target)) {
  console.error('ERROR: ejecutá este script en la carpeta raíz del proyecto GDPSoft.');
  process.exit(1);
}
if (!fs.existsSync(source)) {
  console.error('ERROR: no se encontró scripts/login-65.css.');
  process.exit(1);
}
const current = fs.readFileSync(target, 'utf8');
if (!current.includes('.gdpLoginPage') || !current.includes('.gdp-app-scale')) {
  console.error('ERROR: app/styles.css no coincide con los estilos esperados. No se modificó nada.');
  process.exit(1);
}
if (current.includes(marker)) {
  console.log('El ajuste del login al 65 % ya está aplicado. Sin cambios.');
  process.exit(0);
}
if (!apply) {
  console.log('VISTA PREVIA: se agregará SOLO un bloque CSS para .gdpLoginPage (pantallas >=1024 px).');
  console.log('Se conserva intacta la regla .gdp-app-scale de Admin y Sucursal.');
  console.log('Ejecutá: node scripts/aplicar-login-65.mjs --apply');
  process.exit(0);
}
const backupDir = path.dirname(root);
const backupFile = path.join(backupDir, 'gdpsoft_styles_antes_login65_' + new Date().toISOString().replace(/[:.]/g, '-') + '.css');
fs.copyFileSync(target, backupFile);
const css = fs.readFileSync(source, 'utf8');
fs.writeFileSync(target, current.trimEnd() + '\n\n' + css.trimEnd() + '\n', 'utf8');
console.log('OK: login al 65 % en escritorio. Sin cambios en Admin, Sucursal o autenticación.');
console.log('Respaldo previo:', backupFile);
console.log('Ahora ejecutá: npm run build');
