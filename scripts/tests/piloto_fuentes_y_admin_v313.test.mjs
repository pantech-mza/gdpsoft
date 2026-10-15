import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveDeclaredCircuitPolicy} from '../../lib/operations/camara-colegio-policy.mjs';
import {scopeLinkedNormatives,isSpecificNormativeTopic} from '../../lib/assistant/linked-normatives.mjs';
import {shouldPreferValidationProfile} from '../../lib/assistant/validation-profile-priority.mjs';
import {isOperationalCircuitQuestion} from '../../lib/assistant/operational-circuit-intent.mjs';
import {isSpecificNormativeQuestion,isImmediateOperationalContingency} from '../../lib/assistant/response-priority.mjs';

const p=(name,work)=>resolveDeclaredCircuitPolicy({branchName:name,branchCode:name,socialWorkName:work});
test('DP1 Cámara y casos particulares no se mezclan con validador',()=>{
  assert.equal(p('DP1','OSECAC').mode,'EXTERNAL_VALIDATOR');
  assert.equal(p('DP1','OSPAV').mode,'CAMARA_COLEGIO');
  assert.equal(p('DP1','OSFYHC').mode,'CAMARA_COLEGIO');
  assert.equal(p('DP1','OSDE').mode,'DIRECT');
  assert.equal(p('DP1','OSSEG').mode,'CAMARA_COLEGIO');
  assert.equal(p('DP1','OSDEPYM').mode,'REGULAR_VALIDATOR');
  assert.equal(p('DP1','PROVINCIA ART').mode,'REVIEW_REQUIRED');
});
test('seis sucursales: las excepciones de OSSEG y Federación se conservan',()=>{
  for(const b of ['DP1','Libertad','Econo Más','DP4','DP5','San Francisco']){
    assert.ok(p(b,'OSECAC'));
  }
  assert.equal(p('San Francisco','OSSEG').mode,'DIRECT');
  assert.equal(p('Libertad','FEDERACION PATRONAL ART').mode,'DIRECT');
  assert.equal(p('DP4','FEDERACION PATRONAL ART').mode,'CAMARA_COLEGIO');
});
test('consultas de validador no quedan bloqueadas por una regla operativa general',()=>{
  const question='¿Por dónde valido OSDEPYM? ¿Qué validador utiliza?';
  assert.equal(shouldPreferValidationProfile({operationType:'VALIDATION',profileKey:'VALIDATION_METHOD',question}),true);
  assert.equal(isOperationalCircuitQuestion(question),false);
  assert.equal(isOperationalCircuitQuestion('¿OSPAV en DP1 se tramita directo o por Cámara–Colegio?'),true);
});
test('anexos unificados: múltiples normativas con el mismo app_id',()=>{
  assert.equal(isSpecificNormativeTopic('vacunas de OMINT'),true);
  const result=scopeLinkedNormatives([{normative_id:17,billing_channel_id:null},{normative_id:162,billing_channel_id:null},{normative_id:150,billing_channel_id:null}]);
  assert.equal(result.ok,true);
  assert.deepEqual(result.normativeIds,[17,162,150]);
});
test('protocolos internos solo contingencias, no requisitos generales',()=>{
  assert.equal(isSpecificNormativeQuestion('¿Cuántos días vale una receta de OSDE?'),true);
  assert.equal(isImmediateOperationalContingency('Se cayó el validador de OSECAC'),true);
});
test('notificaciones implementan republish y delete con permisos de admin',()=>{
  const js=readFileSync('app/api/admin/noticias/route.js','utf8');
  assert.match(js,/action === 'republish'/);
  assert.match(js,/branch_notice_ack'\)\.delete\(\)/);
  assert.match(js,/export async function DELETE/);
  assert.match(js,/!adminActor\(actor\)/);
});
test('corte del piloto es no destructivo y deja semillas vacías',()=>{
  const sql=readFileSync('supabase/migrations/20261019_pilot_clean_start_RUN_MONDAY.sql','utf8');
  assert.match(sql,/seed_query_ids = '\{\}'::bigint\[\]/);
  assert.doesNotMatch(sql,/\b(TRUNCATE|DELETE FROM|DROP TABLE)\b/i);
});
