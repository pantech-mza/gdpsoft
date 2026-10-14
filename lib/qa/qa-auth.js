import { supabaseAdmin } from "../supabase/admin";

export function validateQaSecret(request) {
  const configured = String(process.env.QA_RUNNER_SECRET || "");
  const supplied = String(request.headers.get("x-qa-secret") || "");
  return Boolean(configured) && supplied === configured;
}

export async function validateSuperAdmin(profileId) {
  if (!profileId) return false;
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,is_super_admin,active")
    .eq("id", profileId)
    .maybeSingle();
  return !error && !!data && data.active !== false && data.is_super_admin === true;
}
