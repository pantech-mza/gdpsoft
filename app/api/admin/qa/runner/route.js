import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { validateQaSecret } from "../../../../../lib/qa/qa-auth";
import { calculateQaQuality } from "../../../../../lib/qa/quality-score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function p95(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(.95 * s.length) - 1))] || 0;
}

export async function POST(request) {
  try {
    if (!validateQaSecret(request)) {
      return Response.json({ ok: false, error: "QA secret inválido" }, { status: 403 });
    }

    const body = await request.json();
    const action = String(body?.action || "");

    if (action === "start") {
      const { data, error } = await supabaseAdmin
        .from("assistant_qa_runs")
        .insert({
          suite: body.suite || "QA",
          name: body.name || `QA ${new Date().toISOString()}`,
          model: body.model || process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
          status: "RUNNING",
          metadata: body.metadata || {},
        })
        .select("*")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, run: data });
    }

    if (action === "result") {
      const payload = body.result || {};
      const quality = calculateQaQuality({
        category: payload.category,
        status: payload.status,
        expected: payload.expected || {},
        actual: payload.actual || {},
        route: payload.route,
        source: payload.source,
        elapsedMs: payload.elapsed_ms,
        socialWorkId: payload.social_work_id,
        normativeId: payload.normative_id,
      });

      const { data, error } = await supabaseAdmin
        .from("assistant_qa_results")
        .insert({
          run_id: body.runId,
          case_id: payload.case_id,
          suite: payload.suite,
          category: payload.category || null,
          social_work_id: payload.social_work_id || null,
          normative_id: payload.normative_id || null,
          image_id: payload.image_id || null,
          question: payload.question || null,
          expected: payload.expected || {},
          actual: payload.actual || {},
          route: payload.route || null,
          source: payload.source || null,
          model: payload.model || null,
          elapsed_ms: payload.elapsed_ms ?? null,
          input_tokens: payload.input_tokens || 0,
          output_tokens: payload.output_tokens || 0,
          status: payload.status || "ERROR",
          score: payload.score ?? null,
          failure_reason: payload.failure_reason || null,
          quality_score: quality.score,
          quality_level: quality.level,
          quality_breakdown: quality.breakdown,
        })
        .select("id,quality_score,quality_level")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, result: data });
    }

    if (action === "finish") {
      // Supabase puede limitar la cantidad de filas devueltas por request.
      // Las corridas ALL superan 1000 resultados, por eso paginamos.
      const pageSize = 1000;
      let offset = 0;
      const rows = [];

      while (true) {
        const { data: page, error: rErr } = await supabaseAdmin
          .from("assistant_qa_results")
          .select("status,elapsed_ms,quality_score")
          .eq("run_id", body.runId)
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (rErr) throw rErr;

        const batch = page || [];
        rows.push(...batch);

        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      const times = rows.map((x) => Number(x.elapsed_ms)).filter(Number.isFinite);
      const qualities = rows
        .filter((x) => x.quality_score !== null && x.quality_score !== undefined)
        .map((x) => Number(x.quality_score))
        .filter(Number.isFinite);
      const summary = {
        total_cases: rows.length,
        passed: rows.filter((x) => x.status === "PASS").length,
        failed: rows.filter((x) => x.status === "FAIL").length,
        warnings: rows.filter((x) => x.status === "WARNING").length,
        errors: rows.filter((x) => x.status === "ERROR").length,
        avg_ms: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
        p95_ms: p95(times),
        avg_quality: qualities.length ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 100) / 100 : null,
      };

      const { data, error } = await supabaseAdmin
        .from("assistant_qa_runs")
        .update({ ...summary, status: "COMPLETED", finished_at: new Date().toISOString() })
        .eq("id", body.runId)
        .select("*")
        .single();
      if (error) throw error;
      return Response.json({ ok: true, run: data });
    }

    return Response.json({ ok: false, error: "action inválida" }, { status: 400 });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Error QA runner" }, { status: 500 });
  }
}
