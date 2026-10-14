import test from "node:test";
import assert from "node:assert/strict";
import {
  parseAssistantMessage,
  splitInlineNumberedSteps,
  isStructuredAssistantMessage,
  classifyStepIcon,
} from "../../lib/assistant/format-message.mjs";

test("lista pegada en una sola línea se separa en seis pasos", () => {
  const sample = "1. Verificar si la validación falla en TYS. 2. Probar la página del validador externo en una ventana de incógnito, si corresponde a esa obra social. 3. Si también falla, informar al paciente de la dificultad comprobada. 4. Consultar descuentos adicionales. 5. Si hay dudas, contactar Obras Sociales. 6. Nunca forzar cobertura por el solo hecho de que el validador no funcione.";
  const parsed = parseAssistantMessage(sample);
  assert.equal(parsed.length, 6);
  assert.deepEqual(parsed.map(x => x.number), [1,2,3,4,5,6]);
  assert.equal(parsed[0].text, "Verificar si la validación falla en TYS.");
  assert.match(parsed[5].text, /Nunca forzar cobertura/);
});

test("respuestas numeradas con saltos de línea", () => {
  const text = "Procedimiento\n1. Revisar el error\n2. Consultar Obras Sociales";
  const parsed = parseAssistantMessage(text);
  assert.deepEqual(parsed.map(x => x.type), ["paragraph", "step", "step"]);
  assert.equal(parsed[1].text, "Revisar el error");
});

test("requisitos con viñetas y títulos markdown", () => {
  const parsed = parseAssistantMessage("### Receta\n- **Firma** del profesional\n- Fecha de prescripción\n\n**Importante:** No forzar cobertura.");
  assert.deepEqual(parsed.map(x => x.type), ["heading", "bullet", "bullet", "warning"]);
});

test("texto simple queda simple", () => {
  const parsed = parseAssistantMessage("No encuentro información adicional sobre la normativa.");
  assert.equal(isStructuredAssistantMessage(parsed), false);
  assert.equal(parsed[0].text, "No encuentro información adicional sobre la normativa.");
});

test("no separa valores, decimales ni fechas", () => {
  const txt = "Vigencia: 30 días. Fecha 20.09.2025. El precio es 1.500 pesos.";
  assert.equal(splitInlineNumberedSteps(txt), txt);
});

test("avisos e iconos informativos", () => {
  assert.match(classifyStepIcon("Verificar el error de TYS"), /clipboard/);
  assert.match(classifyStepIcon("No forzar cobertura"), /shield/);
});

test("sin HTML interpretado", () => {
  const text = "<script>alert('x')</script>";
  assert.equal(parseAssistantMessage(text)[0].text, text);
});
