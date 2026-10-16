import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldConfirmNewPrescriptionContext as gate, interpretPrescriptionContextReply as reply } from '../../lib/assistant/recipe-context-clarification.mjs';

const chat = readFileSync(new URL('../../app/api/assistant/chat/route.js', import.meta.url),'utf8');
const floating = readFileSync(new URL('../../components/FloatingAssistant.jsx', import.meta.url),'utf8');

test('solo receta NUEVA sin fecha y sin OOSS: repregunta con contexto activo',()=>{
  const activeSocialWorkId = 24;
  assert.equal(gate({question:'Tengo una receta sin fecha de prescripción, ¿la puedo recibir?',activeSocialWorkId}),true);
  assert.equal(gate({question:'Me trajeron una receta sin firma, ¿la acepto?',activeSocialWorkId}),true);
  assert.equal(gate({question:'¿Y si la receta no tiene fecha de prescripción, puedo recibirla?',activeSocialWorkId}),false);
  assert.equal(gate({question:'¿Cuántos RP acepta?',activeSocialWorkId}),false);
  assert.equal(gate({question:'¿Y para vacunas?',activeSocialWorkId}),false);
  assert.equal(gate({question:'Tengo una receta sin fecha de prescripción, ¿la puedo recibir?',activeSocialWorkId,namedSocialWork:true}),false);
  assert.equal(gate({question:'Tengo una receta sin fecha de prescripción, ¿la puedo recibir?',activeSocialWorkId:null}),false);
  assert.equal(gate({question:'Tengo una receta sin fecha de prescripción, ¿la puedo recibir?',activeSocialWorkId,topic:'RECIPE_REQUIREMENTS'}),false);
  assert.equal(gate({question:'¿Puedo recibir OSECAC en Libertad?',activeSocialWorkId}),false);
});

test('sí confirma solamente OOSS; no pide nueva; nombre nuevo sigue la selección',()=>{
  assert.equal(reply('Sí'),'CONFIRM_ACTIVE');
  assert.equal(reply('si'),'CONFIRM_ACTIVE');
  assert.equal(reply('No'),'ASK_OTHER');
  assert.equal(reply('Otra obra social'),'ASK_OTHER');
  assert.equal(reply('OSDEPYM'),'SELECT_OTHER');
});

test('la ruta chat valida nueva OOSS antes de cambiar y no pierde la consulta original',()=>{
  assert.match(chat,/recipeClarification\.socialWorkName/);
  assert.match(chat,/const detected = await detectSocialWork\(candidate\)/);
  assert.match(chat,/if \(detected\.multiple \|\| !detected\.found \|\| !detected\.socialWork\)/);
  assert.match(chat,/await setConversationSocialWork\(\{conversationId,socialWorkId:selectedId\}\)/);
  assert.match(chat,/RECIPE_SOCIAL_WORK_UNKNOWN/);
  assert.match(chat,/RECIPE_CONTEXT_CHANGED/);
  assert.match(chat,/route: "RECIPE_SOCIAL_WORK_CONFIRMATION"/);
  assert.match(chat,/namedSocialWorkInQuestion = true/);
  assert.match(chat,/isGeneralBranchCircuitQuestion\(originalQuestion\)/);
});

test('frontend mantiene pregunta pendiente hasta respuesta válida, persiste contexto y ofrece Sí/No',()=>{
  assert.match(floating,/saved\.pendingRecipeContext/);
  assert.match(floating,/pendingRecipeContext, usedTopics/);
  assert.match(floating,/pending\.originalQuestion/);
  assert.match(floating,/expectedSocialWorkId:pending\.socialWorkId/);
  assert.match(floating,/socialWorkName:reply/);
  assert.match(floating,/if \(ok\) setPendingRecipeContext\(null\)/);
  assert.match(floating,/CONFIRM_SOCIAL_WORK/);
  assert.match(floating,/¿A qué obra social pertenece la receta\?/);
  assert.match(floating,/setPendingRecipeContext\(null\);/);
});

test('el router de v3.12.5 sigue admitiendo circuito general sin OOSS',()=>{
  assert.match(chat,/isGeneralBranchCircuitQuestion\(originalQuestion\)/);
  assert.match(chat,/\/api\/assistant\/query/);
});
