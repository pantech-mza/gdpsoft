import test from "node:test";
import assert from "node:assert/strict";
import { asksForPrescriptionChecklist } from "../../lib/assistant/prescription-safety.mjs";
import { parseRequirementsMessage, buildRequirementsAnswer } from "../../lib/assistant/requirements-view.mjs";

test("«requisitos <obra social>» usa el mismo camino que «requisitos de receta»", () => {
  for (const q of ["requisitos berkley", "requisitos oyte", "cuales son los requisitos de osep"]) {
    assert.equal(asksForPrescriptionChecklist(q), true, q);
  }
  for (const q of ["requisitos de afiliación", "requisitos de facturacion osep", "requisitos de alta", "requisitos para vacunas"]) {
    assert.equal(asksForPrescriptionChecklist(q), false, q);
  }
});

test("el texto sin «##», sin Ficha: ni Circuito: también se muestra en pestañas", () => {
  const view = parseRequirementsMessage(`Requisitos de receta · BERKLEY ART
- Tipo: común - digital
- Vigencia: 10 días
Receta
- Nombre y apellido del paciente.
- .
Cantidades
- Máximo de 3 renglones por receta.
Facturación
- Fecha de venta.
Importante: Número de siniestro (su ausencia es motivo de débito).
Fuente: NORMAS
Aviso: revisá la receta`);
  assert.deepEqual(view.sections.map((s) => s.title), ["Receta", "Cantidades", "Facturación"]);
  assert.equal(view.ficha.length, 2);
  assert.equal(view.sections[0].items.length, 1);
  assert.equal(view.alerts.length, 1);
});

test("el formato del servidor sigue funcionando y no deja viñetas sueltas", () => {
  const text = buildRequirementsAnswer({
    socialWorkName: "BERKLEY ART", circuitLabel: "Cámara",
    fichaLines: ["Tipo de receta: común", "Vigencia: 10"],
    normativeAnswer: "- Nombre y apellido del paciente.\n- Fecha de prescripción.\n- Máximo de 3 renglones por receta.\n- Fecha de venta.\n.",
  });
  assert.doesNotMatch(text, /^- \.$/m);
  const view = parseRequirementsMessage(text);
  assert.equal(view.circuit, "Cámara");
  assert.equal(view.sections.length, 3);
});
