import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isSocialWorkStatusQuestion,hasExplicitStatusSubject,formatSocialWorkStatus} from '../../lib/assistant/social-work-status.mjs';
import {buildSocialWorkDictionary,detectSocialWorks} from '../../lib/assistant/socialWorkDetection.js';

const read = p => readFileSync(new URL('../../'+p, import.meta.url),'utf8');

test('OSSEG está activa: estado sí y fuente Recordá/Ficha, sin afirmar recepción',()=>{
 assert.equal(isSocialWorkStatusQuestion('Osseg está activa?'),true);
 const answer=formatSocialWorkStatus({id:55,name:'OSSEG',active:true});
 assert.match(answer,/Sí, OSSEG está activa en GDPSoft/);
 assert.match(answer,/Fuente: Recordá\/Ficha de OSSEG/);
 assert.match(answer,/no confirma la habilitación del convenio/);
});

test('Los registros inactivos se pueden consultar sin falsear su estado',()=>{
 assert.equal(isSocialWorkStatusQuestion('¿La obra social OSSEG sigue inactiva?'),true);
 assert.match(formatSocialWorkStatus({name:'OSSEG',active:false}),/figura inactiva/);
 assert.doesNotMatch(formatSocialWorkStatus({name:'OSSEG',active:false}),/Sí, OSSEG está activa/);
});

test('No confundir estado de OOSS con plan, receta, campaña o convenio',()=>{
 for(const q of ['¿La normativa de OSSEG está activa?', '¿El convenio de OSSEG está activo?', '¿La cobertura OSSEG está activa?', '¿La receta está activa?']) {
   assert.equal(isSocialWorkStatusQuestion(q),false,q);
 }
});

test('Nombre desconocido no debe caer en la OOSS activa previa',()=>{
 assert.equal(hasExplicitStatusSubject('¿SALUD XYZ INVENTADA está activa?'),true);
 assert.equal(hasExplicitStatusSubject('¿OSSEG está activa?'),true);
 assert.equal(hasExplicitStatusSubject('¿Sigue activa?'),false);
 assert.equal(hasExplicitStatusSubject('¿Está activa esta obra social?'),false);
});

test('La detección de OOSS incluye estados activos/inactivos sin falsos alias',()=>{
 const works=[{id:1,name:'OSSEG',active:true},{id:2,name:'OSDEPYM',active:false}];
 const dictionary=buildSocialWorkDictionary({socialWorks:works});
 assert.equal(detectSocialWorks({text:'¿OSSEG está activa?',dictionary})[0].id,1);
 assert.equal(detectSocialWorks({text:'¿OSDEPYM está inactiva?',dictionary})[0].id,2);
 assert.deepEqual(detectSocialWorks({text:'¿SALUD XYZ INVENTADA está activa?',dictionary}),[]);
});

test('Chat deriva estado antes de cambiar contexto; Query lee social_works.active y audita',()=>{
 const chat=read('app/api/assistant/chat/route.js');
 const query=read('app/api/assistant/query/route.js');
 const bypass=chat.indexOf('if (originalQuestion && !topic && isSocialWorkStatusQuestion(originalQuestion))');
 const updateContext=chat.indexOf('if (originalQuestion && !recipeClarification)');
 assert.ok(bypass>0 && bypass<updateContext,'el status debe consultarse antes de cambiar la OOSS del chat');
 const statusRoute=query.indexOf('if (isSocialWorkStatusQuestion(question))');
 const operational=query.indexOf('const detectedOperationIntent = detectOperationIntent(question)');
 assert.ok(statusRoute>0 && statusRoute<operational,'no debe consultar circuito o normativa');
 assert.match(query,/select\("id,name,active"\)/);
 assert.match(query,/STRUCTURED_SOCIAL_WORK_STATUS/);
 assert.match(query,/source:"SOCIAL_WORK_PROFILE"/);
});
