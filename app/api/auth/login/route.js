import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../../../lib/supabase/admin";
import { setGDPPageCookies } from "../../../../lib/server/gdp-session-cookies.mjs";

export async function POST(request) {
  try {
    const body = await request.json();

    const username =
      typeof body?.username === "string"
        ? body.username.trim()
        : "";

    const password =
      typeof body?.password === "string"
        ? body.password
        : "";

    if (!username || !password) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuario y contraseña son obligatorios",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 1. Buscar profile por username
    // ---------------------------------------------------------

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select(`
          id,
          username,
          full_name,
          role,
          branch_id,
          active,
          is_super_admin
        `)
        .ilike("username", username)
        .maybeSingle();

    if (profileError) {
      console.error(
        "Error buscando profile:",
        profileError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo iniciar sesión",
        },
        { status: 500 }
      );
    }

    // No revelamos si el usuario existe o no.
    if (!profile || !profile.active) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuario o contraseña incorrectos",
        },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // 2. Obtener email interno del Auth User
    // ---------------------------------------------------------

    const {
      data: authUserData,
      error: authUserError,
    } = await supabaseAdmin.auth.admin.getUserById(
      profile.id
    );

    if (authUserError || !authUserData?.user?.email) {
      console.error(
        "Error obteniendo Auth User:",
        authUserError
      );

      return NextResponse.json(
        {
          ok: false,
          error: "No se pudo iniciar sesión",
        },
        { status: 500 }
      );
    }

    const email = authUserData.user.email;

    // ---------------------------------------------------------
    // 3. Autenticar realmente contra Supabase Auth
    // ---------------------------------------------------------

    const supabaseUrl =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!supabaseUrl) {
    throw new Error(
        "Falta SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL"
    );
    }

    /*
      Para iniciar sesión NO usamos el admin client.

      Necesitamos una key pública / anon para generar
      una sesión normal de usuario.
    */

    const publicKey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!publicKey) {
      throw new Error(
        "Falta SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY"
      );
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

    const {
      data: signInData,
      error: signInError,
    } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !signInData?.session) {
      return NextResponse.json(
        {
          ok: false,
          error: "Usuario o contraseña incorrectos",
        },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // 4. Cargar permisos por módulo
    // ---------------------------------------------------------

    let modules = [];

    if (!profile.is_super_admin) {
      const {
        data: accessData,
        error: accessError,
      } = await supabaseAdmin
        .from("profile_module_access")
        .select(`
          access_level,
          active,
          modules (
            id,
            code,
            name,
            active
          )
        `)
        .eq("profile_id", profile.id)
        .eq("active", true);

      if (accessError) {
        console.error(
          "Error cargando permisos:",
          accessError
        );

        return NextResponse.json(
          {
            ok: false,
            error: "No se pudieron cargar los permisos",
          },
          { status: 500 }
        );
      }

      modules = (accessData ?? [])
        .filter(
          (item) =>
            item.modules &&
            item.modules.active === true
        )
        .map((item) => ({
          id: item.modules.id,
          code: item.modules.code,
          name: item.modules.name,
          access_level: item.access_level,
        }));
    }

    // ---------------------------------------------------------
    // 5. Cargar sucursal si corresponde
    // ---------------------------------------------------------

    let branch = null;

    if (profile.branch_id) {
      const {
        data: branchData,
        error: branchError,
      } = await supabaseAdmin
        .from("branches")
         .select(`
            id,
            name,
            code,
            branch_type,
            city,
            latitude,
            longitude,
            active
        `)
        .eq("id", profile.branch_id)
        .maybeSingle();

      if (branchError) {
        console.error(
          "Error cargando sucursal:",
          branchError
        );
      }

      branch = branchData ?? null;
    }

    // ---------------------------------------------------------
    // 6. Respuesta
    // ---------------------------------------------------------

    const response = NextResponse.json({
      ok: true,

      session: {
        access_token:
          signInData.session.access_token,

        refresh_token:
          signInData.session.refresh_token,

        expires_at:
          signInData.session.expires_at,
      },

    user: {
  id: profile.id,
  username: profile.username,
  full_name: profile.full_name,
  email,
  role: profile.role,
  is_super_admin:
    profile.is_super_admin,
},

      branch,

      modules,
    });
    return setGDPPageCookies(response, signInData.session);
  } catch (error) {
    console.error(
      "POST /api/auth/login unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error: "Error interno al iniciar sesión",
      },
      { status: 500 }
    );
  }
}