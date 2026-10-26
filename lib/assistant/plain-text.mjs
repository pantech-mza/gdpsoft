// v3.13.101g — Quita los símbolos de formato markdown (###, **negrita**, __, `código`) para mostrar texto limpio.
// No toca guiones de lista ni numeración: solo los símbolos que el lector ve como "asteriscos".
export function stripMarkdown(input) {
  return String(input ?? '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')        // ### Título
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1')  // [texto](url) → texto (el chat lo vuelve enlace)
    .replace(/([^\s()][^()\n]{2,60}?) \(\1\)/g, '$1')          // «Mis Validaciones (Mis Validaciones)» → una sola vez
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')         // **negrita**
    .replace(/__([^_\n]+?)__/g, '$1')             // __negrita__
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:]|$)/g, '$1$2') // *cursiva*
    .replace(/`([^`\n]+?)`/g, '$1')               // `código`
    .replace(/\*\*/g, '')                         // restos de ** sueltos
    .replace(/[ \t]+$/gm, '');
}
