// v3.13.88 — el aviso de archivo duplicado dice DÓNDE está el archivo que ya existe.
// El duplicado se detecta por contenido (SHA-256): el nombre del archivo no importa.

export function formatDuplicateMessage(existing, workNames = []) {
  const title = String(existing?.title || 'sin título').trim();
  const where = workNames.length ? `, asociado a ${workNames.join(', ')}` : '';
  return `Este archivo ya existe en el sistema: «${title}» (ID #${existing?.id ?? '?'})${where}. Tiene exactamente el mismo contenido aunque el nombre sea distinto. Si es otro documento, guardalo de nuevo desde su origen y volvé a subirlo.`;
}

export async function buildDuplicateMessage(supabaseAdmin, existing) {
  let names = [];
  try {
    const { data: links } = await supabaseAdmin.from('normative_social_works')
      .select('social_work_id').eq('normative_id', existing.id);
    const ids = [...new Set((links || []).map((row) => row.social_work_id).filter(Boolean))];
    if (ids.length) {
      const { data: works } = await supabaseAdmin.from('social_works').select('name').in('id', ids);
      names = [...new Set((works || []).map((row) => row.name).filter(Boolean))];
    }
  } catch {
    names = [];
  }
  return formatDuplicateMessage(existing, names);
}
