import {
  supabaseAdmin,
} from "../../../lib/supabase/admin";
import { requireAdminActor } from "../../../lib/server/gdp-actor";
import { normalizeSocialWorkName, validateNewSocialWork } from "../../../lib/social-works/new-social-work.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const active =
      searchParams.get("active");

    // =====================================================
    // OBRAS SOCIALES
    // =====================================================

    let query =
      supabaseAdmin
        .from("social_works")
        .select(`
          id,
          id_soft,
          name,
          plan,
          status,
          recipe_type,
          recipe_validity_days,
          validator_name,
          validator_type,
          letterhead,
          rp,
          diagnosis,
          monodrug,
          commercial_name,
          substitution,
          observations,
          robinson,
          active,
          source_modified_at,
          created_at,
          updated_at
        `)
        .order(
          "name",
          {
            ascending: true,
          }
        );

    if (
      active === "true"
    ) {
      query =
        query.eq(
          "active",
          true
        );
    }

    if (
      active === "false"
    ) {
      query =
        query.eq(
          "active",
          false
        );
    }

    const {
      data: socialWorks,
      error: socialWorksError,
    } = await query;

    if (
      socialWorksError
    ) {
      throw new Error(
        socialWorksError.message
      );
    }

    // =====================================================
    // RELACIONES CON NORMATIVAS
    // =====================================================

    const {
      data: normativeLinks,
      error: normativeError,
    } =
      await supabaseAdmin
        .from(
          "normative_social_works"
        )
        .select(`
          social_work_id,
          normative_id
        `);

    if (
      normativeError
    ) {
      throw new Error(
        normativeError.message
      );
    }

    // =====================================================
    // FAQs
    // =====================================================

    const {
      data: faqRows,
      error: faqError,
    } =
      await supabaseAdmin
        .from(
          "social_work_faqs"
        )
        .select(`
          social_work_id,
          status,
          active
        `);

    if (
      faqError
    ) {
      throw new Error(
        faqError.message
      );
    }

    // =====================================================
    // CONTADORES
    // =====================================================

    const normativeCounts =
      new Map();

    for (
      const row of
        normativeLinks || []
    ) {
      const current =
        normativeCounts.get(
          row.social_work_id
        ) || 0;

      normativeCounts.set(
        row.social_work_id,
        current + 1
      );
    }

    const faqCounts =
      new Map();

    for (
      const row of
        faqRows || []
    ) {
      if (
        row.status !==
          "ARCHIVED" &&
        row.active !==
          false
      ) {
        const current =
          faqCounts.get(
            row.social_work_id
          ) || 0;

        faqCounts.set(
          row.social_work_id,
          current + 1
        );
      }
    }

    // =====================================================
    // RESPUESTA
    // =====================================================

    const result =
      (socialWorks || []).map(
        (socialWork) => ({
          ...socialWork,

          normative_count:
            normativeCounts.get(
              socialWork.id
            ) || 0,

          faq_count:
            faqCounts.get(
              socialWork.id
            ) || 0,
        })
      );

    return Response.json({
      ok: true,

      count:
        result.length,

      social_works:
        result,
    });
  } catch (error) {
    console.error(
      "Social Works GET error:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "Error obteniendo obras sociales",
      },
      {
        status: 500,
      }
    );
  }
}

// =====================================================
// POST - CREAR OBRA SOCIAL (solo administración)
// =====================================================
export async function POST(request) {
  try {
    const access = await requireAdminActor(request);
    if (!access.actor) return Response.json({ ok: false, error: access.error }, { status: access.status });
    const body = await request.json().catch(() => ({}));
    const validated = validateNewSocialWork(body);
    if (validated.error) return Response.json({ ok: false, error: validated.error }, { status: 400 });

    // Nombre único (sin distinguir mayúsculas ni tildes).
    const { data: existing, error: existingError } = await supabaseAdmin.from("social_works").select("id,name");
    if (existingError) throw new Error(existingError.message);
    const key = normalizeSocialWorkName(validated.value.name);
    const duplicate = (existing || []).find((row) => normalizeSocialWorkName(row.name) === key);
    if (duplicate) {
      return Response.json({ ok: false, error: `Ya existe una obra social llamada «${duplicate.name}».` }, { status: 409 });
    }

    let { data, error } = await supabaseAdmin.from("social_works").insert(validated.value).select("id,name,active").single();
    // Si la columna id no se genera sola, se asigna el siguiente número libre.
    if (error && /null value in column "id"/i.test(error.message || "")) {
      const nextId = (existing || []).reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;
      ({ data, error } = await supabaseAdmin.from("social_works").insert({ ...validated.value, id: nextId }).select("id,name,active").single());
    }
    if (error) throw new Error(error.message);
    return Response.json({ ok: true, social_work: data }, { status: 201 });
  } catch (error) {
    console.error("POST /api/social-works error:", error);
    return Response.json({ ok: false, error: error?.message || "No se pudo crear la obra social" }, { status: 500 });
  }
}
