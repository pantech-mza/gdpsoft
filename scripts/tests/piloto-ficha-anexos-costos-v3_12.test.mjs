import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import {scopeLinkedNormatives, getLinkedCurrentNormativeScope, isSpecificNormativeTopic} from '../../lib/assistant/linked-normatives.mjs';
import {formatMoneyUsd} from '../../lib/assistant/format-money-usd.mjs';
import {matchesLegacyFicha, sensitiveText, invalidValidator} from '../../lib/assistant/ficha-legacy-match.mjs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const query=read('app/api/assistant/query/route.js');
const image=read('app/api/assistant/analyze-image/route.js');
const cost=read('app/admin/openai/page.jsx');
const importer=read('scripts/qa/sync-ficha-unificada.mjs');
const old={id:60,names:'OSDEPYM - CAMARA Y COLEGIO',plan:'40-70-100',recipe_type:'Común y telemedicina',recipe_validity:30,letterhead:'Opcional',rp:2,diagnosis:'Sí',monodrug:'Sí',commercial_name:'opcional',substitution:'Si Requiere'};
const current={id:35,id_soft:60,name:'OSDEPYM',plan:'40-70-100',recipe_type:'Común y telemedicina',recipe_validity_days:30,letterhead:'Opcional',rp:2,diagnosis:'Si',monodrug:'Si',commercial_name:'Opcional',substitution:'Si requiere'};
test('ID antiguo 60 enlaza app_id 35 aunque nombre suprimió Cámara/Colegio',()=>assert.equal(matchesLegacyFicha(old,current),true));
test('Nunca enlaza por app_id como si fuera id_soft',()=>assert.equal(matchesLegacyFicha({...old,id:35},current),false));
test('Bloquea cambios que alteren requisitos estructurados',()=>assert.equal(matchesLegacyFicha({...old,rp:4},current),false));
test('Texto sensible y validadores que parecen URLs se omiten',()=>{
  assert.equal(sensitiveText('usuario:demo clave:123'),true);
  assert.equal(invalidValidator('https://algo.invalid'),true);
});
test('OMINT: normativa general + anexo vacunas de la misma app',()=>{
  assert.deepEqual(scopeLinkedNormatives([
    {normative_id:91,billing_channel_id:null},
    {normative_id:92,billing_channel_id:null},
    {normative_id:92,billing_channel_id:null},
  ]),{ok:true,normativeIds:[91,92],ambiguous:false});
});
test('Cámara/Colegio: nunca suma normas de circuitos distintos',()=>{
  const links=[{normative_id:91,billing_channel_id:null},{normative_id:92,billing_channel_id:1},{normative_id:93,billing_channel_id:2}];
  assert.equal(scopeLinkedNormatives(links).ambiguous,true);
  assert.deepEqual(scopeLinkedNormatives(links,2).normativeIds,[91,93]);
});
test('Sin anexos asociados: no busca libremente documentos de otra obra social',()=>{
  assert.equal(scopeLinkedNormatives([]).ok,false);
});
test('Selecciona vínculos desde social_works.id y sólo normativas vigentes',async()=>{
  const calls=[];
  const queryBuilder={select(v){calls.push(['select',v]);return this;},eq(k,v){calls.push(['eq',k,v]);return Promise.resolve({data:[{normative_id:91,billing_channel_id:null},{normative_id:92,billing_channel_id:null}],error:null});}};
  // Real builder: eq retorna builder encadenable, con then al final
  const qb={...queryBuilder,eq(k,v){calls.push(['eq',k,v]);return this;},then(resolve){resolve({data:[{normative_id:91,billing_channel_id:null},{normative_id:92,billing_channel_id:null}],error:null});}};
  const db={from(name){calls.push(['from',name]);return qb;}};
  const scope=await getLinkedCurrentNormativeScope(db,24);
  assert.deepEqual(scope.normativeIds,[91,92]);
  assert.deepEqual(calls.filter(x=>x[0]==='eq'),[['eq','social_work_id',24],['eq','normatives.is_current',true]]);
});
test('Normativas extra: texto y PDF filtran por id de normativa aprobado en Supabase',()=>{
  for(const src of [query,image]) {
    assert.match(src,/normativeIds\.map\(/);
    assert.match(src,/key:"normative_id"/);
    assert.match(src,/linked-normatives\.mjs/);
  }
  assert.match(query,/normativeIds: normativeScope\.normativeIds/);
});
test('Vacunas, insulinas, PMI y planes especiales activan búsqueda documental específica',()=>{
  for(const s of ['vacunas OMINT','insulinas','antigripal','diabetes','PMI'])assert.equal(isSpecificNormativeTopic(s),true,s);
  assert.equal(isSpecificNormativeTopic('vigencia OMINT'),false);
});
test('Fichas no se renombran, anexos no se importan como nuevas obras sociales',()=>{
  assert.doesNotMatch(importer,/\.(insert|upsert)\(/);
  assert.match(importer,/matchesLegacyFicha/);
  assert.match(importer,/\.eq\('id',Number\(row\.id\)\)\.eq\('id_soft',Number\(row\.id_soft\)\)/);
  assert.match(importer,/approvedObservations/);
});
test('Gasto OpenAI presenta exactamente 2 decimales y redondea 5 hacia arriba',()=>{
  assert.equal(formatMoneyUsd(13.1205),'US$13.12');
  assert.equal(formatMoneyUsd(13.124),'US$13.12');
  assert.equal(formatMoneyUsd(13.125),'US$13.13');
  assert.equal(formatMoneyUsd(0),'US$0.00');
  assert.match(cost,/const money=formatMoneyUsd/);
});

test('Pantalla OpenAI mantiene directiva use client antes de imports',()=>{
  assert.match(cost,/^"use client";/);
});
