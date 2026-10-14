import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { validateReviewAccess } from "../../../../lib/review/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const profileId = url.searchParams.get("profileId");

    const access = await validateReviewAccess(request, profileId);
    if (!access.ok) {
      return Response.json(
        { ok: false, error: access.error },
        { status: access.status }
      );
    }

    const page = clamp(Number(url.searchParams.get("page") || 1), 1, 999999);
    const pageSize = clamp(Number(url.searchParams.get("pageSize") || 20), 5, 100);
    const socialWorkId = Number(url.searchParams.get("socialWorkId") || 0) || null;
    const verdict = String(url.searchParams.get("verdict") || "ALL").toUpperCase();
    const qaStatus = String(url.searchParams.get("qaStatus") || "ALL").toUpperCase();
    const search = String(url.searchParams.get("q") || "").trim();
    const requestedRunId = String(url.searchParams.get("runId") || "").trim();

    const { data: runs, error: runsError } = await supabaseAdmin
      .from("assistant_qa_runs")
      .select("id,name,suite,status,started_at,finished_at,total_cases,passed,failed,warnings,errors,avg_quality")
      .eq("suite", "NORMATIVE")
      .eq("status", "COMPLETED")
      .order("started_at", { ascending: false })
      .limit(30);

    if (runsError) throw runsError;

    const activeRun =
      (runs || []).find((item) => item.id === requestedRunId) ||
      (runs || [])[0] ||
      null;

    if (!activeRun) {
      return Response.json({
        ok: true,
        activeRun: null,
        runs: [],
        rows: [],
        socialWorks: [],
        pagination: { page, pageSize, total: 0, pages: 0 },
        summary: { pending: 0, correct: 0, incorrect: 0, partial: 0, reviewed: 0, total: 0 },
      });
    }

    let base = supabaseAdmin
      .from("assistant_qa_results")
      .select(`
        id,
        run_id,
        case_id,
        social_work_id,
        normative_id,
        question,
        expected,
        actual,
        route,
        source,
        model,
        elapsed_ms,
        status,
        failure_reason,
        created_at,
        social_works (
          id,
          name
        ),
        normatives (
          id,
          title,
          original_filename
        )
      `, { count: "exact" })
      .eq("run_id", activeRun.id)
      .eq("suite", "NORMATIVE")
      .eq("category", "RESPONSE")
      .order("social_work_id", { ascending: true })
      .order("created_at", { ascending: true });

    if (socialWorkId) base = base.eq("social_work_id", socialWorkId);
    if (qaStatus !== "ALL") base = base.eq("status", qaStatus);
    if (search) base = base.ilike("question", `%${search}%`);

    let rows = [];
    let total = 0;

    if (verdict === "ALL") {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await base.range(from, to);
      if (error) throw error;
      rows = data || [];
      total = Number(count || 0);
    } else {
      // Para estados de revisión usamos paginación explícita. Esto evita
      // el límite de 1000 filas y también evita un .in(...) gigante.
      const allRows = await fetchAllQueryPages(base);
      const allReviews = await fetchAllQueryPages(
        supabaseAdmin
          .from("client_response_reviews")
          .select("qa_result_id,verdict")
          .eq("reviewer_profile_id", profileId)
          .order("qa_result_id", { ascending: true })
      );

      const reviewByResult = new Map(
        (allReviews || []).map((item) => [Number(item.qa_result_id), item.verdict])
      );

      const filteredRows = (allRows || []).filter((item) => {
        const currentVerdict = reviewByResult.get(Number(item.id));
        if (verdict === "PENDING") return !currentVerdict;
        return currentVerdict === verdict;
      });

      total = filteredRows.length;
      const from = (page - 1) * pageSize;
      rows = filteredRows.slice(from, from + pageSize);
    }

    const ids = rows.map((item) => item.id);
    let reviewsByResult = {};

    if (ids.length) {
      const { data: reviews, error: reviewsError } = await supabaseAdmin
        .from("client_response_reviews")
        .select("id,qa_result_id,verdict,suggested_answer,comment,created_at,updated_at")
        .eq("reviewer_profile_id", profileId)
        .in("qa_result_id", ids);

      if (reviewsError) throw reviewsError;
      reviewsByResult = Object.fromEntries(
        (reviews || []).map((item) => [String(item.qa_result_id), item])
      );
    }

    const hydratedRows = rows.map((item) => ({
      ...item,
      review: reviewsByResult[String(item.id)] || null,
    }));

    // Mostrar únicamente OOSS que realmente tienen casos en la corrida seleccionada.
    const runSocialWorkRows = await fetchAllQueryPages(
      supabaseAdmin
        .from("assistant_qa_results")
        .select("social_work_id")
        .eq("run_id", activeRun.id)
        .eq("suite", "NORMATIVE")
        .eq("category", "RESPONSE")
        .order("social_work_id", { ascending: true })
    );

    const runSocialWorkIds = [
      ...new Set((runSocialWorkRows || []).map((item) => Number(item.social_work_id)).filter(Boolean)),
    ];

    let uniqueSocialWorks = [];
    if (runSocialWorkIds.length) {
      const { data: socialWorks, error: socialWorksError } = await supabaseAdmin
        .from("social_works")
        .select("id,name")
        .in("id", runSocialWorkIds)
        .order("name");
      if (socialWorksError) throw socialWorksError;
      uniqueSocialWorks = socialWorks || [];
    }

    const summary = await getSummary(activeRun.id, profileId);

    return Response.json({
      ok: true,
      activeRun,
      runs: runs || [],
      rows: hydratedRows,
      socialWorks: uniqueSocialWorks,
      pagination: {
        page,
        pageSize,
        total,
        pages: Math.ceil(total / pageSize),
      },
      summary,
      reviewer: {
        id: access.profile.id,
        name: access.profile.full_name || access.profile.username,
      },
    });
  } catch (error) {
    console.error("GET /api/review/questions:", error);
    return Response.json(
      { ok: false, error: error?.message || "No se pudo cargar la validación" },
      { status: 500 }
    );
  }
}

async function fetchAllQueryPages(query, pageSize = 1000) {
  const rows = [];
  let from = 0;

  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    const batch = data || [];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function getSummary(runId, profileId) {
  const qaRows = await fetchAllQueryPages(
    supabaseAdmin
      .from("assistant_qa_results")
      .select("id,status,elapsed_ms")
      .eq("run_id", runId)
      .eq("suite", "NORMATIVE")
      .eq("category", "RESPONSE")
      .order("id", { ascending: true })
  );

  const ids = (qaRows || []).map((item) => item.id);
  const total = ids.length;

  const qa = { pass: 0, warning: 0, fail: 0, error: 0, avg_ms: 0 };
  let elapsedTotal = 0;
  let elapsedCount = 0;

  for (const row of qaRows || []) {
    if (row.status === "PASS") qa.pass += 1;
    else if (row.status === "WARNING") qa.warning += 1;
    else if (row.status === "FAIL") qa.fail += 1;
    else if (row.status === "ERROR") qa.error += 1;

    const elapsed = Number(row.elapsed_ms || 0);
    if (Number.isFinite(elapsed) && elapsed > 0) {
      elapsedTotal += elapsed;
      elapsedCount += 1;
    }
  }
  qa.avg_ms = elapsedCount ? Math.round(elapsedTotal / elapsedCount) : 0;

  if (!ids.length) {
    return { pending: 0, correct: 0, incorrect: 0, partial: 0, reviewed: 0, total: 0, qa };
  }

  const allReviews = await fetchAllQueryPages(
    supabaseAdmin
      .from("client_response_reviews")
      .select("qa_result_id,verdict")
      .eq("reviewer_profile_id", profileId)
      .order("qa_result_id", { ascending: true })
  );

  const idSet = new Set(ids.map(Number));
  const reviews = (allReviews || []).filter(
    (review) => idSet.has(Number(review.qa_result_id))
  );

  const counts = { CORRECT: 0, INCORRECT: 0, PARTIAL: 0 };
  for (const review of reviews) {
    if (counts[review.verdict] !== undefined) counts[review.verdict] += 1;
  }

  const reviewed = reviews.length;
  return {
    total,
    reviewed,
    pending: Math.max(0, total - reviewed),
    correct: counts.CORRECT,
    incorrect: counts.INCORRECT,
    partial: counts.PARTIAL,
    qa,
  };
}
