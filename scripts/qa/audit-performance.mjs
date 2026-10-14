import { argValue, hasFlag, getSupabase, fetchAll, saveExports, upsertAudit } from "./audit-common.mjs";

const runId = argValue("run");
const threshold = Number(argValue("threshold", "6000")) || 6000;
const dryRun = hasFlag("dry-run");
if (!runId) {
  console.error("Uso: node scripts/qa/audit-performance.mjs --run=<RUN_ID> [--threshold=6000] [--dry-run]");
  process.exit(1);
}
const supabase = getSupabase();

const warnings = await fetchAll(() =>
  supabase.from("assistant_qa_results")
    .select("id,run_id,case_id,category,social_work_id,question,actual,route,source,model,elapsed_ms,status,failure_reason,quality_score")
    .eq("run_id", runId)
    .eq("status", "WARNING")
    .gte("elapsed_ms", threshold)
    .order("elapsed_ms", { ascending: false })
);

let logs = [];
let detailedLogsAvailable = true;
try {
  logs = await fetchAll(() =>
    supabase.from("assistant_query_log")
      .select("id,qa_run_id,qa_case_id,route,source,model,elapsed_ms,routing_duration_ms,db_duration_ms,openai_duration_ms,file_search_duration_ms,vision_duration_ms,status,error_code,found,created_at")
      .eq("qa_run_id", runId)
      .order("created_at", { ascending: true })
  );
} catch (e) {
  detailedLogsAvailable = false;
  console.warn("No pude leer telemetría detallada de assistant_query_log. Se usará diagnóstico por ruta/tiempo total.");
  console.warn("Motivo:", e.message);
}

const byCase = new Map();
for (const l of logs) if (l.qa_case_id) byCase.set(l.qa_case_id, l);

function classify(qa, log) {
  const parts = {
    routing: Number(log?.routing_duration_ms || 0),
    db: Number(log?.db_duration_ms || 0),
    openai: Number(log?.openai_duration_ms || 0),
    fileSearch: Number(log?.file_search_duration_ms || 0),
    vision: Number(log?.vision_duration_ms || 0),
  };
  const max = Math.max(...Object.values(parts));
  if (max > 0) {
    if (parts.vision === max && parts.vision >= 2500) return ["SLOW_VISION", `Vision consumió ${parts.vision} ms`];
    if (parts.fileSearch === max && parts.fileSearch >= 2500) return ["SLOW_FILE_SEARCH", `File Search consumió ${parts.fileSearch} ms`];
    if (parts.openai === max && parts.openai >= 2500) return ["SLOW_OPENAI", `OpenAI consumió ${parts.openai} ms`];
    if (parts.db === max && parts.db >= 1500) return ["SLOW_DB", `Base de datos consumió ${parts.db} ms`];
    if (parts.routing === max && parts.routing >= 1000) return ["SLOW_ROUTING", `Routing consumió ${parts.routing} ms`];
    return ["MULTIPLE_STEPS", `No hay una única etapa dominante; total ${qa.elapsed_ms} ms`];
  }

  const route = String(qa.route || "").toUpperCase();
  if (route.includes("SEMANTIC") || route.includes("OPENAI") || route.includes("FILE")) return ["LIKELY_FILE_SEARCH_OPENAI", "La corrida histórica no guardó tiempos parciales; por la ruta, la demora probablemente está en retrieval/OpenAI"];
  if (route.includes("CACHE")) return ["SLOW_CACHE_OR_DB", "Una respuesta de cache >6 s apunta a DB/cache o pasos previos innecesarios"];
  if (route.includes("STRUCTURED")) return ["SLOW_STRUCTURED_PATH", "Una respuesta estructurada >6 s no debería requerir IA; revisar DB/routing/duplicación de llamadas"];
  return ["UNKNOWN", "No hay telemetría parcial suficiente en esta corrida"];
}

console.log(`WARNING > ${threshold} ms: ${warnings.length}`);
console.log(`Telemetría detallada: ${detailedLogsAvailable ? "sí" : "no/fallback"}\n`);

const out = [];
let i = 0;
for (const qa of warnings) {
  i++;
  const log = byCase.get(qa.case_id) || null;
  const [verdict, reason] = classify(qa, log);
  const audit = {
    run_id: runId,
    qa_result_id: qa.id,
    case_id: qa.case_id,
    audit_type: "PERFORMANCE",
    social_work_id: qa.social_work_id,
    question: qa.question,
    original_status: qa.status,
    original_answer: qa.actual?.answer || qa.actual?.text || "",
    route: qa.route,
    source: qa.source,
    verdict,
    reason,
    evidence: null,
    elapsed_ms: qa.elapsed_ms,
    routing_duration_ms: log?.routing_duration_ms ?? null,
    db_duration_ms: log?.db_duration_ms ?? null,
    openai_duration_ms: log?.openai_duration_ms ?? null,
    file_search_duration_ms: log?.file_search_duration_ms ?? null,
    vision_duration_ms: log?.vision_duration_ms ?? null,
    model: log?.model || qa.model || null,
    metadata: { detailed_log_found: Boolean(log), failure_reason: qa.failure_reason, log_status: log?.status || null, error_code: log?.error_code || null },
    updated_at: new Date().toISOString(),
  };
  if (!dryRun) await upsertAudit(supabase, audit);
  out.push(audit);
  console.log(`[${i}/${warnings.length}] ${qa.case_id} · ${qa.elapsed_ms}ms · ${qa.route} → ${verdict}`);
}

const paths = await saveExports(`performance-audit-${runId}`, out);
const counts = out.reduce((a, r) => ((a[r.verdict] = (a[r.verdict] || 0) + 1), a), {});
console.log("\nRESUMEN:", counts);
console.log("JSON:", paths.jsonPath);
console.log("CSV :", paths.csvPath);
