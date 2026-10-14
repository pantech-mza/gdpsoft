-- GDPSoft · Diagnostico seguro v2.2
-- Ejecutar en Supabase SQL Editor. SOLO SELECT (no cambia filas ni permisos).
-- 1) Revisar perfiles de Administracion. Comparar con la cuenta que da 403.
SELECT username, role::text AS rol, is_super_admin, active
FROM public.profiles
WHERE is_super_admin IS TRUE OR upper(role::text) LIKE '%ADMIN%'
ORDER BY is_super_admin DESC, username;

-- 2) Contar consultas de los ultimos 7 dias, separadas por tipo de trafico y fecha.
SELECT (created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia,
       coalesce(traffic_type, 'SIN_CLASIFICAR') AS tipo_trafico,
       count(*) AS consultas,
       count(*) FILTER (WHERE qa_run_id IS NOT NULL) AS asociadas_a_qa_run,
       count(*) FILTER (WHERE qa_case_id IS NOT NULL) AS asociadas_a_qa_case,
       count(*) FILTER (WHERE found IS FALSE) AS sin_respuesta,
       count(*) FILTER (WHERE elapsed_ms > 6000) AS mas_de_6_segundos
FROM public.assistant_query_log
WHERE created_at >= now() - interval '7 days'
GROUP BY 1,2 ORDER BY 1 DESC,3 DESC;

-- 3) Identificar volumen por sucursal para revisar origen de trafico.
SELECT coalesce(br.name, 'Sin sucursal') AS sucursal,
       coalesce(l.traffic_type, 'SIN_CLASIFICAR') AS tipo_trafico,
       count(*) AS consultas,
       min(l.created_at) AS primera,
       max(l.created_at) AS ultima
FROM public.assistant_query_log l
LEFT JOIN public.branches br ON br.id = l.branch_id
WHERE l.created_at >= now() - interval '7 days'
GROUP BY 1,2 ORDER BY consultas DESC LIMIT 30;
