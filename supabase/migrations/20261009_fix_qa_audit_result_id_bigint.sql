-- GDPSoft QA Auditor v1.1: corrige la discrepancia entre qa_result_id UUID e id BIGINT.
-- No toca assistant_qa_results ni las corridas históricas.
BEGIN;

DO $$
DECLARE
  current_type text;
  has_values boolean;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
    INTO current_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.assistant_qa_audits'::regclass
    AND a.attname = 'qa_result_id'
    AND NOT a.attisdropped;

  IF current_type IS NULL THEN
    RAISE EXCEPTION 'No existe public.assistant_qa_audits.qa_result_id';
  END IF;

  IF current_type = 'uuid' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.assistant_qa_audits WHERE qa_result_id IS NOT NULL
    ) INTO has_values;
    IF has_values THEN
      RAISE EXCEPTION 'qa_result_id contiene UUID existentes. Detenido para preservar datos; revisar antes de convertir.';
    END IF;
    ALTER TABLE public.assistant_qa_audits
      ALTER COLUMN qa_result_id TYPE bigint
      USING qa_result_id::text::bigint;
  ELSIF current_type <> 'bigint' THEN
    RAISE EXCEPTION 'Tipo inesperado de qa_result_id: %. No se modificó.', current_type;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.assistant_qa_audits'::regclass
      AND conname = 'assistant_qa_audits_qa_result_id_fkey'
  ) THEN
    ALTER TABLE public.assistant_qa_audits
      ADD CONSTRAINT assistant_qa_audits_qa_result_id_fkey
      FOREIGN KEY (qa_result_id)
      REFERENCES public.assistant_qa_results(id)
      ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;

-- Verificación (ejecutar después):
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('assistant_qa_results', 'assistant_qa_audits')
  AND column_name IN ('id', 'run_id', 'qa_result_id')
ORDER BY table_name, column_name;
