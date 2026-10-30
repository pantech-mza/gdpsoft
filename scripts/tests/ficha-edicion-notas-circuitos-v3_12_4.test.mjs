import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isAccessInstruction,legacyNoteCandidate } from "../../lib/social-works/legacy-notes.mjs";
import {resolveDeclaredCircuitPolicy} from "../../lib/operations/camara-colegio-policy.mjs";
const admin=fs.readFileSync(new URL("../../app/admin/obras-sociales/[id]/page.jsx",import.meta.url),"utf8");
const api=fs.readFileSync(new URL("../../app/api/social-works/[id]/route.js",import.meta.url),"utf8");
const branch=fs.readFileSync(new URL("../../app/sucursal/obras-sociales/[id]/page.jsx",import.meta.url),"utf8");
const noteApi=fs.readFileSync(new URL("../../app/api/social-works/[id]/notes/route.js",import.meta.url),"utf8");
test("Editor conectado a acción y guardado autenticado",()=>{
  assert.match(admin,/onEdit=\{\(\)=>setEditFichaOpen\(true\)\}/);
  assert.match(admin,/onAction=\{onEdit\}/);
  assert.match(api,/requireAdminActor\(request\)/);
  assert.match(api,/"validator_name"/);
  assert.match(api,/"validator_type"/);
});
test("Observaciones diferenciadas para sucursal y administrador",()=>{
  assert.match(admin,/FichaNotesPanel socialWorkId=\{socialWork.id\} editable/);
  assert.match(branch,/FichaNotesPanel socialWorkId=\{socialWork.id\}/);
  assert.match(noteApi,/actorFromRequest\(request\)/);
  assert.match(noteApi,/adminActor\(actor\)/);
  assert.match(noteApi,/searchParams.get\("reveal"\)/); // protected fetch dedicated
  assert.match(noteApi,/body:row.kind === "ACCESS" \? null/);
});
test("Clasificación de información de acceso",()=>{
  assert.equal(isAccessInstruction("Usuario: operador, clave: ********"),true);
  assert.equal(isAccessInstruction("Receta válida 30 días, llevar credencial del afiliado"),false);
});
test("Importación usa ID legado para emparejar y PK propia para escribir",()=>{
  const c=legacyNoteCandidate({id:60,plan:"40-70-100",recipe_type:"Común",recipe_validity:30,rp:2,observations:"Verificar autorizaciones."},
    {id:35,id_soft:60,plan:"40-70-100",recipe_type:"Común",recipe_validity_days:30,rp:2});
  assert.equal(c.social_work_id,35);assert.equal(c.legacy_id,60);
  assert.equal(c.kind,"GENERAL");assert.equal(c.review_status,"PENDING");
});
test("Provincia ART: Cámara directa; sucursales piloto respetan reglas",()=>{
  const p=resolveDeclaredCircuitPolicy({branchName:"DP1",socialWorkName:"PROVINCIA ART"});
  assert.equal(p.mode,"DIRECT");
  assert.equal(resolveDeclaredCircuitPolicy({branchName:"DP1",socialWorkName:"OSTES"}).mode,"CAMARA_COLEGIO");
  assert.equal(resolveDeclaredCircuitPolicy({branchName:"Libertad",socialWorkName:"FEDERACION PATRONAL ART"}).mode,"DIRECT");
  assert.equal(resolveDeclaredCircuitPolicy({branchName:"San Francisco",socialWorkName:"OSSEG"}).mode,"DIRECT");
  assert.equal(resolveDeclaredCircuitPolicy({branchName:"DP4",socialWorkName:"AMPES ASISTIR"}).after,"20:00"); // Administración 30/10: DP4 la recibe después de las 20 h
  assert.equal(resolveDeclaredCircuitPolicy({branchName:"DP1",socialWorkName:"OSDEPYM"}).mode,"REGULAR_VALIDATOR");
});
