import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { validateReviewAccess } from "../../../../lib/review/review-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set(["CORRECT", "INCORRECT", "PARTIAL"]);

export async function POST(request) {
  try {
    const body = await request.json();
    const profileId = String(body?.profileId || "");
    const qaResultId = Number(body?.qaResultId || 0);
    const verdict = String(body?.verdict || "").toUpperCase();
    const suggestedAnswer = String(body?.suggestedAnswer || "").trim();
    const comment = String(body?.comment || "").trim();

    const access = await validateReviewAccess(request, profileId);
    if (!access.ok) {
      return Response.json(
        { ok: false, error: access.error },
        { status: access.status }
      );
    }

    if (!qaResultId || !ALLOWED.has(verdict)) {
      return Response.json(
        { ok: false, error: "Datos de validación incompletos" },
        { status: 400 }
      );
    }

    const { data: qaResult, error: qaError } = await supabaseAdmin
      .from("assistant_qa_results")
      .select("id,run_id,suite,category")
      .eq("id", qaResultId)
      .maybeSingle();

    if (qaError || !qaResult || qaResult.suite !== "NORMATIVE" || qaResult.category !== "RESPONSE") {
      return Response.json(
        { ok: false, error: "Caso QA inválido" },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("client_response_reviews")
      .upsert(
        {
          qa_result_id: qaResultId,
          reviewer_profile_id: profileId,
          verdict,
          suggested_answer: suggestedAnswer || null,
          comment: comment || null,
          updated_at: now,
        },
        {
          onConflict: "qa_result_id,reviewer_profile_id",
        }
      )
      .select("id,qa_result_id,verdict,suggested_answer,comment,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ ok: true, review: data });
  } catch (error) {
    console.error("POST /api/review/reviews:", error);
    return Response.json(
      { ok: false, error: error?.message || "No se pudo guardar la validación" },
      { status: 500 }
    );
  }
}
