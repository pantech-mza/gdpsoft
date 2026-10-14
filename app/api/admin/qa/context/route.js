import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { validateQaSecret } from "../../../../../lib/qa/qa-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!validateQaSecret(request)) return Response.json({ok:false,error:"QA secret inválido"},{status:403});
    const body = await request.json();
    const branchId = Number(body?.branchId || process.env.QA_BRANCH_ID || 1);
    const socialWorkId = body?.socialWorkId ? Number(body.socialWorkId) : null;
    if (!Number.isInteger(branchId) || branchId <= 0) return Response.json({ok:false,error:"branchId inválido"},{status:400});

    const { data, error } = await supabaseAdmin.from("conversations").insert({
      user_id: null,
      branch_id: branchId,
      device_id: null,
      active_social_work_id: Number.isInteger(socialWorkId) && socialWorkId > 0 ? socialWorkId : null,
      closed_at: null
    }).select("id,branch_id,active_social_work_id").single();
    if (error) throw error;
    return Response.json({ok:true,conversation:data});
  } catch (error) {
    return Response.json({ok:false,error:error?.message || "No se pudo crear contexto QA"},{status:500});
  }
}
