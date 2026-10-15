import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
const read=(p)=>fs.readFileSync(new URL('../../'+p, import.meta.url), 'utf8');
const bot=read('app/api/assistant/query/route.js');
const list=read('app/api/social-works/route.js');
const detail=read('app/api/social-works/[id]/route.js');
const branch=read('app/sucursal/obras-sociales/[id]/page.jsx');
const admin=read('app/admin/obras-sociales/[id]/page.jsx');
const migration=read('supabase/migrations/20261015_social_work_validator_profile.sql');
const importer=read('scripts/qa/sync-ficha-validadores.mjs');
test('La API de obras sociales muestra validador y por dónde valida',()=>{
  for(const source of [list,detail]) assert.match(source,/validator_name,\s*validator_type,/);
});
test('Ambos roles muestran ambos campos en Recordá/Ficha',()=>{
  for(const source of [admin,branch]) {
    assert.match(source,/Validador/);
    assert.match(source,/¿Por dónde valida\?/);
    assert.match(source,/socialWork\.validator_type/);
    assert.match(source,/socialWork\.validator_name/);
  }
});
test('El bot diferencia el código TYS del medio de validación',()=>{
  assert.match(bot,/asksTysCode/);
  assert.match(bot,/VALIDATION_METHOD/);
  assert.match(bot,/validator_name,\s*validator_type,/);
  assert.match(bot,/Validador: \$\{String\(data\.validator_name\)/);
});
test('Si el bot resuelve circuito por sucursal, no pierde el dato de ficha',()=>{
  assert.match(bot,/operationIntent\.operationType === "VALIDATION"/);
  assert.match(bot,/Si el circuito indicado anteriormente difiere de la ficha/);
});
test('SQL agrega columnas de forma no destructiva',()=>{
  assert.match(migration,/ADD COLUMN IF NOT EXISTS validator_name text/);
  assert.match(migration,/ADD COLUMN IF NOT EXISTS validator_type text/);
  assert.doesNotMatch(migration,/\bTRUNCATE\b|\bDELETE FROM\b/i);
});
test('Sincronizador no sobrescribe valores existentes y bloquea secretos',()=>{
  assert.match(importer,/sensitive\(value\)/);
  assert.match(importer,/if \(!empty\(row\[col\]\)\)/);
  assert.match(importer,/if \(!apply\) continue/);
  assert.match(importer,/--confirm=validadores-ficha/);
});
