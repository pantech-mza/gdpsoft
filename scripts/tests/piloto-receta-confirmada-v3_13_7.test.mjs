import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shouldConfirmNewPrescriptionContext,buildConfirmedMissingFieldQuestion} from '../../lib/assistant/recipe-context-clarification.mjs';
import {isPrescriptionMissingFieldQuestion} from '../../lib/assistant/prescription-safety.mjs';
import {scopeLinkedNormatives,scopeNormativeTopic} from '../../lib/assistant/linked-normatives.mjs';
const chat=readFileSync(new URL('../../app/api/assistant/chat/route.js',import.meta.url),'utf8');
const query=readFileSync(new URL('../../app/api/assistant/query/route.js',import.meta.url),'utf8');
const omint = 'Tengo una receta sin fecha de prescripción, ¿la puedo recibir?';
const osde = 'Tengo una receta sin fecha, ¿la puedo recibir?';

test('Sí para OMINT: consulta de fecha, no circuito de sucursal',()=>{
 assert.equal(shouldConfirmNewPrescriptionContext({question:omint,activeSocialWorkId:24}),true);
 const q=buildConfirmedMissingFieldQuestion({question:omint,socialWorkName:'OMINT'});
 assert.match(q,/OMINT/);assert.match(q,/falta fecha de prescripción/);
 assert.doesNotMatch(q,/puedo recibir|se recibe|recibimos aca/i);
 assert.match(q,/normativa vigente/);
});
test('No -> OSDEPYM: nueva OOSS conserva omisión de fecha original',()=>{
 const q=buildConfirmedMissingFieldQuestion({question:osde,socialWorkName:'OSDEPYM'});
 assert.match(q,/OSDEPYM/);assert.match(q,/falta fecha de prescripción/);
 assert.doesNotMatch(q,/OSDE(?:\W|$)/);
});
test('Confirmación no se usa para otra pregunta sin receta incompleta',()=>{
 assert.equal(buildConfirmedMissingFieldQuestion({question:'Qué circuito utiliza OSDE?',socialWorkName:'OSDE'}),null);
 assert.equal(isPrescriptionMissingFieldQuestion(omint),true);
});
test('El chat reenvía consulta normativa solo después de confirmación y mantiene cambio de OOSS',()=>{
 assert.match(chat,/if \(recipeClarification && !topic\) \{/);
 assert.match(chat,/effectiveQuestion = buildConfirmedMissingFieldQuestion/);
 assert.match(chat,/await setConversationSocialWork\(\{conversationId,socialWorkId:selectedId\}\)/);
 assert.match(chat,/question:\s*effectiveQuestion/);
});
test('El query protege consultas directas de receta sin dato y delimita normativas generales',()=>{
 assert.match(query,/prescriptionMissingField \? null : detectedOperationIntent/);
 assert.match(query,/scopeNormativeTopic\(scopeLinkedNormatives/);
 assert.match(query,/normatives!inner\(is_current,title\)/);
 const rows=[
 {normative_id:1,normatives:{title:'OMINT.pdf'}},
 {normative_id:2,normatives:{title:'OMINT vacunas'}},
 {normative_id:3,normatives:{title:'OMINT Cronicidad'}},
 {normative_id:4,normatives:{title:'OMINT OSIM Ambulatorio'}},
 ];
 const s=scopeLinkedNormatives(rows);
 assert.deepEqual(scopeNormativeTopic(s,rows,'Qué requisitos tiene una receta de OMINT?').normativeIds,[1,4]);
 assert.deepEqual(scopeNormativeTopic(s,rows,'Qué requisitos tienen vacunas OMINT?').normativeIds,[1,2,4]);
});
