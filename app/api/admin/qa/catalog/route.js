import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { validateQaSecret } from "../../../../../lib/qa/qa-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    if (!validateQaSecret(request)) {
      return Response.json({ ok:false, error:"QA secret inválido" }, { status:403 });
    }

    const [swRes, linksRes, normRes] = await Promise.all([
      supabaseAdmin.from("social_works").select(`id,name,recipe_type,recipe_validity_days,letterhead,rp,diagnosis,monodrug,commercial_name,substitution,active,robinson`).eq("active", true).eq("robinson", false).order("name"),
      supabaseAdmin.from("normative_social_works").select("normative_id,social_work_id,is_primary"),
      supabaseAdmin.from("normatives").select(`id,title,status,is_current,processing_selected,openai_file_id,openai_vector_store_file_id,openai_vector_store_id,openai_status,error_message`).eq("is_current", true)
    ]);

    if (swRes.error) throw swRes.error;
    if (linksRes.error) throw linksRes.error;
    if (normRes.error) throw normRes.error;

    const normMap = new Map((normRes.data || []).map(n => [Number(n.id), n]));
    const bySw = new Map();
    for (const link of linksRes.data || []) {
      const n = normMap.get(Number(link.normative_id));
      if (!n) continue;
      const key = Number(link.social_work_id);
      if (!bySw.has(key)) bySw.set(key, []);
      bySw.get(key).push({ ...n, is_primary: !!link.is_primary });
    }

    const socialWorks = (swRes.data || []).map(sw => ({
      ...sw,
      normatives: bySw.get(Number(sw.id)) || []
    }));

    return Response.json({ ok:true, social_works:socialWorks });
  } catch (error) {
    return Response.json({ ok:false, error:error?.message || "No se pudo cargar catálogo QA" }, { status:500 });
  }
}
