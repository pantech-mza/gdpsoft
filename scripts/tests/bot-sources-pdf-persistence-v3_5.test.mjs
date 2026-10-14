import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isSpecificNormativeQuestion, isImmediateOperationalContingency } from '../../lib/assistant/response-priority.mjs';

const root = new URL('../../',import.meta.url);
const read = x => fs.readFileSync(new URL(x,root),'utf8');
const norm = [
  'vigencia receta osde','vigencia de las recetas de PAMI','cuantos rp acepta avalian',
  'OSDE exige diagnóstico', 'tipo de receta osep', 'porcentaje de cobertura osde',
  'por donde valido Sancor', 'vencimiento receta de osde',
];
for (const q of norm) test(`Consulta específica usa ficha/normativa: ${q}`, () => {
  assert.equal(isSpecificNormativeQuestion(q),true);
  assert.equal(isImmediateOperationalContingency(q),false);
});
for (const q of ['se cayó el validador de OSDE','no funciona TYS de PAMI','error TYS al validar receta']) {
  test(`Contingencia interna real: ${q}`, () => assert.equal(isImmediateOperationalContingency(q),true));
}
test('prioridad normativa en router y protocolo como último recurso',()=>{
  const route=read('app/api/assistant/query/route.js');
  assert.match(route,/isImmediateOperationalContingency\(question\)/);
  assert.match(route,/!found && !isSpecificNormativeQuestion\(question\)/);
  assert.match(route,/source:\s*"SOCIAL_WORK_PROFILE"/);
});
test('PDF real permitido y validado en backend; requisito de almacenamiento',()=>{
  const route=read('app/api/conversations/[id]/images/route.js');
  assert.match(route,/"application\/pdf"/);
  assert.match(route,/"%PDF-"/);
  assert.match(read('app/api/assistant/analyze-image/route.js'),/input_file/);
  assert.match(read('supabase/migrations/20261014_assistant_pdf_upload.sql'),/assistant-images/);
});
test('PDF usa verificación normativa y respeta Cámara/Colegio',()=>{
  const route=read('app/api/assistant/analyze-image/route.js');
  assert.match(route,/getStructuredFichaRequirements/);
  assert.match(route,/getNormativeCircuitScope/);
  assert.match(route,/normativeIds/);
  assert.match(route,/no autoriza por sí sola la dispensación/);
});
test('conversaciones se restauran por usuario y dispositivo sin guardar tokens',()=>{
  const s=read('components/FloatingAssistant.jsx');
  assert.match(s,/sessionStorage\.setItem\(CHAT_SNAPSHOT_KEY/);
  assert.match(s,/setConversationId\(saved.conversationId/);
  assert.match(s,/gdpsoft_device_uuid/);
  assert.ok(!s.includes("owner, accessToken"));
});
