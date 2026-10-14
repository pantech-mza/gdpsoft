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

export async function POST(request) {
  try {
    const body = await request.json();

    if (!(await validateSuperAdmin(body?.profileId))) {
      return Response.json({ ok: false, error: "Acceso exclusivo para Super Admin" }, { status: 403 });
    }

    const rating = String(body?.rating || "").toUpperCase();
    if (!["UP", "DOWN", "REVIEW"].includes(rating)) {
      return Response.json({ ok: false, error: "rating inválido" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("assistant_feedback")
      .insert({
        assistant_query_log_id: body?.assistantQueryLogId || null,
        user_id: body.profileId,
        branch_id: body?.branchId || null,
        rating,
        category: body?.category || null,
        comment: body?.comment || null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json({ ok: true, feedback: data });
  } catch (error) {
    console.error("assistant-feedback error:", error);
    return Response.json(
      { ok: false, error: error?.message || "No se pudo guardar el feedback" },
      { status: 500 }
    );
  }
}