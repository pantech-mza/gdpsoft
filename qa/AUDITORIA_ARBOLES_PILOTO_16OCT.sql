-- GDPSoft · Auditoría no destructiva de Árboles de Decisión
-- Ejecutar en Supabase SQL Editor. Solo SELECT; no modifica registros.

-- A) Estado global de aprobación/publicación
SELECT 'candidatos' AS origen, status AS estado, count(*) AS cantidad
FROM public.decision_tree_candidates
GROUP BY status
UNION ALL
SELECT 'arboles', status, count(*)
FROM public.decision_trees
GROUP BY status
ORDER BY origen, estado;

-- B) Árboles de AMFFA, separados por Colegio/Cámara
SELECT t.id, sw.name AS obra_social, t.title, t.normative_id,
       n.original_filename AS archivo,
       bc.name AS circuito, t.status, t.active, t.published,
       t.approved_at, t.published_at,
       CASE WHEN t.tree_json->>'requires_manual_review' = 'true'
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(t.tree_json->'nodes','[]'::jsonb)) AS node
            WHERE node->>'text' ILIKE 'PENDIENTE DE REVISIÓN:%'
          ) THEN 'REQUIERE REVISIÓN' ELSE 'SIN BLOQUEOS EXPLÍCITOS' END AS estado_grafo
FROM public.decision_trees t
JOIN public.social_works sw ON sw.id = t.social_work_id
LEFT JOIN public.normatives n ON n.id = t.normative_id
LEFT JOIN public.normative_social_works nsw
  ON nsw.normative_id = t.normative_id AND nsw.social_work_id = t.social_work_id
LEFT JOIN public.billing_channels bc ON bc.id = nsw.billing_channel_id
WHERE t.normative_id IN (153,154)
ORDER BY t.normative_id,t.id;

-- C) Candidatos de AMFFA a revisar antes de aprobar
SELECT c.id, c.normative_id, n.original_filename, bc.name AS circuito,
       c.title, c.status,
       c.generated_json->>'requires_manual_review' AS revision_obligatoria,
       c.generated_json->'review_notes' AS observaciones
FROM public.decision_tree_candidates c
LEFT JOIN public.normatives n ON n.id = c.normative_id
LEFT JOIN public.normative_social_works nsw
  ON nsw.normative_id = c.normative_id AND nsw.social_work_id = c.social_work_id
LEFT JOIN public.billing_channels bc ON bc.id = nsw.billing_channel_id
WHERE c.normative_id IN (153,154)
ORDER BY c.normative_id,c.id;

-- D) Obras sociales con múltiples circuitos y árboles publicados sin normativa.
-- Revisar antes del piloto: un árbol general podría aparecer sin contexto de Cámara/Colegio.
WITH multiple AS (
 SELECT nsw.social_work_id,
        count(DISTINCT nsw.billing_channel_id) AS canales
 FROM public.normative_social_works nsw
 JOIN public.normatives n ON n.id = nsw.normative_id AND n.is_current = true
 WHERE nsw.billing_channel_id IS NOT NULL
 GROUP BY nsw.social_work_id
 HAVING count(DISTINCT nsw.billing_channel_id) > 1
)
SELECT sw.name, t.id AS arbol_id, t.title, t.status, t.published,
       t.normative_id, m.canales
FROM public.decision_trees t
JOIN multiple m ON m.social_work_id = t.social_work_id
JOIN public.social_works sw ON sw.id = t.social_work_id
WHERE t.normative_id IS NULL AND t.published = true AND t.active = true
ORDER BY sw.name,t.id;

-- E) Conteo de propuestas pendientes de revisión manual (todos los candidatos)
SELECT c.social_work_id, sw.name AS obra_social,
       count(*) AS candidatos_revisar,
       count(*) FILTER (WHERE c.generated_json->>'requires_manual_review' = 'true'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(c.generated_json->'nodes','[]'::jsonb)) AS node
           WHERE node->>'text' ILIKE 'PENDIENTE DE REVISIÓN:%'
         )) AS con_pasos_pendientes
FROM public.decision_tree_candidates c
JOIN public.social_works sw ON sw.id = c.social_work_id
WHERE c.status = 'SUGGESTED'
GROUP BY c.social_work_id,sw.name
ORDER BY con_pasos_pendientes DESC, candidatos_revisar DESC,sw.name;
