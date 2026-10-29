import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
test('Admin y Sucursal comparten escala 75% solo en escritorio',()=>{
 for(const p of ['app/admin/layout.jsx','app/sucursal/layout.jsx'])assert.match(read(p),/gdp-app-scale/);
 assert.match(read('app/styles.css'),/zoom:\s*75%/);
 assert.match(read('app/styles.css'),/max-width:\s*1023px/);
});
test('historial QA no se borra; se registra un piloto con cuatro registros iniciales',()=>{
 const sql=read('supabase/migrations/20261014_pilot_activity_baseline_and_devices.sql');
 assert.match(sql,/LIMIT 4/);assert.match(sql,/ON CONFLICT\(id\) DO NOTHING/);
 assert.doesNotMatch(sql,/DELETE\s+FROM\s+public\.assistant_query_log/i);
 assert.match(sql,/traffic_type='PILOT'/);
});
test('la paginación y los gráficos consumen el mismo filtro de piloto',()=>{
 const sql=read('supabase/migrations/20261014_pilot_activity_baseline_and_devices.sql');
 assert.match(sql,/gdp_assistant_activity_dashboard_v3/);
 assert.match(sql,/gdp_assistant_activity_page_v3/);
 assert.equal((sql.match(/l.id=ANY\(p.seed_query_ids\)/g)||[]).length,2);
 assert.match(sql,/by_device/);assert.match(sql,/frequent_questions/);
 assert.equal((sql.match(/p_day IS NULL/g)||[]).length,2);
});
test('la función del bot registra tráfico real autenticado y dispositivo',()=>{
 const src=read('app/api/assistant/query/route.js');
 assert.match(src,/trafficType = "OTHER"/);assert.match(src,/deviceId = null/);
 assert.match(src,/device_id: deviceId/);
 assert.match(src,/verifiedPilotBranch/);
});
test('solo Admin/Superadmin pueden quitar dispositivos',()=>{
 const api=read('app/api/admin/sucursales/dispositivos/route.js');
 assert.match(api,/requireAdminActor/);assert.match(api,/export async function DELETE/);
 assert.match(api,/removed_at/);assert.doesNotMatch(api,/\.delete\(\)/);
 assert.match(read('app/admin/usuarios/page.jsx'),/Quitar dispositivo/);
});
test('actividad permite filtrado cruzado de indicadores y no expone técnico a Admin',()=>{
 const ui=read('app/admin/actividad/page.jsx');
 assert.match(ui,/isSuper&&/);assert.match(ui,/onClick=\{\(\)=>r\.id&&onPick\(r\)\}/);
 for (const x of ['p_branch_id','p_social_work_id','p_device_id'])assert.match(read('lib/server/activity-filters.mjs'),new RegExp(x));assert.match(read('app/api/admin/actividad/dashboard/route.js'),/p_question/);
});
test('OpenAI no muestra mezclas de costo ni modelos al cliente',()=>{
 const ui=read('app/admin/openai/page.jsx')+read('components/admin/OpenAiPilotSpend.jsx');
 assert.doesNotMatch(ui,/Distribución de costos|Consumo por modelo/);
 assert.match(ui,/setBranches/);assert.match(ui,/Gasto por día/);
});
