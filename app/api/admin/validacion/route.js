import { requireAdminActor, jsonError } from "../../../../lib/server/gdp-actor";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ALLOWED = new Set(["CORRECT", "INCORRECT", "PARTIAL"]);
// La cola de Admin usa solamente tráfico PILOT: jamás importa la batería assistant_qa_results.
export async function GET(request) {
 const access = await requireAdminActor(request);
 if (!access.actor) return jsonError(access.error, access.status);
 try {
   const { data, error } = await supabaseAdmin.from("assistant_query_log")
     .select("id,branch_id,social_work_id,question,answer,created_at,source,route,elapsed_ms,found")
     .eq("traffic_type", "PILOT").not("branch_id", "is", null)
     .order("created_at", {ascending:false}).limit(100);
   if (error) throw error;
   const rows = (data||[]).filter(r=>r.question && r.answer);
   const ids = rows.map(r=>r.id);
   let reviewRows=[];
   if (ids.length) {
      const result=await supabaseAdmin.from("branch_response_reviews")
        .select("query_id,verdict,suggested_answer,comment,updated_at")
        .eq("reviewer_profile_id",access.actor.id).in("query_id",ids);
      if (result.error) throw result.error;
      reviewRows=result.data||[];
   }
   const reviewMap=new Map(reviewRows.map(r=>[String(r.query_id),r]));
   const branchIds=[...new Set(rows.map(r=>r.branch_id).filter(Boolean))];
   const swIds=[...new Set(rows.map(r=>r.social_work_id).filter(Boolean))];
   const [branches,works] = await Promise.all([
       branchIds.length?supabaseAdmin.from("branches").select("id,name").in("id",branchIds):{data:[]},
       swIds.length?supabaseAdmin.from("social_works").select("id,name").in("id",swIds):{data:[]},
   ]);
   if (branches.error||works.error) throw branches.error||works.error;
   const branchMap=new Map((branches.data||[]).map(b=>[String(b.id),b.name]));
   const workMap=new Map((works.data||[]).map(w=>[String(w.id),w.name]));
   return Response.json({ok:true,limit:100,rows:rows.map(r=>({...r,branch_name:branchMap.get(String(r.branch_id))||"Sucursal",social_work_name:workMap.get(String(r.social_work_id))||"No identificada",review:reviewMap.get(String(r.id))||null}))},{headers:{"Cache-Control":"no-store"}});
 } catch(e){console.error("GET validacion operativa",e);return jsonError("No se pudo cargar la cola de validación. Verificá la migración SQL de revisiones.",500)}
}
export async function POST(request){
 const access=await requireAdminActor(request);
 if (!access.actor) return jsonError(access.error,access.status);
 try {
   const b=await request.json();const queryId=Number(b.queryId),verdict=String(b.verdict||"").toUpperCase();
   const comment=String(b.comment||"").trim().slice(0,3000);
   const suggested=String(b.suggestedAnswer||"").trim().slice(0,12000);
   if (!Number.isSafeInteger(queryId)||queryId<=0||!ALLOWED.has(verdict))return jsonError("Validación inválida",400);
   const {data:source,error:se}=await supabaseAdmin.from("assistant_query_log")
      .select("id,branch_id").eq("id",queryId).eq("traffic_type","PILOT").not("branch_id","is",null).maybeSingle();
   if (se)throw se;if(!source)return jsonError("La consulta no pertenece a la cola operativa",404);
   const {data,error}=await supabaseAdmin.from("branch_response_reviews")
     .upsert({query_id:queryId,reviewer_profile_id:access.actor.id,verdict,comment,suggested_answer:suggested,updated_at:new Date().toISOString()}, {onConflict:"query_id,reviewer_profile_id"}).select("query_id,verdict").single();
   if(error)throw error;return Response.json({ok:true,review:data});
 } catch(e){console.error("POST validacion operativa",e);return jsonError("No se pudo guardar la revisión",500)}
}
