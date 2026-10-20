-- v3.13.24 Actividad del bot incluye también las consultas hechas por el administrador
-- (traffic_type='ADMIN'), identificadas como Admin en el listado.
-- Mismas funciones que 20261015_activity_all_rankings.sql; no borra datos ni cambia el corte del piloto.
BEGIN;
CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_dashboard_v3(
  p_days int DEFAULT 0, p_branch_id bigint DEFAULT NULL,
  p_social_work_id bigint DEFAULT NULL, p_device_id bigint DEFAULT NULL,
  p_question text DEFAULT NULL, p_day date DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH pilot AS (SELECT started_at,seed_query_ids FROM public.gdp_activity_pilot_scope WHERE id=1),
filtered AS (
  SELECT l.* FROM public.assistant_query_log l CROSS JOIN pilot p
  WHERE (coalesce(p_days,0)=0 OR l.created_at >= now()-make_interval(days=>least(30,greatest(1,p_days))))
    AND (l.id=ANY(p.seed_query_ids) OR (l.created_at >= p.started_at AND l.traffic_type IN ('PILOT','ADMIN')))
    AND (p_branch_id IS NULL OR l.branch_id=p_branch_id)
    AND (p_social_work_id IS NULL OR l.social_work_id=p_social_work_id)
    AND (p_device_id IS NULL OR l.device_id=p_device_id)
    AND (p_question IS NULL OR LEFT(coalesce(nullif(trim(l.normalized_question),''),trim(l.question)),180)=p_question)
    AND (p_day IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=p_day)
), totals AS (
  SELECT count(*)::int total,
    count(*) FILTER(WHERE f.found IS FALSE)::int no_answer,
    count(DISTINCT f.branch_id)::int branches_active,
    count(DISTINCT f.device_id)::int devices_active,
    round(avg(f.elapsed_ms) FILTER (WHERE f.elapsed_ms>=0))::int avg_ms,
    count(*) FILTER(WHERE f.error_code IS NOT NULL OR upper(coalesce(f.status,''))='ERROR')::int errors,
    count(*) FILTER(WHERE f.elapsed_ms>6000)::int slow,
    round(coalesce(sum(f.estimated_cost_usd),0)::numeric,6) cost_usd
  FROM filtered f
)
SELECT jsonb_build_object(
  'totals',(SELECT to_jsonb(t) FROM totals t),
  'daily',coalesce((SELECT jsonb_agg(jsonb_build_object('name',r.day::text,'day',r.day::text,'count',r.n) ORDER BY r.day) FROM (
    SELECT
    (f.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS "day",COUNT(*)::int AS n FROM filtered f GROUP BY 1
  ) r),'[]'::jsonb),
  'by_branch',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.branch_id,'name',coalesce(b.name,'Sin sucursal'),'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT branch_id,count(*)::int n FROM filtered GROUP BY branch_id ORDER BY n DESC
  ) r LEFT JOIN public.branches b ON b.id=r.branch_id),'[]'::jsonb),
  'by_device',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.device_id,'name',coalesce(d.device_name,'Sin identificar'),'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT device_id,count(*)::int n FROM filtered GROUP BY device_id ORDER BY n DESC
  ) r LEFT JOIN public.branch_devices d ON d.id=r.device_id),'[]'::jsonb),
  'by_social_work',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.social_work_id,'name',coalesce(sw.name,'No identificada'),'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT social_work_id,count(*)::int n FROM filtered GROUP BY social_work_id ORDER BY n DESC
  ) r LEFT JOIN public.social_works sw ON sw.id=r.social_work_id),'[]'::jsonb),
  'frequent_questions',coalesce((SELECT jsonb_agg(jsonb_build_object('question',r.question,'name',r.question,'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT LEFT(coalesce(nullif(trim(normalized_question),''),trim(question)),180) question,count(*)::int n FROM filtered
    WHERE nullif(trim(coalesce(normalized_question,question)),'') IS NOT NULL
    GROUP BY 1 ORDER BY n DESC
  ) r),'[]'::jsonb),
  'by_route',coalesce((SELECT jsonb_agg(jsonb_build_object('route',r.route,'name',r.route,'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT coalesce(nullif(route,''),'SIN_RUTA') route,count(*)::int n FROM filtered GROUP BY 1 ORDER BY n DESC LIMIT 10
  ) r),'[]'::jsonb)
);
$$;

CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_page_v3(
  p_days int DEFAULT 0,p_branch_id bigint DEFAULT NULL,p_social_work_id bigint DEFAULT NULL,
  p_device_id bigint DEFAULT NULL,p_question text DEFAULT NULL,p_day date DEFAULT NULL,p_page int DEFAULT 1,p_page_size int DEFAULT 12
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH pilot AS (SELECT started_at,seed_query_ids FROM public.gdp_activity_pilot_scope WHERE id=1),
filtered AS (
 SELECT l.* FROM public.assistant_query_log l CROSS JOIN pilot p
 WHERE (coalesce(p_days,0)=0 OR l.created_at >= now()-make_interval(days=>least(30,greatest(1,p_days))))
 AND (l.id=ANY(p.seed_query_ids) OR (l.created_at>=p.started_at AND l.traffic_type IN ('PILOT','ADMIN')))
 AND (p_branch_id IS NULL OR l.branch_id=p_branch_id)
 AND (p_social_work_id IS NULL OR l.social_work_id=p_social_work_id)
 AND (p_device_id IS NULL OR l.device_id=p_device_id)
 AND (p_question IS NULL OR LEFT(coalesce(nullif(trim(l.normalized_question),''),trim(l.question)),180)=p_question)
 AND (p_day IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=p_day)
), page_rows AS (
 SELECT f.id,f.created_at,f.branch_id,f.social_work_id,f.device_id,f.question,f.answer,f.route,f.status,
 f.error_code,f.elapsed_ms,f.found,f.traffic_type,
 coalesce(b.name,CASE WHEN f.traffic_type='ADMIN' THEN 'Administración' ELSE '—' END) branch_name,
 coalesce(sw.name,'—') social_work_name,coalesce(d.device_name,'Sin identificar') device_name
 FROM filtered f LEFT JOIN public.branches b ON f.branch_id=b.id
 LEFT JOIN public.social_works sw ON f.social_work_id=sw.id
 LEFT JOIN public.branch_devices d ON f.device_id=d.id
 ORDER BY f.created_at DESC,f.id DESC
 LIMIT least(30,greatest(1,p_page_size))
 OFFSET (greatest(1,p_page)-1)*least(30,greatest(1,p_page_size))
)
SELECT jsonb_build_object('total',(SELECT count(*)::int FROM filtered),
 'rows',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC) FROM page_rows r),'[]'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.gdp_assistant_activity_dashboard_v3(int,bigint,bigint,bigint,text,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gdp_assistant_activity_page_v3(int,bigint,bigint,bigint,text,date,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_dashboard_v3(int,bigint,bigint,bigint,text,date) TO service_role;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_page_v3(int,bigint,bigint,bigint,text,date,int,int) TO service_role;
COMMIT;

-- Reversión: volver a aplicar 20261015_activity_all_rankings.sql
