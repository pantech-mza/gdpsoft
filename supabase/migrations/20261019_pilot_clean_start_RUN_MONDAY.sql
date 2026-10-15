-- GDPSoft: inicio oficial del piloto el lunes 19 de octubre de 2026 (Argentina).
-- EJECUTAR MANUALMENTE justo antes del comienzo, DESPUES de exportar / respaldar QA.
-- No borra preguntas, tablas, usuarios, sucursales, dispositivos, gastos API ni normativas.
-- Dashboard y tabla de Actividad del bot: todo arranca en 0 desde el inicio del piloto.
-- IMPORTANTE: la próxima consulta debe tener traffic_type='PILOT'.
BEGIN;
UPDATE public.gdp_activity_pilot_scope
SET started_at = TIMESTAMPTZ '2026-10-19 00:00:00-03',
    seed_query_ids = '{}'::bigint[]
WHERE id=1;
-- Comprobar explícitamente la fila:
DO $$BEGIN IF (SELECT count(*) FROM public.gdp_activity_pilot_scope WHERE id=1) <> 1
 THEN RAISE EXCEPTION 'No se encontró la configuración del piloto'; END IF; END $$;
COMMIT;
SELECT started_at,cardinality(seed_query_ids) AS seed_queries
FROM public.gdp_activity_pilot_scope WHERE id=1;
