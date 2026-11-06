"use client";

import { splitWithValidators } from "../../lib/assistant/validator-links.mjs";

// Texto con enlaces clickeables: direcciones escritas y nombres de validadores (IMED, DIDIO, COFA…).
// Solo http/https; React escapa el contenido, nunca se inserta HTML.
export default function LinkifiedText({ text }) {
  return splitWithValidators(text).map((part, index) =>
    part.type === "link"
      ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-words font-semibold text-[#8f2a85] underline">{part.label || part.value}</a>
      : <span key={index}>{part.value}</span>
  );
}
