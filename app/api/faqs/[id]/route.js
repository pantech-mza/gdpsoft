import {
  supabaseAdmin,
} from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =========================================================
// PATCH
// =========================================================

export async function PATCH(
  request,
  context
) {
  try {
    const params =
      await context.params;

    const id =
      Number(params.id);

    if (
      !Number.isInteger(id) ||
      id <= 0
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "ID de FAQ inválido",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await request.json();

    const {
      question,
      answer,
      status,
      scope,
      branchId,
    } = body;

    const updateData = {
      updated_at:
        new Date().toISOString(),
    };

    // -----------------------------------------------------
    // EDITAR PREGUNTA
    // -----------------------------------------------------

    if (
      typeof question ===
        "string" &&
      question.trim()
    ) {
      updateData.question =
        question.trim();

      updateData.normalized_question =
        question
          .toLowerCase()
          .normalize("NFD")
          .replace(
            /[\u0300-\u036f]/g,
            ""
          )
          .replace(
            /[¿?¡!,.;:()[\]{}"'`´]/g,
            " "
          )
          .replace(
            /\s+/g,
            " "
          )
          .trim();
    }

    // -----------------------------------------------------
    // EDITAR RESPUESTA
    // -----------------------------------------------------

    if (
      typeof answer ===
        "string" &&
      answer.trim()
    ) {
      updateData.answer =
        answer.trim();
    }

    // -----------------------------------------------------
    // ESTADO
    // -----------------------------------------------------

    if (status) {
      const validStatuses = [
        "SUGGESTED",
        "APPROVED",
        "REJECTED",
        "ARCHIVED",
      ];

      if (
        !validStatuses.includes(
          status
        )
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Estado de FAQ inválido",
          },
          {
            status: 400,
          }
        );
      }

      updateData.status =
        status;

      if (
        status ===
        "APPROVED"
      ) {
        updateData.approved_at =
          new Date().toISOString();

        updateData.active =
          true;
      }

      if (
        status ===
        "REJECTED" ||
        status ===
        "ARCHIVED"
      ) {
        updateData.active =
          false;
      }
    }

    // -----------------------------------------------------
    // ALCANCE
    // -----------------------------------------------------

    if (scope) {
      if (
        scope !== "BRANCH" &&
        scope !== "GLOBAL"
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Scope inválido",
          },
          {
            status: 400,
          }
        );
      }

      if (
        scope === "GLOBAL"
      ) {
        updateData.branch_id =
          null;
      }

      if (
        scope === "BRANCH"
      ) {
        const parsedBranchId =
          Number(branchId);

        if (
          !Number.isInteger(
            parsedBranchId
          ) ||
          parsedBranchId <= 0
        ) {
          return Response.json(
            {
              ok: false,
              error:
                "branchId requerido para scope BRANCH",
            },
            {
              status: 400,
            }
          );
        }

        updateData.branch_id =
          parsedBranchId;
      }
    }

    // -----------------------------------------------------
    // UPDATE
    // -----------------------------------------------------

    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(
          "social_work_faqs"
        )
        .update(
          updateData
        )
        .eq(
          "id",
          id
        )
        .select()
        .single();

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,
      faq: data,
    });
  } catch (error) {
    console.error(
      "FAQ PATCH error:",
      error
    );

    return Response.json(
      {
        ok: false,

        error:
          error?.message ||
          "Error actualizando FAQ",
      },
      {
        status: 500,
      }
    );
  }
}