import crypto from "crypto";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";
import { validateQaSecret } from "../../../../../lib/qa/qa-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "assistant-images";
function safeName(v="image") { return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-"); }

export async function POST(request) {
  try {
    if (!validateQaSecret(request)) return Response.json({ok:false,error:"QA secret inválido"},{status:403});
    const form = await request.formData();
    const file = form.get("file");
    const conversationId = String(form.get("conversationId") || "");
    if (!conversationId) return Response.json({ok:false,error:"Falta conversationId"},{status:400});
    if (!file || typeof file.arrayBuffer !== "function") return Response.json({ok:false,error:"Falta archivo"},{status:400});
    if (!String(file.type || "").startsWith("image/")) return Response.json({ok:false,error:"El archivo debe ser una imagen"},{status:400});
    if (Number(file.size || 0) > 10*1024*1024) return Response.json({ok:false,error:"Máximo 10 MB"},{status:400});

    const { data: conv, error: convErr } = await supabaseAdmin.from("conversations").select("id,branch_id,device_id").eq("id",conversationId).maybeSingle();
    if (convErr) throw convErr;
    if (!conv) return Response.json({ok:false,error:"Conversación QA no encontrada"},{status:404});

    await supabaseAdmin.from("conversation_images").update({is_active:false}).eq("conversation_id",conversationId).eq("is_active",true);

    const id = crypto.randomUUID();
    const filename = safeName(file.name || "qa-image.jpg");
    const storagePath = `qa/${conversationId}/${id}-${filename}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, buffer, { contentType:file.type || "image/jpeg", upsert:false });
    if (uploadErr) throw uploadErr;

    const { data:image, error:insertErr } = await supabaseAdmin.from("conversation_images").insert({
      id,
      conversation_id: conversationId,
      branch_id: conv.branch_id,
      device_id: conv.device_id,
      storage_path: storagePath,
      original_filename: file.name || filename,
      mime_type: file.type || "image/jpeg",
      file_size_bytes: Number(file.size || buffer.length),
      status: "UPLOADED",
      is_active: true,
      analysis: null,
      analysis_error: null
    }).select("id,conversation_id,storage_path,original_filename,status,is_active").single();
    if (insertErr) {
      await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
      throw insertErr;
    }
    return Response.json({ok:true,image});
  } catch (error) {
    return Response.json({ok:false,error:error?.message || "No se pudo cargar imagen QA"},{status:500});
  }
}
