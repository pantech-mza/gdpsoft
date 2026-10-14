import {supabaseAdmin} from '../../../../../lib/supabase/admin';
import {requireAdminActor,jsonError} from '../../../../../lib/server/gdp-actor';
import {BUCKET} from '../../../../../lib/procedimientos/config.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request){
 const access=await requireAdminActor(request);
 if(!access.actor)return jsonError(access.error,access.status);
 const id=Number(new URL(request.url).searchParams.get('id'));
 if(!Number.isInteger(id)||id<1)return jsonError('ID inválido');
 const {data,error}=await supabaseAdmin.from('internal_procedures').select('source_storage_path').eq('id',id).maybeSingle();
 if(error||!data)return jsonError('No encontrado',404);
 if(!data.source_storage_path)return jsonError('Este procedimiento no tiene archivo adjunto.',404);
 const {data:signed,error:signedError}=await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.source_storage_path,60);
 return signedError?jsonError('No se puede abrir la fuente.',500):Response.json({ok:true,url:signed.signedUrl},{headers:{'Cache-Control':'no-store'}});
}
