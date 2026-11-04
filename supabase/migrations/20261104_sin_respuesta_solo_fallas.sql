-- v3.13.151: 'Sin respuesta' cuenta solo fallas reales. Aclaraciones, OS ambigua/no reconocida/inactiva se informan aparte.
-- v3.13.108 Actividad del bot: filtros de selección múltiple (varias sucursales / dispositivos / obras sociales)
-- y opción «excluir pruebas internas» (tráfico ADMIN y dispositivos cuyo nombre empieza con Nico, Mica o Admin).
-- Funciones NUEVAS (_v4); las _v3 quedan intactas. La app usa _v4 si existe y, si no, sigue con _v3.
BEGIN;
CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_dashboard_v4(
  p_days int DEFAULT 0, p_branch_ids bigint[] DEFAULT NULL,
  p_social_work_ids bigint[] DEFAULT NULL, p_device_ids bigint[] DEFAULT NULL,
  p_question text DEFAULT NULL, p_day date DEFAULT NULL,
  p_exclude_internal boolean DEFAULT false
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH pilot AS (SELECT started_at,seed_query_ids FROM public.gdp_activity_pilot_scope WHERE id=1),
filtered AS (
  SELECT l.* FROM public.assistant_query_log l CROSS JOIN pilot p LEFT JOIN public.branch_devices dv ON dv.id=l.device_id
  WHERE (coalesce(p_days,0)=0 OR l.created_at >= now()-make_interval(days=>least(30,greatest(1,p_days))))
    AND (l.id=ANY(p.seed_query_ids) OR (l.created_at >= p.started_at AND l.traffic_type IN ('PILOT','ADMIN')))
    AND (p_branch_ids IS NULL OR cardinality(p_branch_ids)=0 OR l.branch_id=ANY(p_branch_ids))
    AND (p_social_work_ids IS NULL OR cardinality(p_social_work_ids)=0 OR l.social_work_id=ANY(p_social_work_ids))
    AND (p_device_ids IS NULL OR cardinality(p_device_ids)=0 OR l.device_id=ANY(p_device_ids))
    AND (p_question IS NULL OR LEFT(coalesce(nullif(trim(l.normalized_question),''),trim(l.question)),180)=p_question)
    AND (p_day IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=p_day)
    AND (NOT coalesce(p_exclude_internal,false) OR (l.traffic_type<>'ADMIN' AND coalesce(dv.device_name,'') !~* '(^|[^[:alpha:]])(nico|mica|admin)'))
), totals AS (
  SELECT count(*)::int total,
    count(*) FILTER(WHERE f.found IS FALSE AND coalesce(f.route,'') NOT IN ('CLARIFICATION_NEEDED','AMBIGUOUS_SOCIAL_WORK','STRUCTURED_CLARIFICATION','UNKNOWN_EXPLICIT_SOCIAL_WORK','INACTIVE_SOCIAL_WORK'))::int no_answer,
    count(*) FILTER(WHERE f.found IS FALSE AND coalesce(f.route,'') IN ('CLARIFICATION_NEEDED','AMBIGUOUS_SOCIAL_WORK','STRUCTURED_CLARIFICATION','UNKNOWN_EXPLICIT_SOCIAL_WORK','INACTIVE_SOCIAL_WORK'))::int clarifications,
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

CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_page_v4(
  p_days int DEFAULT 0,p_branch_ids bigint[] DEFAULT NULL,p_social_work_ids bigint[] DEFAULT NULL,
  p_device_ids bigint[] DEFAULT NULL,p_question text DEFAULT NULL,p_day date DEFAULT NULL,p_page int DEFAULT 1,p_page_size int DEFAULT 12,
  p_exclude_internal boolean DEFAULT false
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
WITH pilot AS (SELECT started_at,seed_query_ids FROM public.gdp_activity_pilot_scope WHERE id=1),
filtered AS (
 SELECT l.* FROM public.assistant_query_log l CROSS JOIN pilot p LEFT JOIN public.branch_devices dv ON dv.id=l.device_id
 WHERE (coalesce(p_days,0)=0 OR l.created_at >= now()-make_interval(days=>least(30,greatest(1,p_days))))
 AND (l.id=ANY(p.seed_query_ids) OR (l.created_at>=p.started_at AND l.traffic_type IN ('PILOT','ADMIN')))
 AND (p_branch_ids IS NULL OR cardinality(p_branch_ids)=0 OR l.branch_id=ANY(p_branch_ids))
 AND (p_social_work_ids IS NULL OR cardinality(p_social_work_ids)=0 OR l.social_work_id=ANY(p_social_work_ids))
 AND (p_device_ids IS NULL OR cardinality(p_device_ids)=0 OR l.device_id=ANY(p_device_ids))
 AND (p_question IS NULL OR LEFT(coalesce(nullif(trim(l.normalized_question),''),trim(l.question)),180)=p_question)
 AND (p_day IS NULL OR (l.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date=p_day)
 AND (NOT coalesce(p_exclude_internal,false) OR (l.traffic_type<>'ADMIN' AND coalesce(dv.device_name,'') !~* '(^|[^[:alpha:]])(nico|mica|admin)'))
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

REVOKE ALL ON FUNCTION public.gdp_assistant_activity_dashboard_v4(int,bigint[],bigint[],bigint[],text,date,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gdp_assistant_activity_page_v4(int,bigint[],bigint[],bigint[],text,date,int,int,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_dashboard_v4(int,bigint[],bigint[],bigint[],text,date,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_page_v4(int,bigint[],bigint[],bigint[],text,date,int,int,boolean) TO service_role;
COMMIT;

-- Reversión: DROP FUNCTION public.gdp_assistant_activity_dashboard_v4(int,bigint[],bigint[],bigint[],text,date,boolean);
--            DROP FUNCTION public.gdp_assistant_activity_page_v4(int,bigint[],bigint[],bigint[],text,date,int,int,boolean);
