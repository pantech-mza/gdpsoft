-- GDPSoft · Recordá/Ficha: completar las columnas omitidas del origen PlataSoft.
-- NO importa datos del JSON. Primero aplicar, luego AUDITAR con el script de sincronización.
-- No reemplaza las tablas de validadores ni las reglas operativas por sucursal.
ALTER TABLE public.social_works
  ADD COLUMN IF NOT EXISTS validator_name text,
  ADD COLUMN IF NOT EXISTS validator_type text;

COMMENT ON COLUMN public.social_works.validator_name IS 'Nombre de validador según Ficha (ej. GMS). No equivale al circuito por sucursal.';
COMMENT ON COLUMN public.social_works.validator_type IS 'Medio/tipo registrado en la Ficha legacy (ej. TYS, POR FUERA). No reemplaza excepciones operativas.';

-- Comprobación opcional posterior (SOLO SELECT):
-- SELECT id, id_soft, name, validator_name, validator_type FROM public.social_works WHERE id_soft IN (60, 169, 149, 142) ORDER BY id_soft;
