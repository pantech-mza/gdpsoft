import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { requireAdminActor } from "../../../../../lib/server/gdp-actor";
export const runtime="nodejs"; export const dynamic="force-dynamic";

export async function GET(request){
  try{
    const url=new URL(request.url); const profileId=url.searchParams.get("profileId");
    const access=await requireAdminActor(request); if (!access.actor) return Response.json({ok:false,error:access.error},{status:access.status}); if (!access.actor.is_super_admin) return Response.json({ok:false,error:"Acceso exclusivo Superadmin"},{status:403});
    const page=Math.max(1,Number(url.searchParams.get("page")||1)); const pageSize=Math.min(100,Math.max(5,Number(url.searchParams.get("pageSize")||20)));
    const section=url.searchParams.get("section")||"queries"; const from=(page-1)*pageSize,to=from+pageSize-1;
    const baseQ=()=>supabaseAdmin.from("assistant_query_log").select("*",{count:"exact"}).eq("traffic_type","PILOT");
    const [{count:queries},{count:images},{count:errors},{data:slow}] = await Promise.all([
      baseQ().select("id",{count:"exact",head:true}),
      baseQ().eq("has_image",true).select("id",{count:"exact",head:true}),
      baseQ().not("error_code","is",null).select("id",{count:"exact",head:true}),
      baseQ().select("elapsed_ms").order("elapsed_ms",{ascending:false}).limit(500)
    ]);
    const times=(slow||[]).map(x=>Number(x.elapsed_ms)).filter(Number.isFinite);
    const avg=times.length?Math.round(times.reduce((a,b)=>a+b,0)/times.length):0;
    const p95=times.length?[...times].sort((a,b)=>a-b)[Math.min(times.length-1,Math.ceil(.95*times.length)-1)]:0;
    let data=[],count=0,error=null;
    if(section==="bugs"){
      const r=await supabaseAdmin.from("assistant_quality_event").select("*",{count:"exact"}).eq("traffic_type","PILOT").order("created_at",{ascending:false}).range(from,to); data=r.data||[];count=r.count||0;error=r.error;
    } else {
      let q=baseQ().order("created_at",{ascending:false}); if(section==="images") q=q.eq("has_image",true); if(section==="performance") q=q.order("elapsed_ms",{ascending:false});
      const r=await q.range(from,to); data=r.data||[];count=r.count||0;error=r.error;
    }
    if(error) throw error;
    return Response.json({ok:true,kpis:{queries:queries||0,images:images||0,bugs:errors||0,avg_ms:avg,p95_ms:p95},rows:data,pagination:{page,pageSize,total:count,totalPages:Math.max(1,Math.ceil(count/pageSize))}});
  }catch(error){return Response.json({ok:false,error:error?.message||"No se pudo cargar piloto"},{status:500});}
}
