import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSocialWorkDictionary,detectSocialWorks } from '../../lib/assistant/socialWorkDetection.js';
import { asksForPrescriptionChecklist,isPrescriptionMissingFieldQuestion,buildMissingFieldNormativeQuestion } from '../../lib/assistant/prescription-safety.mjs';
import { scopeLinkedNormatives,scopeNormativeTopic } from '../../lib/assistant/linked-normatives.mjs';
import { resolveDeclaredCircuitPolicy } from '../../lib/operations/camara-colegio-policy.mjs';

const query=readFileSync(new URL('../../app/api/assistant/query/route.js',import.meta.url),'utf8');
const internal=readFileSync(new URL('../../lib/assistant/internal-procedures.js',import.meta.url),'utf8');
const dict=buildSocialWorkDictionary({socialWorks:[
  {id:35,name:'OSDEPYM'}, {id:20,name:'OSDE'}, {id:24,name:'OMINT'},
  {id:7,name:'OSECAC'}, {id:28,name:'OSSEG'},
]});

test('OSDEPMY mal escrito refiere únicamente a OSDEPYM, no a OSDE ni a la OOSS activa',()=>{
  assert.deepEqual(detectSocialWorks({text:'por donde valido osdepmy y que validador usa?',dictionary:dict}).map(x=>x.id),[35]);
  assert.deepEqual(detectSocialWorks({text:'por donde valido OSDEPYM?',dictionary:dict}).map(x=>x.id),[35]);
  assert.deepEqual(detectSocialWorks({text:'que validador usa OSDE?',dictionary:dict}).map(x=>x.id),[20]);
  assert.deepEqual(detectSocialWorks({text:'¿La puedo recibir?',dictionary:dict}),[]);
  assert.deepEqual(detectSocialWorks({text:'consultame las vacunas de OMINT',dictionary:dict}).map(x=>x.id),[24]);
});

test('la receta sin fecha en contexto OMINT es normativa, no el circuito de recepción',()=>{
  const q='Tengo una receta sin fecha de prescripción. ¿La puedo recibir?';
  assert.equal(isPrescriptionMissingFieldQuestion(q),true);
  assert.equal(isPrescriptionMissingFieldQuestion('¿En Libertad puedo recibir OSECAC?'),false);
  assert.equal(isPrescriptionMissingFieldQuestion('¿OSDE va directo o por Cámara–Colegio?'),false);
  const f=buildMissingFieldNormativeQuestion({question:q,socialWorkName:'OMINT'});
  assert.match(f,/OMINT/);
  assert.match(f,/fecha de prescripción/);
  assert.match(f,/NO confundas aptitud de la receta con circuito/);
  assert.equal(buildMissingFieldNormativeQuestion({question:q,socialWorkName:null}),null);
  assert.match(query,/const prescriptionMissingField = isPrescriptionMissingFieldQuestion\(question\)/);
  assert.match(query,/if \(prescriptionMissingField\) \{/);
  assert.match(query,/getSocialWorkName\(socialWorkId\)/);
  assert.match(query,/skipAnswerCache = true;/);
});

test('vacunas de OMINT busca anexo, no checklist general de cronicidad/diabetes',()=>{
  assert.equal(asksForPrescriptionChecklist('Tengo una receta de vacunas de OMINT. ¿Qué requisitos específicos debo verificar?'),false);
  assert.equal(asksForPrescriptionChecklist('Detallame todos los requisitos generales de receta para OMINT'),true);
  const rows=[
    {normative_id:1,billing_channel_id:null,normatives:{title:'OMINT - Norma de atención'}},
    {normative_id:2,billing_channel_id:null,normatives:{title:'Nota OMINT Campaña Vacunación Antigripal 2026'}},
    {normative_id:3,billing_channel_id:null,normatives:{title:'OMINT OSIM - Cronicidad'}},
    {normative_id:4,billing_channel_id:null,normatives:{title:'OMINT OSIM - Diabetes'}},
    {normative_id:5,billing_channel_id:null,normatives:{title:'OMINT OSIM - Ambulatorio'}},
  ];
  const scope=scopeLinkedNormatives(rows);
  assert.deepEqual(scopeNormativeTopic(scope,rows,'requisitos para vacunas OMINT').normativeIds,[1,2,5]);
  assert.deepEqual(scopeNormativeTopic(scope,rows,'requisitos diabetes OMINT').normativeIds,[1,4,5]);
  assert.deepEqual(scopeNormativeTopic(scope,rows,'requisitos generales de receta OMINT').normativeIds,[1,5]);
  // Si no se puede reconocer un título pertinente, no inventar exclusiones.
  assert.deepEqual(scopeNormativeTopic(scope,rows,'requisitos PMI OMINT').normativeIds,[1,2,3,4,5]);
  assert.match(query,/activeBillingChannelId, fileSearchQuestion/);
});

test('se oculta la referencia editorial de la reunión, pero el protocolo sigue identificado',()=>{
  assert.match(internal,/Procedimiento interno aprobado de GDP Salud/);
  assert.doesNotMatch(internal,/\$\{rule\.source_document\}.*Fuente/);
  assert.match(internal,/procedure_id: rule\.id/);
});

test('no se modifican las excepciones de las sucursales de Colegio',()=>{
  const p=(work)=>resolveDeclaredCircuitPolicy({branchName:'Libertad',branchCode:'LIBERTAD',socialWorkName:work}).mode;
  assert.equal(p('PROVINCIA ART'),'CAMARA_COLEGIO');
  assert.equal(p('OSECAC'),'CAMARA_COLEGIO');
  assert.equal(p('OSSEG'),'CAMARA_COLEGIO');
  assert.equal(p('FEDERACION PATRONAL ART'),'DIRECT');
  assert.equal(p('OSDE'),'DIRECT');
});
