import { requireActor } from "../../../../lib/decision-trees/auth";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MODES = ["DIRECT", "OCR"];

export async function POST(request) {
  const access = await requireActor(request, true);
  if (access.error) return access.error;
  try {
    const body = await request.json();

    const normativeId = Number(body.normativeId);
    const mode = String(body.mode || "").toUpperCase();

    if (
      !Number.isInteger(normativeId) ||
      normativeId <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error: "normativeId inválido",
        },
        {
          status: 400,
        }
      );
    }

    if (!ALLOWED_MODES.includes(mode)) {
      return Response.json(
        {
          ok: false,
          error: "mode debe ser DIRECT u OCR",
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: normative,
      error: normativeError,
    } = await supabaseAdmin
      .from("normatives")
      .select(`
        id,
        original_filename,
        status,
        analysis_stage,
        processing_recommended,
        processing_selected,
        analysis_confidence
      `)
      .eq("id", normativeId)
      .single();

    if (normativeError) {
      throw new Error(normativeError.message);
    }

    if (normative.analysis_stage !== "COMPLETED") {
      return Response.json(
        {
          ok: false,
          error:
            "La normativa todavía no completó el preanálisis",
        },
        {
          status: 409,
        }
      );
    }

    if (normative.status !== "READY_TO_PROCESS") {
      return Response.json(
        {
          ok: false,
          error:
            `La normativa no está lista para procesarse. Estado actual: ${normative.status}`,
        },
        {
          status: 409,
        }
      );
    }

    const {
      data: updated,
      error: updateError,
    } = await supabaseAdmin
      .from("normatives")
      .update({
        processing_selected: mode,
      })
      .eq("id", normativeId)
      .select(`
        id,
        original_filename,
        status,
        processing_recommended,
        processing_selected,
        analysis_confidence
      `)
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return Response.json({
      ok: true,

      message:
        mode === normative.processing_recommended
          ? "Recomendación automática confirmada"
          : "Modo modificado manualmente por el administrador",

      normative: updated,

      recommendation_changed:
        mode !== normative.processing_recommended,
    });
  } catch (error) {
    console.error(
      "Confirm processing error:",
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