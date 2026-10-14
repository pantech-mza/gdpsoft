-- Único campo adicional necesario para el formulario de Contactos.
-- Conserva los registros y restricciones existentes.
ALTER TABLE public.social_work_contacts
  ADD COLUMN IF NOT EXISTS email text;
NOTIFY pgrst, 'reload schema';
