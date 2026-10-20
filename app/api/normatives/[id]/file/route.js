import { supabaseAdmin } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v3.13.38 — «Ver fuente / Ver documento» de archivos subidos desde el panel.
// El acceso lo valida proxy.js (sesión activa). El enlace al archivo se genera
// en el momento del clic, por lo que el botón funciona siempre.
export async function GET(request, { params }) {
  const { id } = await params;
  const normativeId = Number(id);
  if (!Number.isInteger(normativeId) || normativeId <= 0) {
    return Response.json({ ok: false, error: "Normativa inválida" }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin
    .from("normatives")
    .select("id, source_url, storage_path_original, original_filename")
    .eq("id", normativeId)
    .maybeSingle();
  if (error || !data) {
    return Response.json({ ok: false, error: "Normativa no encontrada" }, { status: 404 });
  }
  if (data.source_url) return Response.json({ ok: true, url: data.source_url });
  if (!data.storage_path_original) {
    return Response.json({ ok: false, error: "La normativa no tiene archivo asociado" }, { status: 404 });
  }
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("normativas-originales")
    .createSignedUrl(data.storage_path_original, 300, { download: false });
  if (signError || !signed?.signedUrl) {
    return Response.json({ ok: false, error: "No se pudo abrir el archivo" }, { status: 500 });
  }
  return Response.json({ ok: true, url: signed.signedUrl });
}
