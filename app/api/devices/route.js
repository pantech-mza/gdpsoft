import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase/admin";

const ALLOWED_DEVICE_TYPES = ["PC", "MOBILE", "TABLET", "OTHER"];

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const branchId = searchParams.get("branch_id");
    const deviceUuid = searchParams.get("device_uuid");

    let query = supabaseAdmin
      .from("branch_devices")
      .select(`
        id,
        device_uuid,
        branch_id,
        device_name,
        device_type,
        active,
        first_seen_at,
        last_seen_at,
        created_at,
        updated_at
      `)
      .order("device_name", { ascending: true });

    if (branchId) {
      const parsedBranchId = Number(branchId);

      if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
        return NextResponse.json(
          {
            ok: false,
            error: "branch_id inválido",
          },
          { status: 400 }
        );
      }

      query = query.eq("branch_id", parsedBranchId);
    }

    if (deviceUuid) {
      query = query.eq("device_uuid", deviceUuid);
    }

    const { data, error } = await query;

    if (error) {
      console.error("GET /api/devices error:", error);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudieron obtener los dispositivos",
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      count: data?.length ?? 0,
      devices: data ?? [],
    });
  } catch (error) {
    console.error("GET /api/devices unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al obtener dispositivos",
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      device_uuid,
      branch_id,
      device_name,
      device_type,
    } = body ?? {};

    if (!device_uuid || typeof device_uuid !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "device_uuid es obligatorio",
        },
        { status: 400 }
      );
    }

    const parsedBranchId = Number(branch_id);

    if (!Number.isInteger(parsedBranchId) || parsedBranchId <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "branch_id inválido",
        },
        { status: 400 }
      );
    }

    if (
      !device_name ||
      typeof device_name !== "string" ||
      !device_name.trim()
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "device_name es obligatorio",
        },
        { status: 400 }
      );
    }

    const normalizedType =
      typeof device_type === "string"
        ? device_type.trim().toUpperCase()
        : "";

    if (!ALLOWED_DEVICE_TYPES.includes(normalizedType)) {
      return NextResponse.json(
        {
          ok: false,
          error: "device_type inválido",
          allowed: ALLOWED_DEVICE_TYPES,
        },
        { status: 400 }
      );
    }

    // Validar que la sucursal exista
    const { data: branch, error: branchError } = await supabaseAdmin
      .from("branches")
      .select("id, name, active")
      .eq("id", parsedBranchId)
      .maybeSingle();

    if (branchError) {
      console.error("Branch lookup error:", branchError);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo validar la sucursal",
          details: branchError.message,
        },
        { status: 500 }
      );
    }

    if (!branch) {
      return NextResponse.json(
        {
          ok: false,
          error: "La sucursal no existe",
        },
        { status: 404 }
      );
    }

    if (!branch.active) {
      return NextResponse.json(
        {
          ok: false,
          error: "La sucursal está inactiva",
        },
        { status: 409 }
      );
    }

    // Verificar si el dispositivo ya existe
    const { data: existingDevice, error: existingError } =
      await supabaseAdmin
        .from("branch_devices")
        .select(`
          id,
          device_uuid,
          branch_id,
          device_name,
          device_type,
          active,
          first_seen_at,
          last_seen_at,
          created_at,
          updated_at
        `)
        .eq("device_uuid", device_uuid)
        .maybeSingle();

    if (existingError) {
      console.error("Existing device lookup error:", existingError);

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo verificar el dispositivo",
          details: existingError.message,
        },
        { status: 500 }
      );
    }

    // Si existe, actualizamos datos y last_seen_at
    if (existingDevice) {
      const now = new Date().toISOString();

      const { data: updatedDevice, error: updateError } =
        await supabaseAdmin
          .from("branch_devices")
          .update({
            branch_id: parsedBranchId,
            device_name: device_name.trim(),
            device_type: normalizedType,
            active: true,
            last_seen_at: now,
            updated_at: now,
          })
          .eq("id", existingDevice.id)
          .select(`
            id,
            device_uuid,
            branch_id,
            device_name,
            device_type,
            active,
            first_seen_at,
            last_seen_at,
            created_at,
            updated_at
          `)
          .single();

      if (updateError) {
        console.error("Device update error:", updateError);

        return NextResponse.json(
          {
            ok: false,
            error: "No se pudo actualizar el dispositivo",
            details: updateError.message,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        ok: true,
        created: false,
        branch,
        device: updatedDevice,
      });
    }

    // Si no existe, lo creamos
    const now = new Date().toISOString();

    const { data: newDevice, error: insertError } =
      await supabaseAdmin
        .from("branch_devices")
        .insert({
          device_uuid,
          branch_id: parsedBranchId,
          device_name: device_name.trim(),
          device_type: normalizedType,
          active: true,
          first_seen_at: now,
          last_seen_at: now,
          updated_at: now,
        })
        .select(`
          id,
          device_uuid,
          branch_id,
          device_name,
          device_type,
          active,
          first_seen_at,
          last_seen_at,
          created_at,
          updated_at
        `)
        .single();

    if (insertError) {
      console.error("Device insert error:", insertError);

      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            ok: false,
            error: "El dispositivo ya se encuentra registrado",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo registrar el dispositivo",
          details: insertError.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        created: true,
        branch,
        device: newDevice,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/devices unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al registrar el dispositivo",
      },
      { status: 500 }
    );
  }
}