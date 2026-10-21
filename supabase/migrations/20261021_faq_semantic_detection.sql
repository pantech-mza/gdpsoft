-- GDPSoft v3.13.57 — FAQ por significado: agrupa preguntas parecidas de todas las
-- sucursales, propone FAQ al admin al llegar al umbral y notifica.

CREATE TABLE IF NOT EXISTS public.faq_clusters (
  id bigserial PRIMARY KEY,
  social_work_id bigint NOT NULL REFERENCES public.social_works(id) ON DELETE CASCADE,
  representative_question text NOT NULL,
  embedding jsonb NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  last_asked_at timestamptz NOT NULL DEFAULT now(),
  last_answer text NULL,
  last_source_type text NULL,
  last_normative_id bigint NULL,
  faq_id bigint NULL REFERENCES public.social_work_faqs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faq_clusters_work_idx ON public.faq_clusters(social_work_id);
CREATE INDEX IF NOT EXISTS faq_clusters_faq_idx ON public.faq_clusters(faq_id) WHERE faq_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.faq_cluster_hits (
  id bigserial PRIMARY KEY,
  cluster_id bigint NOT NULL REFERENCES public.faq_clusters(id) ON DELETE CASCADE,
  branch_id bigint NULL,
  device_id bigint NULL,
  question text NOT NULL,
  query_log_id bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS faq_cluster_hits_cluster_idx ON public.faq_cluster_hits(cluster_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS faq_cluster_hits_log_uidx ON public.faq_cluster_hits(query_log_id) WHERE query_log_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id bigserial PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  body text NULL,
  link text NULL,
  social_work_id bigint NULL,
  ref_id bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz NULL
);
CREATE INDEX IF NOT EXISTS admin_notifications_unread_idx ON public.admin_notifications(created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.faq_clusters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_cluster_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
