import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const filepath = path.join(base, 'app/api/admin/procedimientos/route.js');
const source = fs.readFileSync(filepath, 'utf8')
  .replace(/^import .*?;\s*$/gm, '')
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');

function boot({status = 200, actor = {id: 'admin-123'}, count = 14} = {}) {
  let queries = 0;
  const updates = [];
  const fakeRows = Array.from({length: count},(_,i)=>({id:i+1,code:`GDP-${i+1}`,status:'DRAFT'}));
  const db = { from(table) {
    assert.equal(table,'internal_procedures');
    queries++;
    const builder = {
      select() {return this;}, order() {return this;},
      limit() {return Promise.resolve({data:fakeRows,error:null});},
      eq() {return this;}, maybeSingle() {return Promise.resolve({data:{id:1,status:'DRAFT',source_document:'Fuente',question:'Pregunta valida',answer:'Respuesta aprobada'},error:null});},
      update(payload) {updates.push(payload);return this;},
      then(resolve) {return Promise.resolve({error:null}).then(resolve);}
    };
    return builder;
  }};
  const requireAdminActor = async () => status===200 ? {status:200, actor} : {status, actor:null, error:status===401?'Sesion vencida':'Permiso denegado'};
  const jsonError = (error,statusCode=400) => Response.json({ok:false,error},{status:statusCode});
  const code = `${source}\n({GET,PATCH})`;
  const funcs=vm.runInNewContext(code,{supabaseAdmin:db,requireAdminActor,jsonError,Response,Date,Number,String,Array,console});
  return {...funcs,stats:()=>({queries,updates})};
}

test('GET con sesion vencida devuelve 401 para activar renovacion del cliente',async()=>{
  const {GET,stats}=boot({status:401});
  const r=await GET(new Request('http://localhost/api/admin/procedimientos'));
  assert.equal(r.status,401);assert.equal(stats().queries,0);
});
test('GET con rol sucursal no consulta registros privados',async()=>{
  const {GET,stats}=boot({status:403});
  const r=await GET(new Request('http://localhost/api/admin/procedimientos'));
  assert.equal(r.status,403);assert.equal(stats().queries,0);
});
test('GET con Admin lista los 14 procedimientos',async()=>{
  const {GET,stats}=boot(); const r=await GET(new Request('http://localhost/api/admin/procedimientos'));
  assert.equal(r.status,200);assert.equal((await r.json()).procedures.length,14);assert.equal(stats().queries,1);
});
test('GET con Superadmin funciona al igual que Admin',async()=>{
  const {GET}=boot({actor:{id:'superadmin-123',is_super_admin:true}});
  const r=await GET(new Request('http://localhost/api/admin/procedimientos'));
  assert.equal(r.status,200);
});
test('PATCH requiere permisos aun cuando la solicitud tenga confirmacion',async()=>{
  const {PATCH,stats}=boot({status:403});
  const r=await PATCH(new Request('http://localhost/api/admin/procedimientos',{method:'PATCH',body:JSON.stringify({id:1,action:'approve',confirmation:'REVISADO'})}));
  assert.equal(r.status,403);assert.equal(stats().queries,0);
});
test('PATCH Admin aprobado conserva el id del actor y exige revision',async()=>{
  const {PATCH,stats}=boot();
  const req=payload=>new Request('http://localhost/api/admin/procedimientos',{method:'PATCH',body:JSON.stringify(payload)});
  const first=await PATCH(req({id:1,action:'approve'}));assert.equal(first.status,400);
  const second=await PATCH(req({id:1,action:'approve',confirmation:'REVISADO'}));assert.equal(second.status,200);
  assert.equal(stats().updates[0].approved_by,'admin-123');
});
