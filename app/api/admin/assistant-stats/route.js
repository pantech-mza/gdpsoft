import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function validateSuperAdmin(profileId) {
  if (!profileId) return false;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,is_super_admin,active")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !data) return false;
  return data.active !== false && data.is_super_admin === true;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] || 0;
}

function groupCount(rows, key) {
  const result = {};
  for (const row of rows) {
    const value = row?.[key] ?? "SIN_DATO";
    result[value] = (result[value] || 0) + 1;
  }
  return Object.entries(result)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get("profileId");
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") || 7)));

    if (!(await validateSuperAdmin(profileId))) {
      return Response.json({ ok: false, error: "Acceso exclusivo para Super Admin" }, { status: 403 });
    }

    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [logsResult, eventsResult, feedbackResult] = await Promise.all([
      supabaseAdmin
        .from("assistant_query_log")
        .select(`
          id,created_at,branch_id,user_id,conversation_id,
          social_work_id,detected_social_work_id,
          question,answer,source,route,normative_id,found,
          model,has_image,status,error_code,
          input_tokens,output_tokens,total_tokens,elapsed_ms,
          routing_duration_ms,db_duration_ms,openai_duration_ms,
          file_search_duration_ms,vision_duration_ms,estimated_cost_usd
        `)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),

      supabaseAdmin
        .from("assistant_quality_event")
        .select("id,assistant_query_log_id,conversation_id,branch_id,social_work_id,event_type,severity,message,metadata,resolved,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),

      supabaseAdmin
        .from("assistant_feedback")
        .select("id,assistant_query_log_id,user_id,branch_id,rating,category,comment,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    if (logsResult.error) throw logsResult.error;
    if (eventsResult.error) throw eventsResult.error;
    if (feedbackResult.error) throw feedbackResult.error;

    const logs = logsResult.data || [];
    const events = eventsResult.data || [];
    const feedback = feedbackResult.data || [];

    const durations = logs.map(x => Number(x.elapsed_ms)).filter(x => Number.isFinite(x) && x >= 0);
    const images = logs.filter(x => x.has_image === true);
    const imageSocialWorkDetected = images.filter(x => x.detected_social_work_id != null);
    const errors = logs.filter(x => x.error_code || String(x.status || "").toUpperCase() === "ERROR");
    const slow = logs.filter(x => Number(x.elapsed_ms || 0) > 6000);
    const totalCost = logs.reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);

    return Response.json({
      ok: true,
      period_days: days,
      kpis: {
        total_queries: logs.length,
        total_images: images.length,
        image_social_work_detected: imageSocialWorkDetected.length,
        image_social_work_detection_rate: images.length ? imageSocialWorkDetected.length / images.length : null,
        errors: errors.length,
        slow_responses: slow.length,
        avg_ms: durations.length ? Math.round(durations.reduce((a,b) => a+b, 0) / durations.length) : 0,
        p50_ms: percentile(durations, 50),
        p90_ms: percentile(durations, 90),
        p95_ms: percentile(durations, 95),
        total_cost_usd: Number(totalCost.toFixed(6)),
        feedback_up: feedback.filter(x => x.rating === "UP").length,
        feedback_down: feedback.filter(x => x.rating === "DOWN").length,
        feedback_review: feedback.filter(x => x.rating === "REVIEW").length,
      },
      routes: groupCount(logs, "route"),
      sources: groupCount(logs, "source"),
      models: groupCount(logs, "model"),
      errors_by_code: groupCount(logs.filter(x => x.error_code), "error_code"),
      events_by_type: groupCount(events, "event_type"),
      events_by_severity: groupCount(events, "severity"),
      recent_logs: logs.slice(0, 150),
      recent_events: events.slice(0, 150),
      recent_feedback: feedback.slice(0, 100),
    });
  } catch (error) {
    console.error("assistant-stats error:", error);
    return Response.json(
      { ok: false, error: error?.message || "No se pudieron obtener las estadísticas" },
      { status: 500 }
    );
  }
}