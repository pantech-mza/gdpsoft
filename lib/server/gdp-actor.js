import { supabaseAdmin } from '../supabase/admin';

export async function actorFromRequest(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(match[1]);
  if (error || !data?.user) return null;
  const { data: profile, error: pErr } = await supabaseAdmin.from('profiles')
    .select('id,branch_id,role,active,is_super_admin')
    .eq('id', data.user.id).maybeSingle();
  return !pErr && profile?.active ? profile : null;
}
export function adminActor(p) { return !!p && (p.is_super_admin === true || ['ADMIN','SUPERADMIN','SUPER_ADMIN'].includes(String(p.role || '').toUpperCase())); }
export function jsonError(message, code=400) { return Response.json({ok:false,error:message},{status:code}); }

// Endpoints de actividad: distinguimos sesion no autentificada (401) de permisos reales (403).
// No confiar en is_super_admin guardado en sessionStorage: se valida siempre el perfil actual.
export async function requireAdminActor(request) {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
  if (!match || !match[1]?.trim()) {
    return { actor: null, status: 401, error: 'Sesion no enviada. Volve a iniciar sesion.' };
  }
  try {
    const { data, error: authError } = await supabaseAdmin.auth.getUser(match[1].trim());
    if (authError || !data?.user) {
      return { actor: null, status: 401, error: 'Sesion invalida o vencida. Se debe renovar la sesion.' };
    }
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles')
      .select('id,branch_id,role,active,is_super_admin')
      .eq('id', data.user.id).maybeSingle();
    if (profileError) {
      console.error('GDPSoft actividad: error de lectura del perfil:', profileError.message);
      return { actor: null, status: 500, error: 'No se pudo comprobar el perfil. Revisar Supabase.' };
    }
    if (!profile) return { actor: null, status: 403, error: 'La cuenta autenticada no tiene perfil en GDPSoft.' };
    if (!profile.active) return { actor: null, status: 403, error: 'El perfil de la cuenta esta inactivo.' };
    if (!adminActor(profile)) {
      return { actor: null, status: 403, error: 'La cuenta autenticada no tiene permisos de Admin o Superadmin en Supabase.' };
    }
    return { actor: profile, status: 200, error: null };
  } catch (error) {
    console.error('GDPSoft actividad: error al validar sesion:', error);
    return { actor: null, status: 500, error: 'No se pudieron comprobar los permisos de la sesion.' };
  }
}
