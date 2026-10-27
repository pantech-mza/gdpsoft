import { requireAdminActor, jsonError } from "../../../../../lib/server/gdp-actor";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { buildBranchUsage, buildUsageCells } from "../../../../../lib/server/openai-branch-usage.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const PAGE = 1000, HARD_CAP = 30000;

async function fetchAll(makeQuery) {
  const out = [];
  for (let from = 0; from < HARD_CAP; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null };
}

// Tokens consumidos por sucursal (el gasto real lo pone OpenAI; esto sirve para repartirlo).
export async function GET(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return jsonError(access.error, access.status);
  try {
    const url = new URL(request.url);
    const days = Math.min(350, Math.max(1, Number(url.searchParams.get("days") || 30)));
    const day = String(url.searchParams.get("day") || "");
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) return jsonError("Fecha inválida", 400);
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const [logs, shadow, branches, devices] = await Promise.all([
      fetchAll(() => supabaseAdmin.from("assistant_query_log")
        .select("id,branch_id,device_id,conversation_id,traffic_type,created_at,input_tokens,output_tokens")
        .gte("created_at", since).order("id", { ascending: true })),
      fetchAll(() => supabaseAdmin.from("assistant_shadow_results")
        .select("id,branch_id,conversation_id,created_at,tokens_in,tokens_out")
        .gte("created_at", since).order("id", { ascending: true })),
      supabaseAdmin.from("branches").select("id,name,active"),
      supabaseAdmin.from("branch_devices").select("id,device_name"),
    ]);
    if (logs.error) throw logs.error;
    // El motor de contexto es opcional: sin su tabla igual se reparte con el bot clásico.
    const shadowRows = shadow.error ? [] : shadow.data;
    const deviceNames = new Map((devices.data || []).map((d) => [String(d.id), d.device_name || ""]));
    const logRows = logs.data.map((l) => ({ ...l, device_name: l.device_id ? deviceNames.get(String(l.device_id)) || "" : "" }));
    const branchNames = new Map((branches.data || []).map((b) => [String(b.id), b.name]));
    const usage = buildBranchUsage({ logs: logRows, shadow: shadowRows, branchNames, day: day || null });
    const cells = buildUsageCells({ logs: logRows, shadow: shadowRows, branchNames });
    const branchesTotal = (branches.data || []).filter((b) => b.active !== false).length;
    return Response.json({ ok: true, period_days: days, day: day || null, engine_included: !shadow.error, branches_total: branchesTotal, ...usage, usage_cells: cells.cells, usage_branches: cells.branches, usage_devices: cells.devices }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("openai-usage branches", error);
    return jsonError("No se pudo calcular el gasto por sucursal", 500);
  }
}
