// Cookies del control de acceso a páginas. Las APIs siguen usando Authorization: Bearer.
// Jamás se decide el rol a partir de un valor enviado por el navegador.
export const GDP_ACCESS_COOKIE = "gdpsoft_page_access";
export const GDP_REFRESH_COOKIE = "gdpsoft_page_refresh";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function setGDPPageCookies(response, session) {
  if (!session?.access_token || !session?.refresh_token) {
    throw new Error("No se puede establecer una sesión incompleta");
  }
  const secondsRemaining = session.expires_at
    ? Math.max(1, Math.floor(Number(session.expires_at) - Date.now() / 1000))
    : 3600;
  response.cookies.set(GDP_ACCESS_COOKIE, session.access_token, {
    ...cookieOptions(),
    maxAge: secondsRemaining,
  });
  // Cookie de sesión (sin Max-Age): se usa únicamente para renovar la página.
  response.cookies.set(GDP_REFRESH_COOKIE, session.refresh_token, cookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export function clearGDPPageCookies(response) {
  response.cookies.set(GDP_ACCESS_COOKIE, "", {
    ...cookieOptions(), maxAge: 0,
  });
  response.cookies.set(GDP_REFRESH_COOKIE, "", {
    ...cookieOptions(), maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
