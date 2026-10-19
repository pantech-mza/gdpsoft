import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const target=resolve(root,'lib/assistant/explicit-social-work-protection.mjs');
const asset=resolve(root,'scripts/qa/patch-assets/explicit-social-work-protection-v3_13_18.txt');
const backup=target+'.backup-v3_13_18';
const oldHash='737d62220198fe282ea064a6aa9c1c6512d91fcb1affb3be12e2710f3590bbf2';
const hash=text=>createHash('sha256').update(text.replace(/\r\n/g,'\n')).digest('hex');
const action=process.argv[2];
if(!['--check','--apply'].includes(action)){
  console.error('Uso: node scripts/qa/fix-ooss-nombre-explicito-v3_13_18.mjs --check | --apply');
  process.exit(2);
}
if(!existsSync(target)||!existsSync(asset)){
  console.error('No encuentro el módulo de identidad o los recursos del parche. Extraé el ZIP en la raíz del proyecto.');
  process.exit(1);
}
const current=readFileSync(target,'utf8');
const patched=readFileSync(asset,'utf8');
if(hash(current)===hash(patched)){
  console.log('OK: protección v3.13.18 ya instalada; no se modificó ningún archivo.');
  process.exit(0);
}
if(hash(current)!==oldHash){
  console.error('No se aplicó: el módulo de identidad no coincide con v3.13.9. Para evitar sobrescribir modificaciones posteriores, revisá ese archivo antes de seguir.');
  process.exit(1);
}
if(action==='--check'){
  console.log('Compatible: se puede actualizar el módulo de identidad de v3.13.9 a v3.13.18.');
  process.exit(0);
}
if(existsSync(backup)){
  console.error('Ya existe un respaldo con este nombre. No se realizó ningún cambio para evitar sobrescribirlo.');
  process.exit(1);
}
writeFileSync(backup,current,'utf8');
writeFileSync(target,patched,'utf8');
console.log('Actualizado: lib/assistant/explicit-social-work-protection.mjs');
console.log('Respaldo: lib/assistant/explicit-social-work-protection.mjs.backup-v3_13_18 (NO subir a Git)');
