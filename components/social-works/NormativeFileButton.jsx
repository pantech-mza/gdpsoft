"use client";

import { treeApiFetch } from "../../lib/decision-trees/client";

// Abre el archivo original de una normativa en una pestaña nueva.
export default function NormativeFileButton({ id, label = "Ver documento", className = "" }) {
  const open = async () => {
    const tab = window.open("", "_blank");
    try {
      const response = await treeApiFetch(`/api/normatives/${id}/file`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.url) throw new Error(payload.error || "No se pudo abrir el archivo");
      if (tab) {
        tab.opener = null;
        tab.location.href = payload.url;
      } else {
        window.location.href = payload.url;
      }
    } catch (error) {
      if (tab) tab.close();
      window.alert(error?.message || "No se pudo abrir el archivo");
    }
  };
  return (
    <button type="button" onClick={open} className={className}>
      {label}
    </button>
  );
}
