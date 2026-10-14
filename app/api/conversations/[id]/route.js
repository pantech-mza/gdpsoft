import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   GET
   OBTENER CONVERSACIÓN
   ========================================================= */

export async function GET(
  request,
  context
) {
  try {
    const params =
      await context.params;

    const id =
      String(
        params.id || ""
      ).trim();

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "conversation_id inválido",
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
      .from("conversations")
      .select(`
        id,
        user_id,
        branch_id,
        device_id,
        active_social_work_id,
        active_billing_channel_id,
        created_at,
        updated_at,
        closed_at
      `)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Conversación no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      conversation:
        data,
    });
  } catch (error) {
    console.error(
      "GET /api/conversations/[id] error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al cargar la conversación",
      },
      {
        status: 500,
      }
    );
  }
}

/* =========================================================
   PATCH
   MODIFICAR CONTEXTO
   ========================================================= */

export async function PATCH(
  request,
  context
) {
  try {
    const params =
      await context.params;

    const id =
      String(
        params.id || ""
      ).trim();

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "conversation_id inválido",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await request.json();

    const action =
      String(
        body.action || ""
      )
        .trim()
        .toUpperCase();

    /* =====================================================
       BUSCAR CONVERSACIÓN
       ===================================================== */

    const {
      data: current,
      error: currentError,
    } = await supabaseAdmin
      .from("conversations")
      .select(`
        id,
        user_id,
        branch_id,
        device_id,
        active_social_work_id,
        active_billing_channel_id,
        created_at,
        updated_at,
        closed_at
      `)
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Conversación no encontrada",
        },
        {
          status: 404,
        }
      );
    }

    if (
      current.closed_at &&
      action !== "CLOSE"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "La conversación ya está cerrada",
        },
        {
          status: 400,
        }
      );
    }

    const now =
      new Date().toISOString();

    let payload = {
      updated_at: now,
    };

    /* =====================================================
       CAMBIAR OOSS ACTIVA
       ===================================================== */

    if (
      action ===
      "SET_SOCIAL_WORK"
    ) {
      const rawId =
        body.social_work_id ??
        body.socialWorkId ??
        null;

      /*
       * Permitimos null para limpiar
       * el contexto de OOSS.
       */
      if (rawId == null) {
        payload.active_social_work_id =
          null;

        payload.active_billing_channel_id =
          null;
      } else {
        const socialWorkId =
          Number(rawId);

        if (
          !Number.isInteger(
            socialWorkId
          ) ||
          socialWorkId <= 0
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "social_work_id inválido",
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
            .select(`
              id,
              name,
              active
            `)
            .eq(
              "id",
              socialWorkId
            )
            .single();

        if (
          socialWorkError ||
          !socialWork
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Obra Social no encontrada",
            },
            {
              status: 404,
            }
          );
        }

        if (
          socialWork.active !==
          true
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "La Obra Social está inactiva",
            },
            {
              status: 400,
            }
          );
        }

        payload.active_social_work_id =
          socialWorkId;

        /*
         * Al cambiar de OOSS limpiamos
         * el canal activo.
         *
         * Después el bot podrá resolverlo
         * nuevamente según contexto.
         */
        payload.active_billing_channel_id =
          null;
      }
    }

    /* =====================================================
       CAMBIAR CANAL ACTIVO
       ===================================================== */

    else if (
      action ===
      "SET_BILLING_CHANNEL"
    ) {
      const rawId =
        body.billing_channel_id ??
        body.billingChannelId ??
        null;

      if (rawId == null) {
        payload.active_billing_channel_id =
          null;
      } else {
        const billingChannelId =
          Number(rawId);

        if (
          !Number.isInteger(
            billingChannelId
          ) ||
          billingChannelId <= 0
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "billing_channel_id inválido",
            },
            {
              status: 400,
            }
          );
        }

        const {
          data: channel,
          error:
            channelError,
        } =
          await supabaseAdmin
            .from(
              "billing_channels"
            )
            .select(`
              id,
              code,
              name,
              active
            `)
            .eq(
              "id",
              billingChannelId
            )
            .single();

        if (
          channelError ||
          !channel
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Canal de facturación no encontrado",
            },
            {
              status: 404,
            }
          );
        }

        if (
          channel.active ===
          false
        ) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "El canal de facturación está inactivo",
            },
            {
              status: 400,
            }
          );
        }

        payload.active_billing_channel_id =
          billingChannelId;
      }
    }

    /* =====================================================
       ACTUALIZAR CONTEXTO COMPLETO
       ===================================================== */

    else if (
      action ===
      "SET_CONTEXT"
    ) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "social_work_id"
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "socialWorkId"
        )
      ) {
        const rawId =
          body.social_work_id ??
          body.socialWorkId;

        payload.active_social_work_id =
          rawId == null
            ? null
            : Number(rawId);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "billing_channel_id"
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "billingChannelId"
        )
      ) {
        const rawId =
          body.billing_channel_id ??
          body.billingChannelId;

        payload.active_billing_channel_id =
          rawId == null
            ? null
            : Number(rawId);
      }
    }

    /* =====================================================
       CERRAR CONVERSACIÓN
       ===================================================== */

    else if (
      action === "CLOSE"
    ) {
      payload.closed_at =
        current.closed_at ||
        now;
    }

    /* =====================================================
       ACCIÓN INVÁLIDA
       ===================================================== */

    else {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Acción inválida. Usar SET_SOCIAL_WORK, SET_BILLING_CHANNEL, SET_CONTEXT o CLOSE.",
        },
        {
          status: 400,
        }
      );
    }

    /* =====================================================
       ACTUALIZAR
       ===================================================== */

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("conversations")
      .update(payload)
      .eq("id", id)
      .select(`
        id,
        user_id,
        branch_id,
        device_id,
        active_social_work_id,
        active_billing_channel_id,
        created_at,
        updated_at,
        closed_at
      `)
      .single();

    if (error) {
      console.error(
        "PATCH /api/conversations/[id] Supabase error:",
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo actualizar la conversación",

          details:
            process.env.NODE_ENV ===
            "development"
              ? error.message
              : undefined,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      action,
      conversation:
        data,
    });
  } catch (error) {
    console.error(
      "PATCH /api/conversations/[id] error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al actualizar la conversación",

        details:
          process.env.NODE_ENV ===
          "development"
            ? error?.message
            : undefined,
      },
      {
        status: 500,
      }
    );
  }
}