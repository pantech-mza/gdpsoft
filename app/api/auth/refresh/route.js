import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const refreshToken = String(body?.refreshToken || "").trim();

    if (!refreshToken) {
      return NextResponse.json(
        { ok: false, error: "Falta refresh token" },
        { status: 400 }
      );
    }

    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL;

    const publicKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !publicKey) {
      throw new Error("Falta configuración pública de Supabase");
    }

    const supabaseAuth = createClient(
      supabaseUrl,
      publicKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data, error } = await supabaseAuth.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session) {
      return NextResponse.json(
        { ok: false, error: "La sesión venció. Ingresá nuevamente." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
    });
  } catch (error) {
    console.error("POST /api/auth/refresh:", error);
    return NextResponse.json(
      { ok: false, error: "No se pudo renovar la sesión" },
      { status: 500 }
    );
  }
}
