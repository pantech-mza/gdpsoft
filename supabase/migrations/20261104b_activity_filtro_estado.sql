-- v3.13.155: filtro por estado (fallas / aclaraciones / respondidas) en el listado de Actividad.
BEGIN;
CREATE OR REPLACE FUNCTION public.gdp_assistant_activity_page_v5(
  p_days int DEFAULT 0,p_branch_ids bigint[] DEFAULT NULL,p_social_work_ids bigint[] DEFAULT NULL,
  p_device_ids bigint[] DEFAULT NULL,p_question text DEFAULT NULL,p_day date DEFAULT NULL,p_page int DEFAULT 1,p_page_size int DEFAULT 12,
  p_exclude_internal boolean DEFAULT false,
  p_state text DEFAULT NULL
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
 AND (p_state IS NULL OR p_state='' OR (p_state='respondidas' AND l.found IS NOT FALSE)
   OR (p_state='fallas' AND l.found IS FALSE AND NOT ((coalesce(l.route,'') IN ('CLARIFICATION_NEEDED','AMBIGUOUS_SOCIAL_WORK','STRUCTURED_CLARIFICATION','UNKNOWN_EXPLICIT_SOCIAL_WORK','INACTIVE_SOCIAL_WORK') OR l.route='STRUCTURED_SOCIAL_WORK_STATUS' OR coalesce(l.answer,'') ~* '^\s*(Necesito que aclares|No encontré una obra social|No pude identificar|Indicame (de qué|el nombre|la obra)|Hay más de una obra social|¿Qué necesit)') OR l.route='STRUCTURED_SOCIAL_WORK_STATUS' OR coalesce(l.answer,'') ~* '^\s*(Necesito que aclares|No encontré una obra social|No pude identificar|Indicame (de qué|el nombre|la obra)|Hay más de una obra social|¿Qué necesit)'))
   OR (p_state='aclaraciones' AND l.found IS FALSE AND (coalesce(l.route,'') IN ('CLARIFICATION_NEEDED','AMBIGUOUS_SOCIAL_WORK','STRUCTURED_CLARIFICATION','UNKNOWN_EXPLICIT_SOCIAL_WORK','INACTIVE_SOCIAL_WORK') OR l.route='STRUCTURED_SOCIAL_WORK_STATUS' OR coalesce(l.answer,'') ~* '^\s*(Necesito que aclares|No encontré una obra social|No pude identificar|Indicame (de qué|el nombre|la obra)|Hay más de una obra social|¿Qué necesit)')))
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

REVOKE ALL ON FUNCTION public.gdp_assistant_activity_page_v5(int,bigint[],bigint[],bigint[],text,date,int,int,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gdp_assistant_activity_page_v5(int,bigint[],bigint[],bigint[],text,date,int,int,boolean,text) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
