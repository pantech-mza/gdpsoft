import { supabaseAdmin } from "../../../../../../lib/supabase/admin";
import { randomUUID } from "node:crypto";
export const runtime = "nodejs";
const BUCKET = "gdp-billing-files";
export async function POST(request, { params }) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: auth, error: authError } = token ? await supabaseAdmin.auth.getUser(token) : { data: null, error: true };
  if (authError || !auth?.user) return Response.json({ ok: false, error: "No autorizado" }, { status: 403 });
  const { data: p } = await supabaseAdmin.from("profiles").select("active,role,is_super_admin").eq("id", auth.user.id).maybeSingle();
  if (!p?.active || !(p.is_super_admin || p.role === "ADMIN")) return Response.json({ ok: false, error: "Sin permisos" }, { status: 403 });
  const { id } = await params;
  const swId = Number(id);
  if (!Number.isSafeInteger(swId) || swId < 1) return Response.json({ ok: false, error: "Obra social inválida" }, { status: 400 });
  const { data: sw } = await supabaseAdmin.from("social_works").select("id").eq("id", swId).maybeSingle();
  if (!sw) return Response.json({ ok: false, error: "Obra social inexistente" }, { status: 404 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const title = String(form?.get("title") || "").trim().slice(0, 200);
  const description = String(form?.get("description") || "").trim().slice(0, 1000);
  if (!(file instanceof File) || !title || !file.size || file.size > 50 * 1024 * 1024 || !["application/pdf", "video/mp4", "video/webm"].includes(file.type)) return Response.json({ ok: false, error: "Adjuntá un PDF o video MP4/WebM de hasta 50 MB y un título" }, { status: 400 });
  const extension = file.type === "application/pdf" ? "pdf" : file.type === "video/mp4" ? "mp4" : "webm";
  const path = `${swId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) return Response.json({ ok: false, error: uploadError.message }, { status: 500 });
  const { error } = await supabaseAdmin.from("social_work_billing_files").insert({ social_work_id: swId, title, description, file_name: String(file.name).slice(0, 300), storage_path: path, mime_type: file.type, bytes: file.size });
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
