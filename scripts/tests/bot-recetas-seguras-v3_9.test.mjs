import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  asksForPrescriptionChecklist, needsManualPrescriptionReview,
  buildFichaPrescriptionChecklist, buildUncertainPrescriptionReply,
} from '../../lib/assistant/prescription-safety.mjs';

const read = p => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('pregunta amplia de GALENO con vigencia dispara lista, no un campo aislado', () => {
  const q = 'Detallá todos los requisitos generales que debe contener o cumplir la receta para GALENO. Incluí solamente requisitos respaldados por la normativa vigente. Si la normativa distingue receta física, manuscrita, digital o electrónica, indicá esas diferencias. No respondas solamente vigencia.';
  assert.equal(asksForPrescriptionChecklist(q), true);
});

test('preguntas puntuales no son checklist', () => {
  for (const q of ['¿Cuál es la vigencia de la receta GALENO?', '¿Cuántos RP admite PAMI?',
    '¿La receta de OSDE requiere solamente firma?', 'Requisitos solamente de matrícula para recetas de OSDE']) {
    assert.equal(asksForPrescriptionChecklist(q), false, q);
  }
});

test('lista de control también detecta lenguaje breve', () => {
  for (const q of ['requisitos de receta GALENO', '¿Qué debe contener la receta OSDE?',
    'dame el checklist de la receta de PAMI']) {
    assert.equal(asksForPrescriptionChecklist(q), true, q);
  }
});

test('si no hay confirmados, prioriza revisión humana', () => {
  assert.equal(needsManualPrescriptionReview({document_type:'prescription',confirmed_fields:[]}),true);
});

test('si un dato manuscrito esencial es incierto, se niega aprobación visual', () => {
  assert.equal(needsManualPrescriptionReview({
    document_type:'prescription', confirmed_fields:[{field:'letterhead', value:'Hospital'}],
    uncertain_fields:[{field:'medication_name',reason:'manuscrita ilegible'}],
  }), true);
});

test('una receta impresa legible puede seguir al verificador, sin aprobar automáticamente', () => {
  assert.equal(needsManualPrescriptionReview({
    document_type:'prescription', confirmed_fields:[{field:'prescription_date',value:'15/10/2026'}],uncertain_fields:[],
  }), false);
});

test('la ficha sólo devuelve valores reales, sin convertir opcional en requerido', () => {
  const lines = buildFichaPrescriptionChecklist({recipe_validity_days:30,letterhead:'Opcional',rp:3,
    diagnosis:'No requiere',monodrug:'Sí',substitution:'Sí requiere'});
  assert.deepEqual(lines,[
    '• Vigencia registrada (días): 30',
    '• Membrete: Opcional',
    '• Límite de RP por receta: 3',
    '• Diagnóstico: No requiere',
    '• Monodroga: Sí',
    '• Sustitución: Sí requiere',
  ]);
});

test('imagen ilegible pide OOSS, sin adivinar afiliado o autorizar', () => {
  const answer = buildUncertainPrescriptionReply();
  assert.match(answer,/No puedo interpretar/);
  assert.match(answer,/obra social/);
  assert.match(answer,/No puedo confirmar/);
});

test('foto ilegible con OOSS ofrece datos de Ficha, nunca aprobación', () => {
  const answer = buildUncertainPrescriptionReply({socialWorkName:'GALENO',ficha:{rp:3,letterhead:'Opcional'}});
  assert.match(answer,/GALENO/);
  assert.match(answer,/Membrete: Opcional/);
  assert.match(answer,/Revisá también la normativa vigente/);
  assert.doesNotMatch(answer,/Esta receta cumple|Podés dispensar|Aprobada/i);
});

test('rutas integradas: agregado primero, y fail-safe visual antes de normativa', () => {
  const query=read('app/api/assistant/query/route.js');
  const vision=read('app/api/assistant/analyze-image/route.js');
  assert.ok(query.indexOf('if (asksForPrescriptionChecklist(question))') < query.indexOf('const profileIntent ='));
  assert.ok(vision.indexOf('if (needsManualPrescriptionReview(analysis))') < vision.indexOf('const verification ='));
  assert.match(query,/normativeIds\.map/);
  assert.match(vision,/IMAGE_MANUAL_PRESCRIPTION_CHECKLIST/);
  assert.match(vision,/IMAGE_SOCIAL_WORK_CONFLICT/);
  assert.doesNotMatch(vision,/Cumple los controles visibles verificables/);
});
