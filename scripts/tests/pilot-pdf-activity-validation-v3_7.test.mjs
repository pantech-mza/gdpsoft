import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isPilotReviewable,mergePilotReviewQueue} from '../../lib/assistant/pilot-review-scope.mjs';

const scope={started_at:'2026-10-15T11:35:04.664561Z',seed_query_ids:['4947','4948','4949']};
const row=(id,created_at,traffic_type='OTHER',extra={})=>({id,created_at,traffic_type,branch_id:1,question:'Consulta de farmacia',answer:'Respuesta',...extra});
test('Las tres consultas iniciales se incluyen aunque precedan la clasificación PILOT',()=>{
 for(const id of [4947,4948,4949])assert.equal(isPilotReviewable(row(id,'2026-10-14T12:00:00Z'),scope),true);
});
test('La batería antigua, incluso la pregunta QA 4950, queda excluida',()=>{
 for(const id of [4950,10,4446])assert.equal(isPilotReviewable(row(id,'2026-10-14T12:00:00Z','OTHER'),scope),false);
});
test('Una nueva consulta PILOT autenticada se incluye; las anteriores fuera de semilla no',()=>{
 assert.equal(isPilotReviewable(row(4951,'2026-10-15T12:00:00Z','PILOT'),scope),true);
 assert.equal(isPilotReviewable(row(4951,'2026-10-15T10:00:00Z','PILOT'),scope),false);
 assert.equal(isPilotReviewable(row(4951,'2026-10-15T12:00:00Z','OTHER'),scope),false);
 assert.equal(isPilotReviewable(row(4951,'2026-10-15T12:00:00Z','PILOT',{branch_id:null}),scope),false);
});
test('Una consulta sin respuesta entra para poder marcarla incorrecta',()=>{
 assert.equal(isPilotReviewable(row(4947,'2026-10-14T12:00:00Z','OTHER',{answer:null}),scope),true);
});
test('La cola unifica semillas, consultas nuevas y deduplica, respeta límite y fecha',()=>{
 const old=[row(4947,'2026-10-14T12:00:00Z'),row(4948,'2026-10-14T13:00:00Z'),row(4950,'2026-10-14T14:00:00Z')];
 const latest=[row(4951,'2026-10-15T12:01:00Z','PILOT'),row(4952,'2026-10-15T12:02:00Z','PILOT'),row(4951,'2026-10-15T12:01:00Z','PILOT')];
 assert.deepEqual(mergePilotReviewQueue(latest,old,scope,100).map(x=>x.id),[4952,4951,4948,4947]);
 assert.deepEqual(mergePilotReviewQueue(latest,old,scope,2).map(x=>x.id),[4952,4951]);
});
test('La ruta de PDF registra todas las respuestas exitosas y solamente actor SUCURSAL autenticado',()=>{
 const js=readFileSync(new URL('../../app/api/assistant/analyze-image/route.js',import.meta.url),'utf8');
 assert.match(js,/supabaseAdmin\.auth\.getUser/);
 assert.match(js,/conversation\.user_id/);
 assert.match(js,/profile\?\.role !== "SUCURSAL"/);
 assert.match(js,/profile\.branch_id/);
 assert.match(js,/traffic_type: "PILOT"/);
 assert.match(js,/device_id: conversation\.device_id/);
 assert.match(js,/\.from\("assistant_query_log"\)\.insert/);
 const sends=js.match(/return await respondWithPilotLog\(\{/g)||[];
 assert.equal(sends.length,8); // incluye revisión manual y conflicto de OOSS
});
test('Validación consulta las semillas congeladas y el tráfico PILOT y autoriza POST con la misma regla',()=>{
 const js=readFileSync(new URL('../../app/api/admin/validacion/route.js',import.meta.url),'utf8');
 assert.match(js,/gdp_activity_pilot_scope/);
 assert.match(js,/\.eq\("traffic_type", "PILOT"\)/);
 assert.match(js,/\.in\("id",seeds\)/);
 assert.match(js,/mergePilotReviewQueue/);
 assert.match(js,/isPilotReviewable\(result\.data,scope\)/);
 assert.doesNotMatch(js,/\.from\("assistant_qa_results"\)/);
});

test('El frontend renueva el token si caduca antes de enviar una consulta de texto o PDF',()=>{
 const js=readFileSync(new URL('../../components/FloatingAssistant.jsx',import.meta.url),'utf8');
 assert.match(js,/async function getValidAssistantToken/);
 assert.match(js,/refreshStoredSession\(\)/);
 assert.match(js,/const validAssistantToken = await getValidAssistantToken/);
 assert.match(js,/Authorization: `Bearer \${validAssistantToken}`/);
});
