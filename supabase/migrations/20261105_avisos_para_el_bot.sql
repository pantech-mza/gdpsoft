-- v3.13.159: un aviso puede ser también información que el asistente debe usar (con prioridad).
-- social_work_id: obra social a la que aplica (NULL = todas). bot_use: el asistente lo toma como instrucción vigente.
BEGIN;
ALTER TABLE public.branch_notices ADD COLUMN IF NOT EXISTS social_work_id bigint REFERENCES public.social_works(id);
ALTER TABLE public.branch_notices ADD COLUMN IF NOT EXISTS bot_use boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS branch_notices_bot_idx ON public.branch_notices(bot_use, published) WHERE bot_use;
COMMIT;
NOTIFY pgrst, 'reload schema';
