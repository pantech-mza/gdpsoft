import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { requireActor, failure } from "../../../../lib/decision-trees/auth";
import { validateTree } from "../../../../lib/decision-trees/validate";
import { hasUnresolvedReview } from "../../../../lib/decision-trees/recover";
export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1) return failure("Candidato inválido");
  const body = await request.json().catch(() => ({}));
  const action = body.action;
  if (!["EDIT", "APPROVE", "REJECT"].includes(action)) return failure("Acción inválida");
  const { data: candidate, error: candidateError } = await supabaseAdmin.from("decision_tree_candidates")
    .select("id,social_work_id,normative_id,title,description,source_pages,generated_json,status,confidence")
    .eq("id", id).maybeSingle();
  if (candidateError) return failure(candidateError.message, 500);
  if (!candidate) return failure("Candidato inexistente", 404);
  if (candidate.status !== "SUGGESTED") return failure("Solo se pueden editar, aprobar o rechazar sugerencias pendientes", 409);
  const now = new Date().toISOString();
  if (action === "EDIT") {
    const payload = { updated_at: now };
    if (Object.prototype.hasOwnProperty.call(body, "title")) {
      const title = String(body.title || "").trim();
      if (!title || title.length > 200) return failure("Título obligatorio (máx. 200 caracteres)");
      payload.title = title;
    }
    if (Object.prototype.hasOwnProperty.call(body, "description")) payload.description = String(body.description || "").trim() || null;
    if (Object.prototype.hasOwnProperty.call(body, "source_pages")) payload.source_pages = String(body.source_pages || "").trim() || null;
    if (Object.prototype.hasOwnProperty.call(body, "generated_json")) {
      if (!body.generated_json || typeof body.generated_json !== "object" || Array.isArray(body.generated_json)) return failure("JSON inválido");
      // Si Admin corrigió TODOS los destinos de bloqueo y el grafo es válido,
      // retirar la bandera de revisión. Guardar cambios no aprueba ni publica.
      const supplied = body.generated_json;
      if (candidate.generated_json?.requires_manual_review && !hasUnresolvedReview(supplied) && validateTree(supplied).length === 0) {
        const { requires_manual_review, review_notes, ...reviewedGraph } = supplied;
        payload.generated_json = reviewedGraph;
      } else if (candidate.generated_json?.requires_manual_review) {
        payload.generated_json = { ...supplied, requires_manual_review: true, review_notes: candidate.generated_json.review_notes || [] };
      } else {
        payload.generated_json = supplied;
      }
    }
    const { data, error } = await supabaseAdmin.from("decision_tree_candidates").update(payload).eq("id", id).eq("status", "SUGGESTED").select("*").maybeSingle();
    return error ? failure(error.message, 500) : !data ? failure("El candidato cambió. Actualizá la pantalla", 409) : Response.json({ ok: true, candidate: data });
  }
  if (action === "REJECT") {
    const { data, error } = await supabaseAdmin.from("decision_tree_candidates").update({
      status: "REJECTED", reviewed_by: auth.actor.id, reviewed_at: now, updated_at: now,
    }).eq("id", id).eq("status", "SUGGESTED").select("*").maybeSingle();
    return error ? failure(error.message, 500) : !data ? failure("El candidato cambió. Actualizá", 409) : Response.json({ ok: true, candidate: data });
  }
  if (candidate.generated_json?.requires_manual_review || hasUnresolvedReview(candidate.generated_json)) {
    return failure("Esta propuesta contiene pasos marcados PENDIENTE DE REVISIÓN. Abrí el editor visual, completá cada paso según la normativa y guardá los cambios antes de aprobar.", 409);
  }
  const errors = validateTree(candidate.generated_json);
  if (errors.length) return failure(`Revisá el recorrido: ${errors.join("; ")}`);
  if (!candidate.normative_id) return failure("La sugerencia no tiene normativa asociada");
  const { data: normative } = await supabaseAdmin.from("normatives").select("id,is_current").eq("id", candidate.normative_id).maybeSingle();
  if (!normative?.is_current) return failure("La normativa no está vigente", 409);
  const { data: relation } = await supabaseAdmin.from("normative_social_works").select("id").eq("social_work_id", candidate.social_work_id).eq("normative_id", candidate.normative_id).maybeSingle();
  if (!relation) return failure("La normativa no pertenece a la obra social", 409);
  const { data: already } = await supabaseAdmin.from("decision_trees").select("id").eq("candidate_id", id).neq("status", "ARCHIVED").maybeSingle();
  if (already) return failure("Este candidato ya tiene un árbol aprobado", 409);
  const { data: tree, error: treeError } = await supabaseAdmin.from("decision_trees").insert({
    social_work_id: candidate.social_work_id, normative_id: candidate.normative_id,
    candidate_id: id, title: candidate.title, description: candidate.description,
    origin: "GENERATED_FROM_NORMATIVE", status: "APPROVED", tree_json: candidate.generated_json,
    source_pages: candidate.source_pages, confidence: candidate.confidence,
    active: true, published: false, created_by: auth.actor.id, updated_by: auth.actor.id,
    approved_by: auth.actor.id, approved_at: now,
  }).select("*").single();
  if (treeError) return failure(treeError.message, 500);
  const { data: updated, error: updatedError } = await supabaseAdmin.from("decision_tree_candidates").update({
    status: "APPROVED", reviewed_by: auth.actor.id, reviewed_at: now, updated_at: now,
  }).eq("id", id).eq("status", "SUGGESTED").select("*").maybeSingle();
  if (updatedError || !updated) {
    await supabaseAdmin.from("decision_trees").delete().eq("id", tree.id);
    return failure("No se pudo finalizar la aprobación. Reintentá.", 409);
  }
  return Response.json({ ok: true, candidate: updated, tree });
}
