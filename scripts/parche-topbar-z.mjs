// v3.13.102v — Sube la barra superior por encima del chat (menú del usuario y campanita). Idempotente.
//   node scripts/parche-topbar-z.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../components/sucursal/SucursalTopbar.jsx', import.meta.url);
let src = readFileSync(file, 'utf8');
if (src.includes('md:z-[720]')) { console.log('Ya aplicado: no hay nada que cambiar.'); process.exit(0); }
const antes = 'sticky top-0 z-40';
if (!src.includes(antes)) { console.error('No encontré «sticky top-0 z-40» en SucursalTopbar.jsx; avisame.'); process.exit(1); }
writeFileSync(file, src.replace(antes, 'sticky top-0 z-40 md:z-[720]'));
console.log('Listo: SucursalTopbar.jsx actualizado.');
