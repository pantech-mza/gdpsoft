import { requireAdminActor, jsonError } from "../../../../../lib/server/gdp-actor";
import { supabaseAdmin } from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v3.13.89 — URL temporal (10 min) de una imagen que la sucursal adjuntó en el chat.
// Solo administradores; la imagen puede contener datos de pacientes y no se expone públicamente.
export async function GET(request) {
  const access = await requireAdminActor(request);
  if (!access.actor) return jsonError(access.error, access.status);
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Imagen inválida", 400);
    const { data, error } = await supabaseAdmin.from("conversation_images")
      .select("storage_path,original_filename,mime_type").eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw error;
    if (!data?.storage_path) return jsonError("Imagen no encontrada", 404);
    const signed = await supabaseAdmin.storage.from("assistant-images").createSignedUrl(data.storage_path, 600);
    if (signed.error || !signed.data?.signedUrl) return jsonError("No se pudo generar la vista de la imagen", 500);
    return Response.json({ ok: true, url: signed.data.signedUrl, name: data.original_filename || "Imagen", mime: data.mime_type || "" },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET validacion imagen", error);
    return jsonError("No se pudo abrir la imagen", 500);
  }
}
