import { requireAdminActor } from "../../../../lib/server/gdp-actor";
import {
  supabaseAdmin,
} from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =====================================================
// GET - OBTENER UNA OBRA SOCIAL
// =====================================================

export async function GET(
  request,
  { params }
) {
  try {
    const { id } =
      await params;

    const socialWorkId =
      Number(id);

    if (
      !Number.isInteger(
        socialWorkId
      ) ||
      socialWorkId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID de obra social inválido",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "social_works"
        )
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
        .eq(
          "id",
          socialWorkId
        )
        .single();

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,
      social_work:
        data,
    });
  } catch (error) {
    console.error(
      "Social Work GET error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error obteniendo la obra social",
      },
      {
        status: 500,
      }
    );
  }
}

// =====================================================
// PATCH - EDITAR OBRA SOCIAL
// =====================================================

export async function PATCH(
  request,
  { params }
) {
  try {
    const access = await requireAdminActor(request);
    if (!access.actor) return Response.json({ok:false,error:access.error},{status:access.status});
    const { id } =
      await params;

    const socialWorkId =
      Number(id);

    if (
      !Number.isInteger(
        socialWorkId
      ) ||
      socialWorkId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID de obra social inválido",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await request.json();

    const allowedFields = [
      "name",
      "plan",
      "recipe_type",
      "recipe_validity_days",
      "letterhead",
      "rp",
      "diagnosis",
      "monodrug",
      "commercial_name",
      "substitution",
      "observations",
      "validator_name",
      "validator_type",
      "active",
    ];

    const payload = {};

    for (
      const field of
        allowedFields
    ) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          field
        )
      ) {
        payload[field] =
          body[field];
      }
    }

    for (const field of ["validator_name","validator_type","plan","recipe_type","letterhead","diagnosis","monodrug","commercial_name","substitution"]) {
      if (Object.prototype.hasOwnProperty.call(payload,field)) {
        const value = payload[field];
        payload[field] = value == null || String(value).trim() === "" ? null : String(value).trim();
        if (payload[field] && payload[field].length > 500) {
          return Response.json({ok:false,error:`Campo ${field} demasiado largo`},{status:400});
        }
      }
    }

    // =====================================================
    // VALIDACIONES
    // =====================================================

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "name"
      )
    ) {
      payload.name =
        String(
          payload.name ||
            ""
        ).trim();

      if (
        !payload.name
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "El nombre de la obra social es obligatorio",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "recipe_validity_days"
      )
    ) {
      if (
        payload.recipe_validity_days ===
          "" ||
        payload.recipe_validity_days ===
          null
      ) {
        payload.recipe_validity_days =
          null;
      } else {
        const value =
          Number(
            payload.recipe_validity_days
          );

        if (
          !Number.isInteger(
            value
          ) ||
          value < 0
        ) {
          return Response.json(
            {
              ok: false,
              error:
                "La vigencia de receta debe ser un número válido",
            },
            {
              status: 400,
            }
          );
        }

        payload.recipe_validity_days =
          value;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "rp"
      )
    ) {
      if (
        payload.rp === "" ||
        payload.rp ===
          null
      ) {
        payload.rp =
          null;
      } else {
        const value =
          Number(
            payload.rp
          );

        if (
          !Number.isInteger(
            value
          ) ||
          value < 0
        ) {
          return Response.json(
            {
              ok: false,
              error:
                "RP debe ser un número válido",
            },
            {
              status: 400,
            }
          );
        }

        payload.rp =
          value;
      }
    }

    if (
      Object.prototype.hasOwnProperty.call(
        payload,
        "active"
      )
    ) {
      payload.active =
        Boolean(
          payload.active
        );

      payload.status =
        payload.active
          ? "Activa"
          : "INACTIVA";
    }

    if (
      Object.keys(
        payload
      ).length === 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "No hay campos para actualizar",
        },
        {
          status: 400,
        }
      );
    }

    payload.updated_at =
      new Date().toISOString();

    // =====================================================
    // UPDATE
    // =====================================================

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "social_works"
        )
        .update(
          payload
        )
        .eq(
          "id",
          socialWorkId
        )
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
        .single();

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,
      social_work:
        data,
    });
  } catch (error) {
    console.error(
      "Social Work PATCH error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error actualizando la obra social",
      },
      {
        status: 500,
      }
    );
  }
}