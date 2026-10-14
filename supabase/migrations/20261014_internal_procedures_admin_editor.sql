BEGIN;
ALTER TABLE public.internal_procedures DROP CONSTRAINT IF EXISTS internal_procedures_status_check;
ALTER TABLE public.internal_procedures ADD CONSTRAINT internal_procedures_status_check
  CHECK (status IN ('DRAFT','APPROVED','REJECTED','ARCHIVED'));
ALTER TABLE public.internal_procedures ADD COLUMN IF NOT EXISTS source_storage_path text;
ALTER TABLE public.internal_procedures ADD COLUMN IF NOT EXISTS source_type text;
ALTER TABLE public.internal_procedures ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.internal_procedures ADD COLUMN IF NOT EXISTS rejected_by uuid;
ALTER TABLE public.internal_procedures ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('gdp-internal-procedures','gdp-internal-procedures',false,4194304,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel','application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET public = false;
COMMIT;
