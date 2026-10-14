// Reparación CONSERVADORA de enlaces rotos en candidatos generados por IA.
// Jamás deduce autorizaciones, cobertura o instrucciones faltantes.
// Inserta un terminal de bloqueo claramente visible en revisión administrativa.
export const REVIEW_PREFIX = "PENDIENTE DE REVISIÓN:";

export function hasUnresolvedReview(tree) {
  if (!tree || !Array.isArray(tree.nodes)) return false;
  return tree.nodes.some(node =>
    typeof node?.text === "string" && node.text.trim().startsWith(REVIEW_PREFIX)
  );
}

export function repairMissingDestinations(tree) {
  if (!tree || !Array.isArray(tree.nodes)) return { tree, warnings: [] };
  const nodes = tree.nodes.map(node => ({
    ...node,
    options: Array.isArray(node?.options) ? node.options.map(option => ({ ...option })) : node?.options,
  }));
  const ids = new Set(nodes.map(node => String(node?.id ?? "").trim()).filter(Boolean));
  const appended = new Map();
  const warnings = [];
  let sequence = 1;

  function placeholderFor(target) {
    if (ids.has(target)) return target;
    if (appended.has(target)) return appended.get(target);
    // El contrato admite como máximo 100 nodos por árbol.
    if (nodes.length >= 100) return null;
    let id;
    do { id = `revision_pendiente_${sequence++}`; } while (ids.has(id));
    ids.add(id);
    appended.set(target, id);
    nodes.push({
      id,
      type: "result",
      text: `${REVIEW_PREFIX} la IA mencionó el paso «${target.slice(0, 100)}» pero no indicó cómo resolverlo. No continuar ni asumir autorizaciones. Consultar a Obras Sociales y completar este resultado contra la normativa antes de aprobar.`,
      next: null,
      options: [],
    });
    warnings.push(`Enlace sin destino definido «${target.slice(0, 100)}»: creado un resultado de BLOQUEO para revisión obligatoria.`);
    return id;
  }

  // Solo corregimos referencias explícitas a IDs ausentes; no tocamos
  // decisiones, porcentajes, requisitos ni textos producidos por la IA.
  const originalCount = nodes.length;
  for (let i = 0; i < originalCount; i++) {
    const node = nodes[i];
    if (node.type === "question" && Array.isArray(node.options)) {
      for (const option of node.options) {
        const dest = String(option?.next || "").trim();
        if (!dest || ids.has(dest)) continue;
        const safe = placeholderFor(dest);
        if (safe) option.next = safe;
      }
    } else if (node.type === "instruction") {
      const dest = String(node.next || "").trim();
      if (!dest || ids.has(dest)) continue;
      const safe = placeholderFor(dest);
      if (safe) node.next = safe;
    }
  }
  if (!warnings.length) return { tree, warnings: [] };
  return {
    tree: {
      ...tree,
      nodes,
      requires_manual_review: true,
      review_notes: warnings,
    },
    warnings,
  };
}
