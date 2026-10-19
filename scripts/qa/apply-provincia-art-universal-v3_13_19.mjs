/** Instalador incremental v3.13.19. --check o --apply (Windows CMD). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const self = path.dirname(fileURLToPath(import.meta.url));
const routeFile = path.join(root, 'app/api/assistant/query/route.js');
const moduleFile = path.join(root, 'lib/assistant/common-authorization-rules.mjs');
const assetFile = path.join(self, 'patch-assets/authorization-shared-rule-v3_13_19.mjs.txt');
const marker = '// v3.13.19: reglas documentales comunes de autorización por importes (TODAS las sucursales).';
const anchor = '    const detectedOperationIntent = detectOperationIntent(question);';
const importLine = 'import { resolveCommonAuthorizationAmount } from "../../../../lib/assistant/common-authorization-rules.mjs";';
const block = `${marker}\n    // Separar autorizaciones POR IMPORTE de circuitos Cámara/Colegio.\n    // La regla es común a ambas normativas y a todas las sucursales.\n    if (isAuthorizationAmountQuestionForCommonRule(question)) {\n      const ruleWorkName = await getSocialWorkName(socialWorkId);\n      const commonAuthorization = resolveCommonAuthorizationAmount({question, socialWorkName: ruleWorkName});\n      if (commonAuthorization) {\n        const answer = commonAuthorization.answer;\n        const elapsedMs = Date.now() - startedAt;\n        await logCurrentQuery({branchId, socialWorkId, question, answer,\n          source: "DOCUMENTED_COMMON_NORMATIVE", route: "COMMON_AUTHORIZATION_LIMITS", found:true,\n          elapsedMs, usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n        return Response.json({ok:true,question,answer,source:"DOCUMENTED_COMMON_NORMATIVE",\n          route:"COMMON_AUTHORIZATION_LIMITS",found:true,rule_id:commonAuthorization.ruleId,\n          context:responseContext,elapsed_ms:elapsedMs,usage:{input_tokens:0,output_tokens:0,total_tokens:0}});\n      }\n    }\n\n`;
// Gate inexpensive and independent of imported resolver.
const gate = 'const isAuthorizationAmountQuestionForCommonRule = (question) => /(?:autoriz|\\btopes?\\b|\\blimites?\\b|\\bimportes?\\b|\\bprecios?\\b|\\bmontos?\\b|\\$\\s*\\d|\\b20\\s*000\\b|\\b80\\s*000\\b)/i.test(String(question || "").normalize("NFD").replace(/[\\u0300-\\u036f]/g,""));';
function install() {
  if (!fs.existsSync(routeFile)) throw Error(`No existe ${routeFile}`);
  if (!fs.existsSync(assetFile)) throw Error(`No existe ${assetFile}. Descomprimí el ZIP completo.`);
  const original = fs.readFileSync(routeFile, 'utf8');
  const already = original.includes(marker);
  if (!already && !original.includes(anchor)) throw Error('La ruta query/route.js es distinta de la versión esperada. No se modificó nada.');
  if (original.includes(marker) && !original.includes(importLine)) throw Error('Instalación previa incompleta: falta import. No se modifica nada.');
  if (!already && original.includes(importLine)) throw Error('Import previo inesperado. No se modifica nada.');
  const moduleText = fs.readFileSync(assetFile, 'utf8');
  const action = process.argv.includes('--apply') ? 'apply' : 'check';
  if (action === 'check') {
    console.log(already ? 'YA INSTALADO: query/route.js' : 'LISTO PARA INSTALAR: query/route.js');
    console.log(`Módulo: ${fs.existsSync(moduleFile) ? 'existe' : 'se creará'}`);
    return;
  }
  if (already) {
    if (!fs.existsSync(moduleFile)) throw Error('Falta módulo de regla en instalación previa; no se modifica nada.');
    console.log('Sin cambios: parche ya instalado.'); return;
  }
  const headAnchor = 'export const runtime =';
  const headIndex = original.indexOf(headAnchor);
  if (headIndex < 0) throw Error('Cabecera del router no reconocida.');
  const patchedHeader = original.slice(0, headIndex) + importLine + '\n' + gate + '\n\n' + original.slice(headIndex);
  const patched = patchedHeader.replace(anchor, block + anchor);
  if (!patched.includes(marker)) throw Error('No se pudo insertar el bloque.');
  fs.mkdirSync(path.dirname(moduleFile), {recursive:true});
  // Respaldar antes de modificar; nunca tocar .env ni otros módulos.
  fs.writeFileSync(`${routeFile}.backup-v3_13_19`, original);
  fs.writeFileSync(moduleFile, moduleText);
  fs.writeFileSync(routeFile, patched);
  console.log('Actualizado: app/api/assistant/query/route.js');
  console.log('Creado: lib/assistant/common-authorization-rules.mjs');
  console.log('Respaldo: app/api/assistant/query/route.js.backup-v3_13_19');
}
try { install(); } catch(e) { console.error(`ERROR: ${e.message}`); process.exitCode=1; }
