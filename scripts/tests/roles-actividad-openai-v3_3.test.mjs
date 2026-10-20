import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");
test("Admin recupera vista de Normativas y no ve Archivos/Historial",()=>{
 const sidebar=read("components/admin/AdminSidebar.jsx");
 assert.match(sidebar,/href: "\/admin\/normativas"/);
 assert.doesNotMatch(sidebar,/label: "Archivos"/);
 assert.match(sidebar,/currentUser\?\.is_super_admin &&/);
 assert.match(sidebar,/label: "Historial de cambios"/);
});
test("Robot transparente acompaña al usuario en los tres roles",()=>{
 const bot=read("components/FloatingAssistant.jsx");
 assert.match(bot,/group fixed bottom-4 right-3/);
 assert.match(bot,/border-0 bg-transparent p-0 shadow-none/);
 assert.match(bot,/bot-gdpsoft\.png/);
 assert.doesNotMatch(bot,/flex w-full justify-end px-4 pb-6 pt-3/);
 assert.match(read("app/admin/layout.jsx"),/FloatingAssistant/);
 assert.match(read("app/sucursal/layout.jsx"),/FloatingAssistant/);
});
test("Cola Admin no incluye assistant_qa_results ni batería QA",()=>{
 const api=read("app/api/admin/validacion/route.js");
 assert.match(api,/requireAdminActor\(request\)/);
 assert.match(api,/\.eq\("traffic_type", "PILOT"\)/);
 assert.match(api,/fetchAll\(/); // v3.13.28: la cola ya no tiene tope de 100
 assert.doesNotMatch(api,/\.from\("assistant_qa_results"\)/);
 assert.match(read("lib/review/review-auth.js"),/reservada a Superadmin/);
});
test("La clasificación PILOT requiere usuario Sucursal autenticado",()=>{
 const backend=read("app/api/assistant/query/route.js");
 assert.match(backend,/supabaseAdmin\.auth\.getUser/);
 assert.match(backend,/profile\?\.role === "SUCURSAL"/);
 assert.match(backend,/trafficType: verifiedPilotBranch/);
 assert.match(read("components/FloatingAssistant.jsx"),/Authorization: `Bearer/);
});
test("OpenAI comprueba token JWT real y Admin/Superadmin",()=>{
 const api=read("app/api/admin/openai-usage/route.js");
 assert.match(api,/requireAdminActor\(request\)/);
 assert.doesNotMatch(api,/validateSuperAdmin\(profileId\)/);
 assert.match(read("app/admin/openai/page.jsx"),/Bearer/);
});
test("Actividad pagina y cruza filtros en servidor",()=>{
 const list=read("app/api/admin/actividad/route.js");
 assert.match(list,/pageSize/);assert.match(list,/gdp_assistant_activity_page_v3/);
 const api=read("app/api/admin/actividad/dashboard/route.js");
 assert.match(api,/gdp_assistant_activity_dashboard_v3/);
 assert.match(api,/p_device_id:deviceId/);
 const sql=read("supabase/migrations/20261014_pilot_activity_baseline_and_devices.sql");
 assert.match(sql,/p_question text DEFAULT NULL/);
 assert.match(sql,/GRANT EXECUTE.*service_role/);
});
test("Revisión operativa mantiene permisos SQL privados",()=>{
 const sql=read("supabase/migrations/20261014_branch_response_reviews.sql");
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all.*anon, authenticated/);
 assert.match(sql,/unique\(query_id,reviewer_profile_id\)/);
});
