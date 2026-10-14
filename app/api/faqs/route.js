import {
  supabaseAdmin,
} from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const status =
      searchParams.get("status");

    const socialWorkId =
      searchParams.get(
        "socialWorkId"
      );

    const branchId =
      searchParams.get(
        "branchId"
      );

    const validStatuses = [
      "SUGGESTED",
      "APPROVED",
      "REJECTED",
      "ARCHIVED",
    ];

    let query =
      supabaseAdmin
        .from(
          "social_work_faqs"
        )
        .select(`
          id,
          social_work_id,
          branch_id,
          branch_type,
          question,
          normalized_question,
          answer,
          status,
          source_type,
          source_normative_id,
          detected_count,
          usage_count,
          first_detected_at,
          last_detected_at,
          approved_by,
          approved_at,
          active,
          created_at,
          updated_at,
          last_used_at,
          social_works (
            id,
            name
          ),
          branches (
            id,
            name,
            code,
            branch_type
          )
        `);

    // ---------------------------------------------
    // STATUS
    // ---------------------------------------------

    if (status) {
      if (
        !validStatuses.includes(
          status
        )
      ) {
        return Response.json(
          {
            ok: false,
            error:
              "Estado inválido",
          },
          {
            status: 400,
          }
        );
      }

      query =
        query.eq(
          "status",
          status
        );
    }

    // ---------------------------------------------
    // OOSS
    // ---------------------------------------------

    if (socialWorkId) {
      const parsed =
        Number(
          socialWorkId
        );

      if (
        Number.isInteger(
          parsed
        ) &&
        parsed > 0
      ) {
        query =
          query.eq(
            "social_work_id",
            parsed
          );
      }
    }

    // ---------------------------------------------
    // SUCURSAL
    // ---------------------------------------------

    if (branchId) {
      if (
        branchId ===
        "GLOBAL"
      ) {
        query =
          query.is(
            "branch_id",
            null
          );
      } else {
        const parsed =
          Number(
            branchId
          );

        if (
          Number.isInteger(
            parsed
          ) &&
          parsed > 0
        ) {
          query =
            query.eq(
              "branch_id",
              parsed
            );
        }
      }
    }

    // ---------------------------------------------
    // ORDEN
    // ---------------------------------------------

    query =
      query.order(
        "updated_at",
        {
          ascending: false,
        }
      );

    const {
      data,
      error,
    } =
      await query;

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,

      count:
        data?.length || 0,

      faqs:
        data || [],
    });
  } catch (error) {
    console.error(
      "FAQ GET error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error obteniendo FAQs",
      },
      {
        status: 500,
      }
    );
  }
}