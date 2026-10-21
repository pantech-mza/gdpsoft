import OpenAI from "openai";
import { requireActor, failure } from "../../../../lib/decision-trees/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v3.13.47 — editar y eliminar normativas desde el menú «⋯» de la ficha (solo administración).
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function parseId(params) {
  const { id } = await params;
  const normativeId = Number(id);
  return Number.isInteger(normativeId) && normativeId > 0 ? normativeId : null;
}

export async function PATCH(request, { params }) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  const normativeId = await parseId(params);
  if (!normativeId) return failure("Normativa inválida");
  const body = await request.json().catch(() => ({}));
  const update = {};
  if (body.title !== undefined) {
    const title = String(body.title ?? "").trim().slice(0, 200);
    if (title.length < 3) return failure("El título debe tener al menos 3 caracteres.");
    update.title = title;
  }
  for (const key of ["effective_from", "effective_to"]) {
    if (body[key] === undefined) continue;
    const value = body[key] === null || body[key] === "" ? null : String(body[key]);
    if (value !== null && !DATE_RE.test(value)) return failure("Fecha inválida.");
    update[key] = value;
  }
  if (!Object.keys(update).length) return failure("No hay cambios para guardar.");
  const { data, error } = await supabaseAdmin
    .from("normatives")
    .update(update)
    .eq("id", normativeId)
    .select("id,title,effective_from,effective_to")
    .maybeSingle();
  if (error) return failure(error.message, 500);
  if (!data) return failure("Normativa no encontrada", 404);
  return Response.json({ ok: true, normative: data });
}

export async function DELETE(request, { params }) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  const normativeId = await parseId(params);
  if (!normativeId) return failure("Normativa inválida");

  const { data: normative, error: readError } = await supabaseAdmin
    .from("normatives")
    .select("id,storage_path_original,storage_path_processed,openai_file_id,openai_vector_store_file_id,openai_vector_store_id")
    .eq("id", normativeId)
    .maybeSingle();
  if (readError) return failure(readError.message, 500);
  if (!normative) return failure("Normativa no encontrada", 404);

  // 1) Que el bot deje de usarla: se quita del índice de OpenAI (si estaba indexada).
  const vectorStoreId = normative.openai_vector_store_id || process.env.OPENAI_VECTOR_STORE_ID;
  const fileId = normative.openai_file_id;
  try {
    if (vectorStoreId && (normative.openai_vector_store_file_id || fileId)) {
      const removeFromStore = openai.vectorStores.files.delete || openai.vectorStores.files.del;
      await removeFromStore.call(openai.vectorStores.files, normative.openai_vector_store_file_id || fileId, { vector_store_id: vectorStoreId });
    }
  } catch (openaiError) {
    console.warn("normativa: no se pudo quitar del vector store:", openaiError?.message);
  }
  try {
    if (fileId) await openai.files.delete(fileId);
  } catch (openaiError) {
    console.warn("normativa: no se pudo borrar el archivo en OpenAI:", openaiError?.message);
  }

  // 2) Respuestas guardadas que se apoyaban en esta normativa.
  await supabaseAdmin.from("assistant_answer_cache").update({ active: false }).eq("normative_id", normativeId);

  // 3) Vínculos con obras sociales y archivos almacenados.
  await supabaseAdmin.from("normative_social_works").delete().eq("normative_id", normativeId);
  const originalPaths = [normative.storage_path_original].filter(Boolean);
  const processedPaths = [normative.storage_path_processed].filter(Boolean);
  try {
    if (originalPaths.length) await supabaseAdmin.storage.from("normativas-originales").remove(originalPaths);
    if (processedPaths.length) await supabaseAdmin.storage.from("normativas-procesadas").remove(processedPaths);
  } catch (storageError) {
    console.warn("normativa: no se pudieron borrar los archivos:", storageError?.message);
  }

  // 4) Registro. Si otra tabla todavía lo referencia, se archiva (deja de estar vigente).
  const { error: deleteError } = await supabaseAdmin.from("normatives").delete().eq("id", normativeId);
  if (deleteError) {
    const { error: archiveError } = await supabaseAdmin
      .from("normatives")
      .update({ is_current: false, status: "ARCHIVED" })
      .eq("id", normativeId);
    if (archiveError) return failure(deleteError.message, 500);
    return Response.json({ ok: true, archived: true });
  }
  return Response.json({ ok: true, deleted: true });
}
