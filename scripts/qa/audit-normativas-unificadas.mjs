/**
 * Diagnóstico SOLO LECTURA de normativas generales + anexos asociados al mismo app_id.
 * node --env-file=.env.local scripts/qa/audit-normativas-unificadas.mjs --name=OMINT
 * node --env-file=.env.local scripts/qa/audit-normativas-unificadas.mjs --app-id=24
 */
import { createClient } from '@supabase/supabase-js';
const args = process.argv.slice(2);
const byId = args.find(x=>x.startsWith('--app-id='))?.split('=')[1];
const byName = args.find(x=>x.startsWith('--name='))?.slice('--name='.length);
if ((byId && byName) || (!byId && !byName) || (byId && !/^\d+$/.test(byId))) {
  console.error('Uso: --name=OMINT o --app-id=24'); process.exit(1);
}
const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url||!key) throw Error('Faltan variables Supabase');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let q=db.from('social_works').select('id,id_soft,name,active');
q=byId ? q.eq('id',Number(byId)) : q.ilike('name',`%${byName.replace(/[%_]/g,'')}%`);
const {data:works,error:swError}=await q;
if(swError) throw Error(swError.message);
for (const sw of (works||[])) {
  console.log(`OBRA SOCIAL APP_ID=${sw.id}, ID_SOFT=${sw.id_soft??'-'}: ${sw.name} (${sw.active?'ACTIVA':'INACTIVA'})`);
  const {data:links,error:linkError}=await db.from('normative_social_works')
    .select('normative_id,billing_channel_id,is_primary,normatives(id,title,original_filename,is_current,openai_status,openai_file_id)')
    .eq('social_work_id',sw.id);
  if(linkError) throw Error(`No pude inspeccionar normativas de app_id=${sw.id}: ${linkError.message}`);
  const docs=[...new Map((links||[]).map(l=>[`${l.normative_id}/${l.billing_channel_id??'general'}`,{
    normative_id:l.normative_id,
    canal:l.billing_channel_id??'General/compartida',
    principal:Boolean(l.is_primary),
    titulo:l.normatives?.title||l.normatives?.original_filename||'[sin título]',
    vigente:Boolean(l.normatives?.is_current),
    indexacion:l.normatives?.openai_status||'SIN ESTADO',
    file_id_openai:Boolean(l.normatives?.openai_file_id),
  }])).values()];
  console.table(docs);
  console.log(`${docs.length} vínculos (vigentes: ${docs.filter(d=>d.vigente).length}). `+
    'Verificar que el anexo de vacunas/insulinas esté asociado e indexado. No se modifica nada.');
}
if(!works?.length) console.log('No encontré obras sociales para el filtro indicado.');
