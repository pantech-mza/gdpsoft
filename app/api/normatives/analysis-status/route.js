import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Devuelve el estado actual del análisis.
 *
 * Este endpoint será utilizado luego
 * por el modal del frontend para mostrar
 * el progreso en tiempo real.
 */
export async function GET(request) {
  try {
    const url =
      new URL(request.url);

    const normativeId =
      Number(
        url.searchParams.get(
          "normativeId"
        )
      );

    if (
      !Number.isInteger(
        normativeId
      ) ||
      normativeId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "normativeId inválido",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("normatives")
      .select(
        `
        id,
        title,
        original_filename,
        mime_type,
        status,

        analysis_stage,
        analysis_progress,

        processing_recommended,
        processing_selected,

        analysis_confidence,
        analysis_reason,
        analysis_details,

        analyzed_at,
        error_message,

        created_at,
        updated_at
        `
      )
      .eq(
        "id",
        normativeId
      )
      .single();

    if (error) {
      /*
       * Si no existe la normativa,
       * devolvemos 404.
       */
      if (
        error.code ===
        "PGRST116"
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Normativa no encontrada",
          },
          {
            status: 404,
          }
        );
      }

      throw error;
    }

    /*
     * Información útil para el modal.
     */
    const completed =
      data.analysis_stage ===
      "COMPLETED";

    const failed =
      data.analysis_stage ===
        "ERROR" ||
      data.status ===
        "ERROR";

    const analyzing =
      !completed &&
      !failed &&
      data.analysis_progress > 0;

    return Response.json({
      ok: true,

      normative: {
        ...data,

        analyzing,

        completed,

        failed,

        requires_admin_confirmation:
          completed &&
          !data.processing_selected,
      },
    });
  } catch (error) {
    console.error(
      "Analysis status error:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "Error desconocido",
      },
      {
        status: 500,
      }
    );
  }
}