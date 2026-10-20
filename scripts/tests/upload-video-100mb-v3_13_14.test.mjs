import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('app/api/social-works/[id]/resources/upload/route.js','utf8');
const ui=readFileSync('components/social-works/ResourcesPanel.jsx','utf8');
test('100 MB en backend y navegador',()=>{
  assert.match(api,/const MAX_BYTES = 100 \* 1024 \* 1024;/);
  assert.match(api,/hasta 100 MB/);
  assert.match(ui,/file\.size > 100 \* 1024 \* 1024/);
  assert.match(ui,/máx\. 100 MB/);
});
test('video sube por URL firmada, no por body de Vercel',()=>{
  assert.match(api,/createSignedUploadUrl\(path\)/);
  assert.match(ui,/fetch\(prepare\.signedUrl/);
  assert.doesNotMatch(ui,/form\.set\("file", fileData\.file\)/);
});
test('se conserva autenticación y verificaciones antes de publicar',()=>{
  assert.match(api,/supabaseAdmin\.auth\.getUser\(token\)/);
  assert.match(api,/profile\.is_super_admin \|\| profile\.role === "ADMIN"/);
  assert.match(api,/claim\.swId !== ctx\.swId/);
  assert.match(api,/Number\(object\.metadata\?\.size\) !== claim\.bytes/);
});
