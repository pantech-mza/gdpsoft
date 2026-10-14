-- GDPSoft · Dashboard de consultas del asistente (version 2.1).
-- Executar una vez en Supabase SQL Editor DESPUÉS de haber creado assistant_query_log.
-- No borra ni modifica preguntas. Agrega función de lectura y un índice.

CREATE INDEX IF NOT EXISTS idx_assistant_query_log_branch_date
ON public.assistant_query_log (branch_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_dashboard(
    p_days integer DEFAULT 7,
    p_branch_id bigint DEFAULT NULL,
    p_social_work_id bigint DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH filtered AS (
    SELECT l.id, l.created_at, l.branch_id, l.social_work_id, l.normalized_question,
           l.question, l.found, l.route, l.status, l.error_code,
           l.elapsed_ms, l.has_image, l.estimated_cost_usd
    FROM public.assistant_query_log l
    WHERE l.created_at >= now() - make_interval(days => LEAST(30, GREATEST(1, COALESCE(p_days, 7))))
      AND (l.traffic_type IS NULL OR upper(l.traffic_type) NOT IN ('QA','AUTOMATED_QA'))
      AND (p_branch_id IS NULL OR l.branch_id = p_branch_id)
      AND (p_social_work_id IS NULL OR l.social_work_id = p_social_work_id)
), totals AS (
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE f.error_code IS NOT NULL OR upper(coalesce(f.status,''))='ERROR')::int AS errors,
      count(*) FILTER (WHERE f.found IS FALSE)::int AS no_answer,
      count(*) FILTER (WHERE f.elapsed_ms > 6000)::int AS slow,
      count(*) FILTER (WHERE f.has_image IS TRUE)::int AS images,
      count(DISTINCT f.branch_id)::int AS branches_active,
      round(avg(f.elapsed_ms) FILTER (WHERE f.elapsed_ms >= 0))::int AS avg_ms,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY f.elapsed_ms) FILTER (WHERE f.elapsed_ms >= 0))::int AS p95_ms,
      round(coalesce(sum(f.estimated_cost_usd),0)::numeric,6) AS cost_usd
    FROM filtered f
)
SELECT jsonb_build_object(
  'totals', (SELECT to_jsonb(t) FROM totals t),
  'daily', coalesce((SELECT jsonb_agg(jsonb_build_object('day', d.day::text, 'count',d.n) ORDER BY d.day) FROM (
    SELECT (f.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS day,
           count(*)::int AS n
    FROM filtered f GROUP BY 1
  ) d),'[]'::jsonb),
  'hourly', coalesce((SELECT jsonb_agg(jsonb_build_object('hour',h.hour::text,'count',h.n) ORDER BY h.hour) FROM (
    SELECT date_trunc('hour',f.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AS hour,
           count(*)::int AS n
    FROM filtered f WHERE f.created_at >= now()-interval '24 hours' GROUP BY 1
  ) h),'[]'::jsonb),
  'by_branch', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.branch_id, 'name',coalesce(br.name,'Sin sucursal'), 'count',b.n) ORDER BY b.n DESC,b.branch_id) FROM (
    SELECT f.branch_id, count(*)::int n FROM filtered f GROUP BY 1 ORDER BY n DESC LIMIT 12
  ) b LEFT JOIN public.branches br ON br.id=b.branch_id),'[]'::jsonb),
  'by_social_work', coalesce((SELECT jsonb_agg(jsonb_build_object('id', o.social_work_id, 'name',coalesce(sw.name,'No identificada'), 'count',o.n) ORDER BY o.n DESC,o.social_work_id) FROM (
    SELECT f.social_work_id, count(*)::int n FROM filtered f GROUP BY 1 ORDER BY n DESC LIMIT 12
  ) o LEFT JOIN public.social_works sw ON sw.id=o.social_work_id),'[]'::jsonb),
  'by_route', coalesce((SELECT jsonb_agg(jsonb_build_object('route',r.route,'count',r.n) ORDER BY r.n DESC) FROM (
    SELECT coalesce(nullif(f.route,''),'SIN_RUTA') AS route, count(*)::int n
    FROM filtered f GROUP BY 1 ORDER BY n DESC LIMIT 8
  ) r),'[]'::jsonb),
  'frequent_questions', coalesce((SELECT jsonb_agg(jsonb_build_object('question',q.question,'count',q.n) ORDER BY q.n DESC) FROM (
    SELECT LEFT(coalesce(nullif(trim(f.normalized_question),''),trim(f.question)),180) AS question,
           count(*)::int n
    FROM filtered f WHERE NULLIF(trim(coalesce(f.normalized_question,f.question)), '') IS NOT NULL
    GROUP BY 1 ORDER BY n DESC LIMIT 10
  ) q),'[]'::jsonb)
);
$$;

REVOKE ALL ON FUNCTION public.gdp_assistant_activity_dashboard(integer,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_dashboard(integer,bigint,bigint) TO service_role;
