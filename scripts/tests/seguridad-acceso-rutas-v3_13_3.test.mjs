import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canAccessGDPPage } from '../../lib/server/gdp-page-roles.mjs';
import { gdpApiIsPublic, canAccessGDPApi } from '../../lib/server/gdp-api-access-policy.mjs';

const admin = { active:true, role:'ADMIN', is_super_admin:false, branch_id:null };
const superadmin = { active:true, role:'ADMIN', is_super_admin:true, branch_id:null };
const branch = { active:true, role:'SUCURSAL', is_super_admin:false, branch_id:42 };
const disabled = { ...admin, active:false };
const file=(path)=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('página /admin bloquea sin sesión y sin rol administrativo (comprobación server)',()=>{
 assert.equal(canAccessGDPPage(null,'admin'),false);
 assert.equal(canAccessGDPPage(disabled,'admin'),false);
 assert.equal(canAccessGDPPage(branch,'admin'),false);
 assert.equal(canAccessGDPPage(admin,'admin'),true);
 assert.equal(canAccessGDPPage(superadmin,'admin'),true);
 assert.match(file('proxy.js'),/"\/admin\/:path\*"/);
 assert.match(file('proxy.js'),/canAccessGDPPage\(profile, area\)/);
 assert.match(file('proxy.js'),/loginRedirect\(\)/);
});
test('sucursal no puede usar /admin y admin no puede entrar como sucursal',()=>{
 assert.equal(canAccessGDPPage(admin,'sucursal'),false);
 assert.equal(canAccessGDPPage(branch,'sucursal'),true);
 assert.equal(canAccessGDPPage({ ...branch, branch_id:null },'sucursal'),false);
 assert.match(file('proxy.js'),/"\/sucursal\/:path\*"/);
});
test('sesión y roles se verifican en servidor antes del render',()=>{
 const code=file('proxy.js');
 assert.match(code,/supabaseAdmin\.auth\.getUser\(token\)/);
 assert.match(code,/from\("profiles"\)/);
 assert.match(code,/canAccessGDPPage\(profile, area\)/);
});
test('proxy no libera APIs con acceso a datos salvo endpoints expresamente públicos',()=>{
 assert.equal(gdpApiIsPublic('/api/auth/login'),true);
 assert.equal(gdpApiIsPublic('/api/weather'),true);
 assert.equal(gdpApiIsPublic('/api/admin/qa/catalog'),true);
 assert.equal(gdpApiIsPublic('/api/admin/qa/dashboard'),false);
 for(const path of ['/api/social-works','/api/normatives','/api/social-works/42','/api/admin/actividad','/api/devices','/api/admin/assistant-stats']) assert.equal(gdpApiIsPublic(path),false);
 assert.match(file('proxy.js'),/supabaseAdmin\.auth\.getUser\(token\)/);
});
test('roles en endpoints privados, sin suplantación de perfil mediante profileId',()=>{
 assert.equal(canAccessGDPApi(branch,'/api/admin/actividad','GET'),false);
 assert.equal(canAccessGDPApi(admin,'/api/admin/actividad','GET'),true);
 assert.equal(canAccessGDPApi(admin,'/api/admin/assistant-stats','GET'),false);
 assert.equal(canAccessGDPApi(superadmin,'/api/admin/assistant-stats','GET'),true);
 assert.equal(canAccessGDPApi(branch,'/api/social-works','GET'),true);
 assert.equal(canAccessGDPApi(branch,'/api/social-works/1','PATCH'),false);
 assert.equal(canAccessGDPApi(admin,'/api/social-works/1','PATCH'),true);
 assert.equal(canAccessGDPApi(branch,'/api/normatives/process','GET'),false);
 assert.equal(canAccessGDPApi(branch,'/api/decision-trees','POST'),false);
 assert.equal(canAccessGDPApi(admin,'/api/decision-trees','POST'),true);
});
test('login, refresh y logout sincronizan cookies HttpOnly',()=>{
 assert.match(file('app/api/auth/login/route.js'),/setGDPPageCookies\(response, signInData\.session\)/);
 assert.match(file('app/api/auth/refresh/route.js'),/setGDPPageCookies\(response, data\.session\)/);
 assert.match(file('app/api/auth/logout/route.js'),/clearGDPPageCookies/);
 assert.match(file('components/admin/AdminHeader.jsx'),/\/api\/auth\/logout/);
 assert.match(file('components/sucursal/SucursalTopbar.jsx'),/\/api\/auth\/logout/);
 const code=file('lib/server/gdp-session-cookies.mjs');
 assert.match(code,/httpOnly: true/);
 assert.match(code,/sameSite: "lax"/);
});
