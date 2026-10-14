// Contrato del visor de Sucursal (question / instruction / result).
// Validar antes de APROBAR y PUBLICAR. Los borradores se pueden guardar incompletos.
export function validateTree(tree) {
  const errors = [];
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) return ["El árbol debe ser un objeto JSON"];
  const nodes = tree.nodes;
  if (!Array.isArray(nodes) || !nodes.length || nodes.length > 100) return ["El árbol debe contener entre 1 y 100 nodos"];
  const byId = new Map();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!n || typeof n !== "object" || Array.isArray(n)) { errors.push(`Nodo ${i + 1} inválido`); continue; }
    const id = String(n.id || "").trim();
    if (!id) errors.push(`Nodo ${i + 1} sin ID`);
    else if (byId.has(id)) errors.push(`ID duplicado: ${id}`);
    else byId.set(id, n);
    if (!["question", "instruction", "result"].includes(n.type)) errors.push(`Nodo ${id || i + 1}: tipo inválido`);
    if (!String(n.text || "").trim()) errors.push(`Nodo ${id || i + 1}: falta texto`);
  }
  const start = String(tree.start_node || "").trim();
  if (!start || !byId.has(start)) errors.push("El nodo inicial no existe");
  const nextIds = new Map();
  for (const [id, n] of byId) {
    const next = [];
    if (n.type === "question") {
      if (!Array.isArray(n.options) || n.options.length < 2) errors.push(`Pregunta ${id}: se requieren al menos 2 opciones`);
      else for (const option of n.options) {
        if (!String(option?.label || "").trim() || !String(option?.next || "").trim()) errors.push(`Pregunta ${id}: opción sin texto o destino`);
        else next.push(String(option.next));
      }
    }
    if (n.type === "instruction") {
      if (!String(n.next || "").trim()) errors.push(`Instrucción ${id}: falta el siguiente nodo`);
      else next.push(String(n.next));
    }
    if (n.type === "result" && (n.next || n.options?.length)) errors.push(`Resultado ${id}: debe ser terminal`);
    for (const target of next) if (!byId.has(target)) errors.push(`Nodo ${id}: destino ${target} inexistente`);
    nextIds.set(id, next);
  }
  if (errors.length) return [...new Set(errors)].slice(0, 15);
  const visited = new Set();
  const visiting = new Set();
  let endsInResult = false;
  function walk(id) {
    if (visiting.has(id)) { errors.push(`Recorrido circular desde ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    const n = byId.get(id);
    if (n.type === "result") endsInResult = true;
    for (const target of nextIds.get(id) || []) walk(target);
    visiting.delete(id);
    visited.add(id);
  }
  walk(start);
  if (!endsInResult) errors.push("El recorrido no llega a un resultado final");
  if (visited.size !== byId.size) errors.push("Hay nodos desconectados del inicio");
  return errors.slice(0, 15);
}
