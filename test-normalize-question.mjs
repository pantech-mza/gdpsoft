import { normalizeQuestion } from "./lib/assistant/normalize-question.js";

const examples = [
  "¿Cuánto cubre?",
  "CUANTO CUBRE?",
  "cuánto cubre",
  "  Cuanto   cubre!!!  ",
  "¿Dónde valido OSECAC?"
];

for (const text of examples) {
  console.log(
    JSON.stringify({
      original: text,
      normalized: normalizeQuestion(text),
    })
  );
}