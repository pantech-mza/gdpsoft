export function canAccessGDPPage(profile, area) {
  if (!profile || profile.active !== true) return false;
  const role = String(profile.role || "").toUpperCase();
  const admin = profile.is_super_admin === true || ["ADMIN", "SUPERADMIN", "SUPER_ADMIN"].includes(role);
  if (area === "admin") return admin;
  if (area === "sucursal") return role === "SUCURSAL" && !admin && !!profile.branch_id;
  return false;
}
