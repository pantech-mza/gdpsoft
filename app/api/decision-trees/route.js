import { supabaseAdmin } from "../../../lib/supabase/admin";
import { requireActor, failure } from "../../../lib/decision-trees/auth";
import { validateTree } from "../../../lib/decision-trees/validate";
import { attachCircuitContext } from "../../../lib/decision-trees/circuits";
export const dynamic = "force-dynamic";

const FIELDS = `id,social_work_id,normative_id,candidate_id,title,description,origin,status,tree_json,source_pages,confidence,active,published,created_by,updated_by,approved_by,approved_at,published_at,created_at,updated_at,social_works(id,name,active),normatives(id,title,original_filename,status,is_current)`;
const positiveId = (x) => Number.isSafeInteger(Number(x)) && Number(x) > 0;

export async function GET(request) {
  const auth = await requireActor(request);
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const sw = params.get("social_work_id");
  if (sw && !positiveId(sw)) return failure("Obra social inválida");
  let query = supabaseAdmin.from("decision_trees").select(FIELDS)
    .neq("status", "ARCHIVED").order("updated_at", { ascending: false }).limit(1000);
  if (sw) query = query.eq("social_work_id", Number(sw));
  if (!auth.actor.admin) {
    query = query.eq("published", true).eq("active", true).eq("status", "PUBLISHED");
  } else {
    const status = params.get("status");
    if (status) query = query.eq("status", status);
    if (params.get("published") === "true") query = query.eq("published", true).eq("active", true).eq("status", "PUBLISHED");
    if (params.get("published") === "false") query = query.eq("published", false);
  }
  const { data, error } = await query;
  if (error) return failure(error.message, 500);
  const trees = auth.actor.admin ? (data || []) : (data || []).filter(tree =>
    tree.social_works?.active !== false && (!tree.normative_id || tree.normatives?.is_current === true)
  );
  try {
    const annotated = await attachCircuitContext(trees);
    const channelId = params.get("billing_channel_id");
    if (channelId && !positiveId(channelId)) return failure("Circuito inválido");
    const matching = channelId ? annotated.filter(t => Number(t.billing_channel_id) === Number(channelId)) : annotated;
    return Response.json({ ok: true, count: matching.length, trees: matching });
  } catch (err) { return failure(err.message || "Error identificando circuitos", 500); }
}

export async function POST(request) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const sw = Number(body.social_work_id);
  if (!positiveId(sw)) return failure("Seleccioná una obra social");
  const title = String(body.title || "").trim();
  if (!title || title.length > 200) return failure("Título obligatorio (máx. 200 caracteres)");
  if (body.origin && body.origin !== "MANUAL") return failure("Los árboles de IA deben aprobarse desde sus candidatos");
  const normativeId = body.normative_id ? Number(body.normative_id) : null;
  if (normativeId && !positiveId(normativeId)) return failure("Normativa inválida");
  if (normativeId) {
    const { data: relation } = await supabaseAdmin.from("normative_social_works")
      .select("id").eq("social_work_id", sw).eq("normative_id", normativeId).maybeSingle();
    if (!relation) return failure("La normativa indicada no pertenece a esta obra social", 409);
  }
  const tree = body.tree_json || { start_node: "", nodes: [] };
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) return failure("Árbol JSON inválido");
  const { data: social } = await supabaseAdmin.from("social_works").select("id").eq("id", sw).maybeSingle();
  if (!social) return failure("La obra social no existe", 404);
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("decision_trees").insert({
    social_work_id: sw, normative_id: normativeId, candidate_id: null,
    title, description: String(body.description || "").trim() || null,
    origin: "MANUAL", status: "DRAFT", tree_json: tree,
    source_pages: String(body.source_pages || "").trim() || null,
    confidence: null, active: true, published: false,
    created_by: auth.actor.id, updated_by: auth.actor.id, updated_at: now,
  }).select("*").single();
  return error ? failure(error.message, 500) : Response.json({ ok: true, tree: data }, { status: 201 });
}
