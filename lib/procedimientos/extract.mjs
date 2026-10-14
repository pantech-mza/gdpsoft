import {MAX_TEXT_CHARS, MAX_UPLOAD_BYTES, safeExtension} from './config.mjs';
export async function extractProcedureText(buffer,filename) {
 const ext=safeExtension(filename);
 if(!ext)throw new Error('Formato no permitido. Usá PDF, Word (.doc/.docx) o Excel (.xls/.xlsx).');
 if(buffer.length<32 || buffer.length>MAX_UPLOAD_BYTES)throw new Error('El archivo debe tener entre 32 bytes y 10 MB.');
 let text=''; let pages=null;
 if(ext==='pdf'){
  if(buffer.subarray(0,5).toString()!=='%PDF-')throw new Error('El archivo no parece ser un PDF válido.');
  const {getDocumentProxy,extractText}=await import('unpdf');
  const pdf=await getDocumentProxy(new Uint8Array(buffer));
  try{ const result=await extractText(pdf,{mergePages:true});
   text=typeof result.text==='string'?result.text:Array.isArray(result.text)?result.text.join('\n'):'';
   pages=pdf.numPages??null;
  } finally {await pdf.destroy?.();}
 }else if(ext==='docx'){
  const mammoth=(await import('mammoth')).default;
  const result=await mammoth.extractRawText({buffer});
  text=result.value;
 }else if(ext==='doc'){
  const {mkdtemp,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'gdp-proc-'));
  try {const filepath=join(dir,'documento.doc');await writeFile(filepath,buffer);
   const WordExtractor=(await import('word-extractor')).default;
   const extracted=await new WordExtractor().extract(filepath);text=extracted.getBody();
  } finally {await rm(dir,{recursive:true,force:true});}
 }else{
  // Se lee sin fórmulas ejecutables ni macros. Limitar filas y hojas procesadas.
  const xlsx=(await import('xlsx')).default;
  const wb=xlsx.read(buffer,{type:'buffer',bookVBA:false,cellFormula:false,cellHTML:false});
  text=wb.SheetNames.slice(0,6).map(name=>{
    const rows=xlsx.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',blankrows:false,raw:false});
    return `HOJA: ${name}\n${rows.slice(0,220).map(row=>row.slice(0,24).join(' | ')).join('\n')}`;
  }).join('\n\n');
 }
 text=String(text||'').replace(/\0/g,'').replace(/[\t ]{3,}/g,' ').trim();
 if(text.length<100)throw new Error('No se detectó texto suficiente. Si el PDF está escaneado, requiere OCR o carga manual.');
 return {text:text.slice(0,MAX_TEXT_CHARS),truncated:text.length>MAX_TEXT_CHARS,pages,extension:ext};
}
