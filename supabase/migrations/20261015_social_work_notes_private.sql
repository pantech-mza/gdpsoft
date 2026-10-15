-- Observaciones operativas y datos de acceso por obra social.
-- Unas y otros están separados de social_works.observations y de las fuentes de la IA.
CREATE TABLE IF NOT EXISTS public.social_work_notes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  social_work_id bigint NOT NULL REFERENCES public.social_works(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('GENERAL','ACCESS')),
  body text NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 10000),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','LEGACY')),
  review_status text NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('PENDING','APPROVED')),
  legacy_id bigint,
  source_modified_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS social_work_notes_sw_idx ON public.social_work_notes(social_work_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS social_work_notes_legacy_idx
  ON public.social_work_notes(social_work_id, legacy_id) WHERE legacy_id IS NOT NULL;
ALTER TABLE public.social_work_notes ENABLE ROW LEVEL SECURITY;
-- El cliente JS no consulta la tabla directamente: pasa por API autenticada,
-- que valida el perfil en Supabase y usa service-role sólo del lado servidor.
REVOKE ALL ON public.social_work_notes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.social_work_notes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.social_work_notes_id_seq TO service_role;
