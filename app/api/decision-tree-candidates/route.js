import { supabaseAdmin } from "../../../lib/supabase/admin";
import { requireActor, failure } from "../../../lib/decision-trees/auth";
import { attachCircuitContext } from "../../../lib/decision-trees/circuits";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  let query = supabaseAdmin.from("decision_tree_candidates")
    .select("id,social_work_id,normative_id,title,description,confidence,source_pages,generated_json,status,created_by,reviewed_by,reviewed_at,created_at,updated_at,social_works(id,name,active),normatives(id,title,original_filename,status,is_current,version)")
    .order("created_at", { ascending: false }).limit(1000);
  if (params.get("social_work_id")) {
    const id = Number(params.get("social_work_id"));
    if (!Number.isSafeInteger(id) || id < 1) return failure("Obra social inválida");
    query = query.eq("social_work_id", id);
  }
  if (params.get("status")) query = query.eq("status", params.get("status"));
  const { data, error } = await query;
  if (error) return failure(error.message, 500);
  try {
    const candidates = await attachCircuitContext(data || []);
    return Response.json({ ok: true, candidates, count: candidates.length });
  } catch (err) { return failure(err.message || "Error identificando circuitos", 500); }
}
