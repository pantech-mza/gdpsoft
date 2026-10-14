import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { requireActor, failure } from "../../../../lib/decision-trees/auth";
import { validateTree } from "../../../../lib/decision-trees/validate";
import { hasUnresolvedReview } from "../../../../lib/decision-trees/recover";
import { checkPublicationCircuit } from "../../../../lib/decision-trees/circuits";
export const dynamic = "force-dynamic";
const validId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;

export async function PATCH(request, { params }) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  const { id: paramId } = await params;
  if (!validId(paramId)) return failure("ID inválido");
  const id = Number(paramId);
  const { data: current, error: currentError } = await supabaseAdmin.from("decision_trees")
    .select("id,social_work_id,normative_id,status,published,active,tree_json,approved_at")
    .eq("id", id).maybeSingle();
  if (currentError) return failure(currentError.message, 500);
  if (!current || current.status === "ARCHIVED") return failure("Árbol inexistente", 404);
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const payload = { updated_at: now, updated_by: auth.actor.id };
  const publish = body.published === true;
  const unpublish = body.published === false;
  const approve = body.status === "APPROVED" && !publish;
  const requestedEdit = ["title", "description", "tree_json", "source_pages"].some(k => Object.prototype.hasOwnProperty.call(body, k));
  if (current.published && requestedEdit) return failure("No se edita un árbol publicado. Duplicalo como borrador, revisá y publicá la nueva versión.", 409);
  if (requestedEdit && current.status === "APPROVED") return failure("Duplicá el árbol aprobado como borrador para editarlo", 409);
  if (requestedEdit && (publish || unpublish || approve)) return failure("Guardá los cambios antes de aprobar o publicar");
  if (body.status && !approve) return failure("La acción de estado solicitada no está permitida");
  if (requestedEdit) {
    if (typeof body.title !== "undefined") {
      const title = String(body.title || "").trim();
      if (!title || title.length > 200) return failure("Título obligatorio (máx. 200 caracteres)");
      payload.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) payload.description = String(body.description || "").trim() || null;
    if (Object.prototype.hasOwnProperty.call(body, "source_pages")) payload.source_pages = String(body.source_pages || "").trim() || null;
    if (Object.prototype.hasOwnProperty.call(body, "tree_json")) {
      if (!body.tree_json || typeof body.tree_json !== "object" || Array.isArray(body.tree_json)) return failure("JSON del árbol inválido");
      payload.tree_json = body.tree_json;
    }
  }
  if ((approve || publish) && (current.tree_json?.requires_manual_review || hasUnresolvedReview(current.tree_json))) {
    return failure("El árbol tiene pasos PENDIENTE DE REVISIÓN. Completalos según la normativa y guardá una versión revisada antes de aprobar o publicar.", 409);
  }
  if (approve) {
    if (current.status !== "DRAFT") return failure("Solo se pueden aprobar borradores", 409);
    const errors = validateTree(current.tree_json);
    if (errors.length) return failure(`Árbol incompleto: ${errors.join("; ")}`);
    payload.status = "APPROVED";
    payload.approved_by = auth.actor.id;
    payload.approved_at = now;
  }
  if (publish) {
    const circuitIssue = await checkPublicationCircuit(current.social_work_id, current.normative_id);
    if (circuitIssue) return failure(circuitIssue, 409);
    if (current.published || current.status !== "APPROVED" || !current.approved_at) return failure("Primero aprobá el árbol desde Administración", 409);
    const errors = validateTree(current.tree_json);
    if (errors.length) return failure(`No se puede publicar: ${errors.join("; ")}`);
    if (current.normative_id) {
      const { data: normative } = await supabaseAdmin.from("normatives").select("id,is_current").eq("id", current.normative_id).maybeSingle();
      if (!normative?.is_current) return failure("La normativa de origen ya no está vigente", 409);
    }
    payload.published = true;
    payload.active = true;
    payload.status = "PUBLISHED";
    payload.published_at = now;
  } else if (unpublish) {
    if (!current.published) return failure("El árbol no está publicado", 409);
    payload.published = false;
    payload.status = "APPROVED";
    payload.published_at = null;
  }
  if (!requestedEdit && !approve && !publish && !unpublish) return failure("No se enviaron cambios válidos");
  let query = supabaseAdmin.from("decision_trees").update(payload).eq("id", id).eq("status", current.status).eq("published", current.published);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) return failure(error.message, 500);
  if (!data) return failure("El árbol cambió mientras se editaba. Actualizá y reintentá.", 409);
  return Response.json({ ok: true, tree: data });
}

export async function DELETE(request, { params }) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  const { id } = await params;
  if (!validId(id)) return failure("ID inválido");
  const { data, error } = await supabaseAdmin.from("decision_trees").update({
    status: "ARCHIVED", active: false, published: false, published_at: null,
    updated_by: auth.actor.id, updated_at: new Date().toISOString(),
  }).eq("id", Number(id)).neq("status", "ARCHIVED").select("id").maybeSingle();
  return error ? failure(error.message, 500) : !data ? failure("Árbol inexistente", 404) : Response.json({ ok: true });
}
