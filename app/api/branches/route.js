import {
  supabaseAdmin,
} from "../../../lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("branches")
      .select(`
        id,
        code,
        name,
        branch_type,
        active
      `)
      .eq("active", true)
      .order("name", {
        ascending: true,
      });

    if (error) {
      throw new Error(
        error.message
      );
    }

    return Response.json({
      ok: true,
      count: data?.length || 0,
      branches: data || [],
    });
  } catch (error) {
    console.error(
      "Branches GET error:",
      error
    );

    return Response.json(
      {
        ok: false,
        error:
          error?.message ||
          "Error obteniendo sucursales",
      },
      {
        status: 500,
      }
    );
  }
}