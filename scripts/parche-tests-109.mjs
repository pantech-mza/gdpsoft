// GDPSoft v3.13.109 — actualiza (si hace falta) un test viejo que verificaba que la ruta llamara a suggestSocialWorks(name, …). Idempotente: si ya están actualizados o no encuentra el texto, no toca nada.
// Uso:  node scripts/parche-tests-109.mjs
import fs from 'node:fs';
const EDITS = [
  ['scripts/tests/sugerencia-obra-social-v3_13_30.test.mjs',
    "assert.match(src, /suggestSocialWorks\\(name,/);",
    "assert.match(src, /suggestWithInactive\\(name,/);"],
];
let changed = 0;
for (const [file, from, to] of EDITS) {
  if (!fs.existsSync(file)) { console.log('no existe (se omite):', file); continue; }
  const src = fs.readFileSync(file, 'utf8');
  const crlf = src.includes('\r\n');
  const norm = (t) => (crlf ? t.replace(/\n/g, '\r\n') : t);
  if (src.includes(norm(to))) { console.log('ya actualizado:', file); continue; }
  if (!src.includes(norm(from))) { console.log('texto no encontrado (revisar a mano):', file); continue; }
  fs.writeFileSync(file, src.replace(norm(from), () => norm(to)));
  console.log('actualizado:', file); changed += 1;
}
console.log(changed ? `Listo: ${changed} cambio(s).` : 'Sin cambios.');
