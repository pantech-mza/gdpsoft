-- GDPSoft v3.13.59 — las FAQ por significado se agrupan por circuito de la sucursal
-- (Cámara / Colegio) para no mezclar requisitos entre circuitos.
ALTER TABLE public.faq_clusters ADD COLUMN IF NOT EXISTS branch_group text NULL;
CREATE INDEX IF NOT EXISTS faq_clusters_group_idx ON public.faq_clusters(social_work_id, branch_group);
