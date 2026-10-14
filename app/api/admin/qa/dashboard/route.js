import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { validateSuperAdmin } from "../../../../../lib/qa/qa-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get("profileId");

    if (!(await validateSuperAdmin(profileId))) {
      return Response.json(
        { ok: false, error: "Acceso exclusivo Super Admin" },
        { status: 403 }
      );
    }

    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(
      100,
      Math.max(5, Number(url.searchParams.get("pageSize") || 20))
    );

    const requestedRunId = url.searchParams.get("runId");
    const suite = url.searchParams.get("suite");
    const status = url.searchParams.get("status");
    const category = url.searchParams.get("category");
    const socialWorkId = Number(url.searchParams.get("socialWorkId") || 0) || null;

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // Historial visible.
    const { data: runs, error: runsErr } = await supabaseAdmin
      .from("assistant_qa_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50);

    if (runsErr) throw runsErr;

    // Cuando se pide una suite, la corrida por defecto es la última de esa suite.
    // Esto evita mezclar, por ejemplo, una corrida de imágenes con Normativas.
    let activeRun = null;

    if (requestedRunId) {
      activeRun = (runs || []).find((r) => r.id === requestedRunId) || null;
    }

    if (!activeRun && suite) {
      activeRun = (runs || []).find(
        (r) => String(r.suite || "").toUpperCase() === String(suite).toUpperCase()
      ) || null;
    }

    if (!activeRun) {
      activeRun = (runs || [])[0] || null;
    }

    const activeRunId = activeRun?.id || null;

    let q = supabaseAdmin
      .from("assistant_qa_results")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: true });

    if (activeRunId) q = q.eq("run_id", activeRunId);
    if (suite) q = q.eq("suite", suite);
    if (status) q = q.eq("status", status);
    if (category) q = q.eq("category", category);
    if (socialWorkId) q = q.eq("social_work_id", socialWorkId);

    const { data: results, error, count } = await q.range(from, to);
    if (error) throw error;

    let socialWorkSummary = null;

    if (activeRunId && socialWorkId) {
      const { data: swRows, error: swSummaryErr } = await supabaseAdmin
        .from("assistant_qa_results")
        .select("status,elapsed_ms,quality_score")
        .eq("run_id", activeRunId)
        .eq("suite", suite || "NORMATIVE")
        .eq("category", category || "RESPONSE")
        .eq("social_work_id", socialWorkId);

      if (swSummaryErr) throw swSummaryErr;

      const rows = swRows || [];
      const elapsed = rows
        .map((r) => Number(r.elapsed_ms))
        .filter((n) => Number.isFinite(n) && n > 0);
      const qualities = rows
        .map((r) => Number(r.quality_score))
        .filter((n) => Number.isFinite(n));

      socialWorkSummary = {
        total: rows.length,
        passed: rows.filter((r) => r.status === "PASS").length,
        warnings: rows.filter((r) => r.status === "WARNING").length,
        failed: rows.filter((r) => r.status === "FAIL").length,
        errors: rows.filter((r) => r.status === "ERROR").length,
        avg_ms: elapsed.length
          ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length)
          : 0,
        avg_quality: qualities.length
          ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 100) / 100
          : null,
      };
    }

    // Catálogo para el selector de obra social del dashboard.
    const { data: socialWorks, error: swErr } = await supabaseAdmin
      .from("social_works")
      .select("id,name")
      .eq("active", true)
      .eq("robinson", false)
      .order("name");

    if (swErr) throw swErr;

    return Response.json({
      ok: true,
      latest_run: (runs || [])[0] || null,
      active_run: activeRun,
      active_run_id: activeRunId,
      runs: runs || [],
      social_works: socialWorks || [],
      social_work_summary: socialWorkSummary,
      filters: {
        suite: suite || null,
        status: status || null,
        category: category || null,
        social_work_id: socialWorkId,
      },
      results: results || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error?.message || "No se pudo cargar QA" },
      { status: 500 }
    );
  }
}
