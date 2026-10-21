import { canAccessGDPPage } from "./gdp-page-roles.mjs";

export function gdpApiIsPublic(pathname) {
  return pathname.startsWith("/api/auth/") || pathname === "/api/weather" || [
    "/api/admin/qa/catalog",
    "/api/admin/qa/context",
    "/api/admin/qa/runner",
    "/api/admin/qa/upload-image",
  ].includes(pathname);
}

export function canAccessGDPApi(profile, pathname, method = "GET") {
  if (!profile || profile.active !== true) return false;
  const admin = canAccessGDPPage(profile, "admin");
  const branch = canAccessGDPPage(profile, "sucursal");
  if (!admin && !branch) return false;

  if (pathname.startsWith("/api/admin/")) {
    if (!admin) return false;
    if (pathname === "/api/admin/assistant-stats" || pathname === "/api/admin/assistant-feedback") {
      return profile.is_super_admin === true;
    }
  }
  if (pathname.startsWith("/api/review/") || pathname.startsWith("/api/decision-tree-candidates")) {
    return admin;
  }
  if (pathname.startsWith("/api/normatives/") && pathname !== "/api/normatives/") {
    // Análisis, procesamiento y administración de normativas nunca pertenecen a sucursal.
    if (["/api/normatives/analysis-status", "/api/normatives/analyze", "/api/normatives/confirm-processing", "/api/normatives/process", "/api/normatives/ocr"].some(p => pathname === p)) return admin;
  }
  const write = !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  if (write && (
    /^\/api\/social-works\/?$/.test(pathname) ||
    /^\/api\/social-works\/\d+\/?$/.test(pathname) ||
    /^\/api\/social-works\/\d+\/(normatives|scopes)(\/|$)/.test(pathname) ||
    /^\/api\/normatives\/\d+\/?$/.test(pathname) ||
    /^\/api\/faqs\//.test(pathname) ||
    pathname === "/api/decision-trees" ||
    pathname.startsWith("/api/decision-trees/")
  )) return admin;
  return true;
}
