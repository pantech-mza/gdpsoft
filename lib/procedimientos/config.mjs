export const BUCKET = 'gdp-internal-procedures';
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_CHARS = 28000;
export const VALID_INTENTS = Object.freeze([
  'VALIDATOR_FAILURE','RECIPE_ERROR','COVERAGE_ERROR','RECIPE_DATA','AUTH_MISMATCH',
  'EXPIRY','FORMAT','MISSING_SW','EXTERNAL_PHARMACY','IMAGE_REVIEW',
  'OSEP_STOCK','PAMI_DOCS','IMED_FAILURE','PAMI_IMED_FAILURE'
]);
export const VALID_SCOPES = Object.freeze(['GENERAL','SOCIAL_WORK','IMED','PAMI_IMED']);
export const ACCEPTED_EXTENSIONS = Object.freeze(['pdf','doc','docx','xls','xlsx']);
export function safeExtension(filename='') {
  const ext = String(filename).split('.').pop()?.toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext) ? ext : null;
}
export function cleanText(value, max=6000) { return String(value ?? '').trim().slice(0,max); }
export function validDraft(payload) {
  const title = cleanText(payload.title,140), question = cleanText(payload.question,1500);
  const answer = cleanText(payload.answer,6000);
  const intent = String(payload.intent ?? '').trim();
  const scope = String(payload.scope ?? '').trim();
  const source_document = cleanText(payload.source_document,250);
  const notes = cleanText(payload.review_notes,3000);
  const sw = payload.social_work_id == null || payload.social_work_id === '' ? null : Number(payload.social_work_id);
  const ch = payload.billing_channel_id == null || payload.billing_channel_id === '' ? null : Number(payload.billing_channel_id);
  if(title.length<4 || question.length<8 || answer.length<12 || !source_document || !VALID_INTENTS.includes(intent) || !VALID_SCOPES.includes(scope)) return {error:'Completá título, pregunta, respuesta, origen, intención y ámbito.'};
  if(scope==='SOCIAL_WORK' && (!Number.isInteger(sw)||sw<1)) return {error:'Seleccioná una obra social válida para este ámbito.'};
  if(sw!==null && (!Number.isInteger(sw) || sw<1)) return {error:'Obra social inválida.'};
  if(ch!==null && (!Number.isInteger(ch)||ch<1)) return {error:'Circuito inválido.'};
  return {value:{title,question,answer,intent,scope,social_work_id:sw,billing_channel_id:ch,source_document,review_notes:notes}};
}
export function uniqueCode(){return `GDP-MAN-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;}
