import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   POST
   CREAR NUEVA CONVERSACIÓN
   ========================================================= */

export async function POST(request) {
  try {
    const body = await request.json();

    const adminMode = body?.adminMode === true;

    const userId =
      body.user_id ||
      body.userId ||
      null;

    const branchId =
      body.branch_id != null
        ? Number(body.branch_id)
        : body.branchId != null
          ? Number(body.branchId)
          : null;

    const deviceUuid =
      body.device_uuid ||
      body.deviceUuid ||
      null;

    const deviceIdInput =
      body.device_id != null
        ? Number(body.device_id)
        : body.deviceId != null
          ? Number(body.deviceId)
          : null;

    const activeSocialWorkId =
      body.active_social_work_id != null
        ? Number(body.active_social_work_id)
        : body.activeSocialWorkId != null
          ? Number(body.activeSocialWorkId)
          : null;

    const activeBillingChannelId =
      body.active_billing_channel_id != null
        ? Number(body.active_billing_channel_id)
        : body.activeBillingChannelId != null
          ? Number(body.activeBillingChannelId)
          : null;

    /* =====================================================
       VALIDAR CONTEXTO DE USUARIO / SUCURSAL
       ===================================================== */

    let resolvedUserId = userId || null;
    let branch = null;
    let device = null;

    if (adminMode) {
      const authHeader = request.headers.get("authorization") || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";

      if (!token) {
        return NextResponse.json(
          { ok: false, error: "Sesión administrativa inválida" },
          { status: 401 }
        );
      }

      const { data: authData, error: authError } =
        await supabaseAdmin.auth.getUser(token);

      if (authError || !authData?.user) {
        return NextResponse.json(
          { ok: false, error: "Sesión administrativa inválida" },
          { status: 401 }
        );
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("id,role,active,is_super_admin")
        .eq("id", authData.user.id)
        .maybeSingle();

      if (
        profileError ||
        !profile ||
        profile.active === false ||
        !(profile.is_super_admin === true || String(profile.role || "").toUpperCase() === "ADMIN")
      ) {
        return NextResponse.json(
          { ok: false, error: "Sin permiso para usar el asistente administrativo" },
          { status: 403 }
        );
      }

      resolvedUserId = profile.id;
    } else {
      if (!Number.isInteger(branchId) || branchId <= 0) {
        return NextResponse.json(
          { ok: false, error: "branchId inválido" },
          { status: 400 }
        );
      }

      const { data: branchData, error: branchError } = await supabaseAdmin
        .from("branches")
        .select(`
          id,
          code,
          name,
          branch_type,
          active
        `)
        .eq("id", branchId)
        .single();

      if (branchError || !branchData) {
        return NextResponse.json(
          { ok: false, error: "Sucursal no encontrada" },
          { status: 404 }
        );
      }

      if (branchData.active !== true) {
        return NextResponse.json(
          { ok: false, error: "La sucursal está inactiva" },
          { status: 400 }
        );
      }

      branch = branchData;
    }

    /* =====================================================
       RESOLVER DISPOSITIVO
       ===================================================== */

    if (!adminMode) {
      if (deviceIdInput) {
        const {
          data,
          error,
        } = await supabaseAdmin
          .from("branch_devices")
          .select(`
            id,
            device_uuid,
            branch_id,
            device_name,
            device_type,
            active
          `)
          .eq("id", deviceIdInput)
          .eq("branch_id", branchId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        device = data;
      } else if (deviceUuid) {
        const {
          data,
          error,
        } = await supabaseAdmin
          .from("branch_devices")
          .select(`
            id,
            device_uuid,
            branch_id,
            device_name,
            device_type,
            active
          `)
          .eq("device_uuid", String(deviceUuid))
          .eq("branch_id", branchId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        device = data;
      }

      if (!device) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No se encontró un dispositivo registrado para esta sucursal",
          },
          {
            status: 400,
          }
        );
      }

      if (device.active !== true) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "El dispositivo se encuentra inactivo",
          },
          {
            status: 400,
          }
        );
      }
    }

    /* =====================================================
       VALIDAR OOSS ACTIVA SI VIENE
       ===================================================== */

    if (activeSocialWorkId) {
      const {
        data: socialWork,
        error: socialWorkError,
      } = await supabaseAdmin
        .from("social_works")
        .select(`
          id,
          name,
          active
        `)
        .eq(
          "id",
          activeSocialWorkId
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
        socialWork.active !== true
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
    }

    /* =====================================================
       CREAR CONVERSACIÓN

       IMPORTANTE:
       SIEMPRE se crea una nueva.
       No reutilizamos por device_id.
       ===================================================== */

    const now =
      new Date().toISOString();

    const conversationId =
      randomUUID();

    const {
      data: conversation,
      error: insertError,
    } = await supabaseAdmin
      .from("conversations")
      .insert({
        id: conversationId,

        user_id:
          resolvedUserId || null,

        branch_id:
          adminMode ? null : branchId,

        device_id:
          adminMode ? null : device.id,

        active_social_work_id:
          activeSocialWorkId || null,

        active_billing_channel_id:
          activeBillingChannelId || null,

        created_at:
          now,

        updated_at:
          now,

        closed_at:
          null,
      })
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

    if (insertError) {
      console.error(
        "POST /api/conversations Supabase error:",
        insertError
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "No se pudo crear la conversación",

          details:
            process.env.NODE_ENV ===
            "development"
              ? insertError.message
              : undefined,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        ok: true,

        conversation,

        context: {
          branch: adminMode
            ? null
            : {
                id: branch.id,
                code: branch.code,
                name: branch.name,
                branch_type: branch.branch_type,
              },

          device: adminMode
            ? null
            : {
                id: device.id,
                uuid: device.device_uuid,
                name: device.device_name,
                type: device.device_type,
              },

          mode: adminMode ? "ADMIN" : "BRANCH",
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "POST /api/conversations unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Error interno al crear la conversación",

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