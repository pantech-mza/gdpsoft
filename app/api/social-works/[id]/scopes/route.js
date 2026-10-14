import {
  supabaseAdmin,
} from "../../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeCode(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

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
          "social_work_scopes"
        )
        .select(`
          id,
          social_work_id,
          code,
          name,
          description,
          active
        `)
        .eq(
          "social_work_id",
          socialWorkId
        )
        .eq(
          "active",
          true
        )
        .order(
          "name",
          {
            ascending: true,
          }
        );

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,
      count:
        data?.length || 0,
      scopes:
        data || [],
    });
  } catch (error) {
    console.error(
      "Social Work Scopes GET error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error obteniendo alcances",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
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

    const body =
      await request.json();

    const name =
      String(
        body?.name || ""
      ).trim();

    const description =
      String(
        body?.description || ""
      ).trim();

    const code =
      normalizeCode(
        body?.code || name
      );

    if (!name) {
      return Response.json(
        {
          ok: false,
          error:
            "El nombre del alcance es obligatorio",
        },
        {
          status: 400,
        }
      );
    }

    if (!code) {
      return Response.json(
        {
          ok: false,
          error:
            "No se pudo generar un código válido",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: socialWork,
      error:
        socialWorkError,
    } =
      await supabaseAdmin
        .from(
          "social_works"
        )
        .select("id")
        .eq(
          "id",
          socialWorkId
        )
        .maybeSingle();

    if (
      socialWorkError
    ) {
      throw new Error(
        socialWorkError.message
      );
    }

    if (!socialWork) {
      return Response.json(
        {
          ok: false,
          error:
            "Obra social no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    const {
      data: existingScope,
      error:
        existingError,
    } =
      await supabaseAdmin
        .from(
          "social_work_scopes"
        )
        .select(`
          id,
          name,
          code
        `)
        .eq(
          "social_work_id",
          socialWorkId
        )
        .eq(
          "code",
          code
        )
        .maybeSingle();

    if (
      existingError
    ) {
      throw new Error(
        existingError.message
      );
    }

    if (
      existingScope
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Ya existe un alcance con ese código para esta obra social",
          scope:
            existingScope,
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: scope,
      error,
    } =
      await supabaseAdmin
        .from(
          "social_work_scopes"
        )
        .insert({
          social_work_id:
            socialWorkId,

          code,

          name,

          description:
            description ||
            null,

          active: true,
        })
        .select(`
          id,
          social_work_id,
          code,
          name,
          description,
          active
        `)
        .single();

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json(
      {
        ok: true,
        scope,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Social Work Scopes POST error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error creando alcance",
      },
      {
        status: 500,
      }
    );
  }
}