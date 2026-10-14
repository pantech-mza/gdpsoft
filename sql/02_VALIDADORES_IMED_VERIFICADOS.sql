-- Precarga controlada e idempotente del validador IMED a partir de legacy staging
-- entregado por usuario 13/10/2026. NO asignar indiscriminadamente circuitos parciales.
-- Ejecutar previsualización antes de COMMIT: tabla adicional final permite verificar.
-- Exclusiones: ECI (URL ecimed, NO IMED); SWISS MEDICAL ART (IMED Cámara / COFA Colegio),
-- OSEP (solo "Alto Costo"), OSSEG (solo "San Francisco"), OSSACRA (solo "Cámara") hasta mapear alcance.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.validators WHERE upper(trim(name))='IMED' OR lower(slug)='imed') THEN
   RAISE EXCEPTION 'No existe validador IMED en public.validators';
 END IF;
END $$;
WITH desired(social_work_id,validator_type,observation) AS (
 VALUES
 (10::bigint,NULL::text,'LUIS PASTEUR - ID_SOFT 233'),
 (84,'TYS','MEDICUS - ID_SOFT 124'),
 (25,'TYS','MEDIFE - ID_SOFT 17 y 128'),
 (24,'TYS','OMINT - ID_SOFT 16 y 174; verificar subplan de vacunas'),
 (73,'POR FUERA','OPDEA - ID_SOFT 111'),
 (74,'POR FUERA','OSPERYHRA - ID_SOFT 112'),
 (61,'TYS','PAMI norma de atención - ID_SOFT 93; revisar otros circuitos'),
 (26,NULL,'PODER JUDICIAL - ID_SOFT 18'),
 (23,'TYS','SWISS MEDICAL - ID_SOFT 15')
), imed AS (
 SELECT id FROM public.validators WHERE upper(trim(name))='IMED' OR lower(slug)='imed' ORDER BY (upper(trim(name))='IMED') DESC LIMIT 1
)
INSERT INTO public.social_work_validators(social_work_id,validator_id,validator_type,scope,notes,is_primary)
SELECT d.social_work_id, i.id, d.validator_type, NULL,
       'Preclasificación importada GDPSoft 13/10/2026. '||d.observation,
       false
FROM desired d CROSS JOIN imed i
JOIN public.social_works sw ON sw.id=d.social_work_id AND sw.active=true
WHERE NOT EXISTS(
 SELECT 1 FROM public.social_work_validators x JOIN public.validators v ON x.validator_id=v.id
 WHERE x.social_work_id=d.social_work_id AND (upper(trim(v.name))='IMED' OR lower(v.slug)='imed')
);
-- Revisar las nueve posibles inserciones y la existente de Galeno.
SELECT sw.id,sw.name,swv.validator_type,swv.scope,swv.billing_channel_id,swv.notes
FROM public.social_work_validators swv
JOIN public.social_works sw ON sw.id=swv.social_work_id
JOIN public.validators v ON v.id=swv.validator_id
WHERE upper(trim(v.name))='IMED' OR lower(v.slug)='imed'
ORDER BY sw.name;
COMMIT;
