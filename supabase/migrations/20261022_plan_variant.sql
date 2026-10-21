-- v3.13.78 — variantes de plan dentro de una misma obra social (OSEP vs OSEP OYTE).
alter table public.normative_social_works add column if not exists plan_variant text;
create index if not exists normative_social_works_variant_idx on public.normative_social_works (social_work_id, plan_variant);

-- Las 4 normativas hoy vinculadas a OSEP son todas de OYTE (dispensa x2, Preguntas frecuentes, Vademécum O y TE).
update public.normative_social_works nsw
   set plan_variant = 'OYTE'
 where nsw.plan_variant is null
   and nsw.social_work_id = (select id from public.social_works where upper(name) = 'OSEP' limit 1);
