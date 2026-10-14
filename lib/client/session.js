export async function refreshStoredSession() {
  if (typeof window === "undefined") {
    throw new Error("Sesión no disponible");
  }

  const refreshToken =
    sessionStorage.getItem("gdpsoft_refresh_token") || "";

  if (!refreshToken) {
    throw new Error("La sesión venció. Ingresá nuevamente.");
  }

  const response = await fetch("/api/auth/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  const payload = await response.json();

  if (!response.ok || !payload?.ok || !payload?.session?.access_token) {
    throw new Error(
      payload?.error || "La sesión venció. Ingresá nuevamente."
    );
  }

  sessionStorage.setItem(
    "gdpsoft_access_token",
    payload.session.access_token
  );

  if (payload.session.refresh_token) {
    sessionStorage.setItem(
      "gdpsoft_refresh_token",
      payload.session.refresh_token
    );
  }

  return payload.session.access_token;
}

export function clearGDPSoftSession() {
  if (typeof window === "undefined") return;

  [
    "gdpsoft_user",
    "gdpsoft_branch",
    "gdpsoft_modules",
    "gdpsoft_access_token",
    "gdpsoft_refresh_token",
  ].forEach((key) => sessionStorage.removeItem(key));
}
