import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const route = readFileSync("app/api/social-works/[id]/resources/upload/route.js", "utf8");
const client = readFileSync("components/social-works/ResourcesPanel.jsx", "utf8");
test("videos se suben directamente a Storage, sin enviarse a Vercel", () => {
  assert.match(route, /createSignedUploadUrl\(path\)/);
  assert.match(client, /fetch\(prepare\.signedUrl/);
  assert.match(client, /method:\s*"PUT"/);
  assert.doesNotMatch(client, /form\.set\("file", fileData\.file\)/);
});
test("la firma temporal vincula archivo, actor y obra social", () => {
  assert.match(route, /createHmac\("sha256"/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /claim\.actorId !== ctx\.actorId/);
  assert.match(route, /claim\.swId !== ctx\.swId/);
});
test("solo Admin y Superadmin pueden generar tickets", () => {
  assert.match(route, /profile\.is_super_admin \|\| profile\.role === "ADMIN"/);
  assert.match(route, /supabaseAdmin\.auth\.getUser/);
});
test("100 MB y tipos de archivo limitados también en servidor", () => {
  assert.match(route, /100 \* 1024 \* 1024/);
  assert.match(route, /"\.pdf": "application\/pdf"/);
  assert.match(route, /"\.mp4": "video\/mp4"/);
  assert.match(route, /"\.webm": "video\/webm"/);
});
test("no registra en BD hasta comprobar objeto, tamaño y MIME", () => {
  assert.match(route, /if \(!object\) return reply/);
  assert.match(route, /Number\(object\.metadata\?\.size\) !== claim\.bytes/);
  assert.ok(route.indexOf('action === "finalize"') < route.indexOf('from("social_work_billing_files").insert'));
});
