export function normalizeQuestion(text = "") {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿?¡!,.;:()[\]{}"'`´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}