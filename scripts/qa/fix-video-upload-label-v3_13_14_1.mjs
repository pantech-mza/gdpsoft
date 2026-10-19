import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve('components/social-works/ResourcesPanel.jsx');
const apiFile = resolve('app/api/social-works/[id]/resources/upload/route.js');
const apply = process.argv.includes('--apply');
if (!existsSync(file) || !existsSync(apiFile)) {
  console.error('ABORTADO: no encontré los archivos de subida de material de facturación.');
  process.exit(1);
}
const source = readFileSync(file, 'utf8');
const api = readFileSync(apiFile, 'utf8');
if (!source.includes('file.size > 100 * 1024 * 1024') || !api.includes('const MAX_BYTES = 100 * 1024 * 1024;')) {
  console.error('ABORTADO: primero debe estar instalado v3.13.14 con límite de 100 MB en navegador y servidor.');
  process.exit(1);
}
const lines = source.split(/\r?\n/);
const index = lines.findIndex(line => /PDF\s+o\s+video\s+MP4\s*\/\s*WebM/i.test(line));
if (index < 0 || !lines.slice(index+1,index+6).some(line=>/type="file"/.test(line))) {
  console.error('ABORTADO: no reconocí la etiqueta vinculada al selector de archivos. No modificaré otra sección.');
  process.exit(1);
}
const line = lines[index];
const replacement = line.replace(/PDF\s+o\s+video\s+MP4\s*\/\s*WebM[^<>]*/i, 'PDF o video MP4/WebM (máx. 100 MB)');
if (replacement === line) {
  console.log('Sin cambios: la etiqueta ya indica 100 MB.');
  process.exit(0);
}
lines[index] = replacement;
const out = lines.join(source.includes('\r\n') ? '\r\n' : '\n');
if (!out.includes('PDF o video MP4/WebM (máx. 100 MB)')) {
  console.error('ABORTADO: no se pudo verificar la leyenda final.');
  process.exit(1);
}
console.log('Antes:',line.trim());
console.log('Después:',replacement.trim());
if (!apply) {
  console.log('Verificación OK. Ejecutá --apply para guardar el cambio.');
} else {
  const backup = `${file}.backup-v3_13_14_1`;
  if (!existsSync(backup)) writeFileSync(backup, source);
  writeFileSync(file, out);
  console.log('Actualizado: components/social-works/ResourcesPanel.jsx');
  console.log('Respaldo:', backup);
}
