import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const CSS_PATH = path.join(ROOT, 'app', 'styles.css');
const PATCH_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'login-compact.css');
const MARKER = 'GDPSoft · Login compacto y responsive (14/10/2026)';
const apply = process.argv.includes('--apply');

if (!fs.existsSync(CSS_PATH) || !fs.existsSync(path.join(ROOT, 'package.json'))) {
  console.error('ERROR: ejecutalo desde la raíz del proyecto GDPSoft.');
  process.exit(1);
}
if (!fs.existsSync(PATCH_PATH)) {
  console.error('ERROR: falta scripts/login-compact.css junto al instalador.');
  process.exit(1);
}

const current = fs.readFileSync(CSS_PATH, 'utf8');
if (!current.includes('.gdpLoginPage') || !current.includes('.gdpLoginCard')) {
  console.error('ERROR: no se encontraron los estilos del login. No se modificó nada.');
  process.exit(1);
}
if (current.includes(MARKER)) {
  console.log('El parche ya está instalado. No se realizó ningún cambio.');
  process.exit(0);
}
if (!apply) {
  console.log('Simulación: se añadirán estilos compactos SOLO para el login en app/styles.css.');
  console.log('Para aplicar: node scripts/aplicar-login-compacto.mjs --apply');
  process.exit(0);
}

const safeName = path.basename(ROOT).replace(/[^a-zA-Z0-9._-]/g, '_');
const time = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.resolve(ROOT, '..', `${safeName}_styles_backup_${time}.css`);
fs.copyFileSync(CSS_PATH, backup);

const patch = fs.readFileSync(PATCH_PATH, 'utf8');
const output = current.replace(/\s*$/, '') + '\n\n' + patch.trim() + '\n';
fs.writeFileSync(CSS_PATH, output, 'utf8');
console.log('OK: Login compacto instalado en app/styles.css');
console.log('Respaldo fuera del repositorio:', backup);
console.log('Ahora ejecutá: npm run build');
