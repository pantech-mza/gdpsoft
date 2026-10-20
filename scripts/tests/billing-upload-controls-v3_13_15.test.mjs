import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync('components/social-works/ResourcesPanel.jsx','utf8');
const api=readFileSync('app/api/social-works/[id]/resources/route.js','utf8');
const upload=readFileSync('app/api/social-works/[id]/resources/upload/route.js','utf8');
test('Administración muestra botón de subida arriba y formulario siempre visible',()=>{
  assert.match(ui,/editable && kind === "billing"/);
  assert.match(ui,/uploadFormRef\.current\?\.scrollIntoView/);
  assert.match(ui,/Seleccionar archivo/);
  assert.match(ui,/Ningún archivo seleccionado/);
  assert.match(ui,/type="submit"[^>]*className=\{primary\}/);
  assert.match(ui,/Subir archivo/);
});
test('Formulario realmente utiliza uploadBillingMaterial y no FormData vía Vercel',()=>{
  assert.match(ui,/await uploadBillingMaterial\(\);/);
  assert.doesNotMatch(ui,/form\.set\("file", fileData\.file\)/);
  assert.match(ui,/fetch\(prepare\.signedUrl/);
  assert.match(ui,/file\.size > 100 \* 1024 \* 1024/);
  assert.match(upload,/const MAX_BYTES = 100 \* 1024 \* 1024/);
});
test('Admin puede borrar materiales publicados con confirmación explícita',()=>{
  assert.match(ui,/Eliminar archivo/);
  assert.match(ui,/Eliminar definitivamente/);
  assert.match(ui,/body: JSON\.stringify\(\{ kind: "billing", id: f\.id \}\)/);
  assert.match(api,/context\(request, params, true\)/);
  assert.match(api,/if \(b\.kind === "billing"\)/);
  assert.match(api,/\.remove\(\[row\.storage_path\]\)/);
  assert.match(api,/from\("social_work_billing_files"\)\.delete\(\)/);
});
test('El formulario de edición continúa restringido a Admin y no altera Contactos',()=>{
  assert.match(ui,/\{editable && kind === "billing" && \(/);
  assert.match(ui,/\{editable && kind === "contact" && editing && \(/);
  assert.match(api,/writer: Boolean\(p\.is_super_admin \|\| p\.role === "ADMIN"\)/);
});
