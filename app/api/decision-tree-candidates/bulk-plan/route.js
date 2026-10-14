import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { requireActor, failure } from "../../../../lib/decision-trees/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No external API is invoked here. This is a read-only inventory of eligible
// (social work, normative) pairs, including their existing generation history.
const PAGE_SIZE = 500;
const MAX_PAGES = 40;

async function readAll(table, columns, configure) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    let query = supabaseAdmin.from(table).select(columns);
    if (configure) query = configure(query);
    const { data, error } = await query
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
  throw new Error(`Demasiados registros en ${table}; acotá la consulta antes de iniciar la generación masiva.`);
}

export async function GET(request) {
  const auth = await requireActor(request, true);
  if (auth.error) return auth.error;
  // Inventario y operación masiva: exclusivos de Superadmin.
  // No se confía en el rol informado por el navegador.
  if (auth.actor.is_super_admin !== true) {
    return failure("Generación masiva reservada a Superadmin", 403);
  }

  try {
    const [works, norms, relations, candidates, trees] = await Promise.all([
      readAll("social_works", "id,name,active", q => q.eq("active", true)),
      readAll("normatives", "id,title,original_filename,is_current,openai_status", q => q.eq("is_current", true)),
      readAll("normative_social_works", "id,normative_id,social_work_id"),
      readAll("decision_tree_candidates", "id,normative_id,social_work_id"),
      readAll("decision_trees", "id,normative_id,social_work_id"),
    ]);

    const workById = new Map(works.map(w => [String(w.id), w]));
    const normById = new Map(norms.map(n => [String(n.id), n]));
    const existingCounts = new Map();

    for (const r of [...candidates, ...trees]) {
      if (!r.normative_id || !r.social_work_id) continue;
      const key = `${r.social_work_id}:${r.normative_id}`;
      existingCounts.set(key, (existingCounts.get(key) || 0) + 1);
    }

    // Relation can be repeated by scope/billing channel. One pair is one AI call.
    const uniquePairs = new Set();
    const items = [];
    for (const relation of relations) {
      const work = workById.get(String(relation.social_work_id));
      const norm = normById.get(String(relation.normative_id));
      if (!work || !norm) continue;
      const key = `${work.id}:${norm.id}`;
      if (uniquePairs.has(key)) continue;
      uniquePairs.add(key);
      const indexed = norm.openai_status === "completed";
      const existing = existingCounts.get(key) || 0;
      items.push({
        key,
        social_work_id: work.id,
        social_work_name: work.name,
        normative_id: norm.id,
        normative_title: norm.title || norm.original_filename || `Normativa ${norm.id}`,
        openai_status: norm.openai_status || null,
        existing_count: existing,
        status: existing > 0 ? "EXISTING" : indexed ? "READY" : "NOT_INDEXED",
      });
    }

    items.sort((a, b) =>
      a.social_work_name.localeCompare(b.social_work_name, "es") ||
      a.normative_title.localeCompare(b.normative_title, "es") ||
      Number(a.normative_id) - Number(b.normative_id)
    );

    return Response.json({
      ok: true,
      items,
      summary: {
        total: items.length,
        ready: items.filter(i => i.status === "READY").length,
        existing: items.filter(i => i.status === "EXISTING").length,
        not_indexed: items.filter(i => i.status === "NOT_INDEXED").length,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/decision-tree-candidates/bulk-plan", error);
    return failure("No se pudo preparar el lote: " + error.message, 500);
  }
}
