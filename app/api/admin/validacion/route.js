import { requireAdminActor, jsonError } from "../../../../lib/server/gdp-actor";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { deactivateCachedAnswers } from "../../../../lib/assistant/admin-corrections.mjs";
import { isPilotReviewable, mergePilotReviewQueue } from "../../../../lib/assistant/pilot-review-scope.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set(["CORRECT", "INCORRECT", "PARTIAL"]);
const SELECT = "id,branch_id,social_work_id,question,answer,created_at,source,route,elapsed_ms,found,traffic_type,normalized_question";

async function pilotScope() {
  const {data,error} = await supabaseAdmin.from("gdp_activity_pilot_scope")
    .select("started_at,seed_query_ids").eq("id",1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("No existe gdp_activity_pilot_scope; ejecutar la migración del piloto");
  return data;
}

// La cola de Admin comparte el MISMO corte temporal y las MISMAS semillas
// que Actividad. No lee assistant_qa_results ni las baterías históricas.
export async function GET(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return jsonError(access.error,access.status);
  try {
    const scope = await pilotScope();
    const seeds = (scope.seed_query_ids || []).map(Number).filter(Number.isSafeInteger);
    const [pilotRows,seedRows,adminRows] = await Promise.all([
      supabaseAdmin.from("assistant_query_log").select(SELECT)
        .eq("traffic_type", "PILOT").not("branch_id","is",null)
        .gte("created_at",scope.started_at)
        .order("created_at",{ascending:false}).limit(100),
      seeds.length ? supabaseAdmin.from("assistant_query_log").select(SELECT)
        .in("id",seeds).not("branch_id","is",null) : {data:[],error:null},
      // Consultas hechas por el administrador (probar el bot también se revisa).
      supabaseAdmin.from("assistant_query_log").select(SELECT)
        .eq("traffic_type", "ADMIN")
        .gte("created_at",scope.started_at)
        .order("created_at",{ascending:false}).limit(100),
    ]);
    if (pilotRows.error || seedRows.error || adminRows.error) throw pilotRows.error || seedRows.error || adminRows.error;
    const rows = mergePilotReviewQueue([...(pilotRows.data || []),...(adminRows.data || [])],seedRows.data || [],scope,100);
    const ids = rows.map(r=>r.id);
    let reviewRows = [];
    if (ids.length) {
      const result = await supabaseAdmin.from("branch_response_reviews")
        .select("query_id,verdict,suggested_answer,comment,updated_at")
        .eq("reviewer_profile_id",access.actor.id).in("query_id",ids);
      if (result.error) throw result.error;
      reviewRows = result.data || [];
    }
    const reviewMap = new Map(reviewRows.map(r=>[String(r.query_id),r]));
    const branchIds = [...new Set(rows.map(r=>r.branch_id).filter(Boolean))];
    const swIds = [...new Set(rows.map(r=>r.social_work_id).filter(Boolean))];
    const [branches,works] = await Promise.all([
      branchIds.length ? supabaseAdmin.from("branches").select("id,name").in("id",branchIds) : {data:[],error:null},
      swIds.length ? supabaseAdmin.from("social_works").select("id,name").in("id",swIds) : {data:[],error:null},
    ]);
    if (branches.error || works.error) throw branches.error || works.error;
    const branchMap = new Map((branches.data || []).map(b=>[String(b.id),b.name]));
    const workMap = new Map((works.data || []).map(w=>[String(w.id),w.name]));
    return Response.json({ok:true,limit:100,rows:rows.map(r=>({
      ...r,
      branch_name:r.traffic_type === "ADMIN" ? "Administración (prueba)" : (branchMap.get(String(r.branch_id)) || "Sucursal"),
      social_work_name:workMap.get(String(r.social_work_id)) || "No identificada",
      review:reviewMap.get(String(r.id)) || null,
    }))}, {headers:{"Cache-Control":"no-store"}});
  } catch(error) {
    console.error("GET validacion operativa",error);
    return jsonError("No se pudo cargar la cola de validación del piloto",500);
  }
}

export async function POST(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return jsonError(access.error,access.status);
  try {
    const b = await request.json();
    const queryId = Number(b.queryId), verdict = String(b.verdict || "").toUpperCase();
    const comment = String(b.comment || "").trim().slice(0,3000);
    const suggested = String(b.suggestedAnswer || "").trim().slice(0,12000);
    if (!Number.isSafeInteger(queryId) || queryId<=0 || !ALLOWED.has(verdict))
      return jsonError("Validación inválida",400);
    const [scope,result] = await Promise.all([
      pilotScope(),
      supabaseAdmin.from("assistant_query_log").select(SELECT).eq("id",queryId).maybeSingle(),
    ]);
    if (result.error) throw result.error;
    if (!isPilotReviewable(result.data,scope))
      return jsonError("La consulta no pertenece al alcance operativo del piloto",404);
    const {data,error} = await supabaseAdmin.from("branch_response_reviews")
      .upsert({query_id:queryId,reviewer_profile_id:access.actor.id,verdict,
        comment,suggested_answer:suggested,updated_at:new Date().toISOString()},
        {onConflict:"query_id,reviewer_profile_id"})
      .select("query_id,verdict").single();
    if (error) throw error;
    // v3.13.21 — una respuesta incorrecta/parcial no debe seguir sirviéndose
    // desde la caché; la corrección sugerida pasa a usarse en las próximas respuestas.
    let correctionActive = false;
    if (verdict !== "CORRECT") {
      await deactivateCachedAnswers(supabaseAdmin,result.data.social_work_id,result.data.normalized_question);
      correctionActive = Boolean(suggested);
    }
    return Response.json({ok:true,review:data,correction_active:correctionActive});
  } catch(error) {
    console.error("POST validacion operativa",error);
    return jsonError("No se pudo guardar la revisión",500);
  }
}
