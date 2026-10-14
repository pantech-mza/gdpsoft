import { argValue, getSupabase, fetchAll } from "./audit-common.mjs";
const runId = argValue("run");
if (!runId) { console.error("Uso: node scripts/qa/audit-summary.mjs --run=<RUN_ID>"); process.exit(1); }
const supabase = getSupabase();
const rows = await fetchAll(() => supabase.from("assistant_qa_audits").select("audit_type,verdict,elapsed_ms,route,social_work_id").eq("run_id", runId));
const groups = {};
for (const r of rows) {
  const k = `${r.audit_type}:${r.verdict}`;
  groups[k] = (groups[k] || 0) + 1;
}
console.log(`Auditorías guardadas: ${rows.length}`);
console.table(Object.entries(groups).map(([tipo, cantidad]) => ({ tipo, cantidad })));
