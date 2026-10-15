import { supabaseAdmin } from '../../../../../lib/supabase/admin';
import { requireAdminActor, jsonError } from '../../../../../lib/server/gdp-actor';
import * as XLSX from 'xlsx';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const numericId = x => x == null || x === '' ? null : (/^[1-9]\d*$/.test(x) ? Number(x) : NaN);
const safeExcel = val => {
  if(val==null)return '';
  const v=String(val);
  // Excel formula injection: don't interpret user-authored questions and responses as formulas.
  return /^[\s\u0000-\u001f]*[=+@-]/.test(v) ? "'"+v : v;
};
const listRows = (items, cols) => items.map((row) => cols.reduce((acc,[label,key])=>{acc[label]=safeExcel(row[key]);return acc;},{}));
const newSheet = (workbook, name, arr, headers) => {
  const cells = arr.length ? arr : [Object.fromEntries(headers.map(h=>[h,'' ]))];
  const sheet = XLSX.utils.json_to_sheet(cells,{header:headers});
  sheet['!cols']=headers.map(h=>({wch:Math.min(58,Math.max(18,h.length+8))}));
  XLSX.utils.book_append_sheet(workbook,sheet,name);
};

export async function GET(request){
  const auth=await requireAdminActor(request);
  if(!auth.actor)return jsonError(auth.error,auth.status);
  const q=new URL(request.url).searchParams;
  const days=Number(q.get('days')??0),branchId=numericId(q.get('branch_id')),socialId=numericId(q.get('social_work_id')),deviceId=numericId(q.get('device_id'));
  const day=String(q.get('day')||''),view=String(q.get('view')||'dashboard');
  if(![0,1,7,30].includes(days)||[branchId,socialId,deviceId].some(Number.isNaN)||!['dashboard','questions'].includes(view)||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))return jsonError('Filtros inválidos',400);
  const question=String(q.get('question')||'').slice(0,180)||null;
  const args={p_days:days,p_branch_id:branchId,p_social_work_id:socialId,p_device_id:deviceId,p_question:question,p_day:day||null};
  const {data:first,error:firstError}=await supabaseAdmin.rpc('gdp_assistant_activity_page_v3',{...args,p_page:1,p_page_size:30});
  if(firstError)return jsonError('Error consultando preguntas: '+firstError.message,500);
  const total=Number(first?.total||0);
  const MAX_ROWS=3000;
  if(total>MAX_ROWS)return jsonError(`La exportación excede ${MAX_ROWS} preguntas. Aplicá filtros de fecha o sucursal para exportarla por partes.`,413);
  const rows=[...(first?.rows||[])];
  // Descarga la totalidad del filtro, no solamente las 12 preguntas de la UI.
  // Cinco RPC simultáneas por tanda evitan sobrecargar la base de datos.
  for(let start=2;start<=Math.ceil(total/30);start+=5){
    const batch=Array.from({length:Math.min(5,Math.ceil(total/30)-start+1)},(_,i)=>start+i);
    const pages=await Promise.all(batch.map(p=>supabaseAdmin.rpc('gdp_assistant_activity_page_v3',{...args,p_page:p,p_page_size:30})));
    const problem=pages.find(p=>p.error);
    if(problem)return jsonError('No se pudo completar la exportación; no se generó archivo parcial.',500);
    for(const page of pages)rows.push(...(page.data?.rows||[]));
  }
  const wb=XLSX.utils.book_new();
  const headers=['ID consulta','Fecha','Sucursal','Dispositivo','Obra social','Pregunta','Respuesta completa','Respondida','Ruta','Estado','Tiempo ms','Error'];
  const questions=rows.map(x=>Object.fromEntries(headers.map((h,i)=>[h,safeExcel([
    x.id,x.created_at,x.branch_name,x.device_name,x.social_work_name,x.question,x.answer,
    x.found===false?'No':'Sí',x.route,x.status,x.elapsed_ms,x.error_code
  ][i])])));
  if(view==='dashboard'){
    const {data:d,error}=await supabaseAdmin.rpc('gdp_assistant_activity_dashboard_v3',args);
    if(error)return jsonError('No se pudo exportar el tablero: '+error.message,500);
    const totals=d?.totals||{};
    const totalsSheet=Object.entries(totals).map(([indicador,valor])=>({Indicador:indicador,Valor:valor}));
    newSheet(wb,'Resumen',totalsSheet,['Indicador','Valor']);
    const blocks=[['Consultas por día',d?.daily,'name'],['Por sucursal',d?.by_branch,'name'],['Por dispositivo',d?.by_device,'name'],['Por obra social',d?.by_social_work,'name'],['Preguntas frecuentes',d?.frequent_questions,'question'],['Rutas',d?.by_route,'route']];
    for(const [title,data,nameKey] of blocks)newSheet(wb,title,(data||[]).map(x=>({Nombre:safeExcel(x[nameKey]),Consultas:Number(x.count||0)})),['Nombre','Consultas']);
  }
  newSheet(wb,'Preguntas y respuestas',questions,headers);
  const binary=XLSX.write(wb,{bookType:'xlsx',type:'buffer',compression:true});
  return new Response(binary,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="GDPSoft_${view}.xlsx"`,'Cache-Control':'no-store'}});
}
