-- GDPSoft v3.13.35 — «Cómo facturar»: el bucket se creó con límite de 50 MB
-- (52428800) pero la app y la pantalla anuncian 100 MB. Se iguala el bucket a 100 MB.
--
-- IMPORTANTE: Supabase también tiene un límite GLOBAL por archivo en
-- Dashboard → Storage → Settings → «Upload file size limit».
-- En el plan Free ese límite máximo es 50 MB y no se puede superar; en Pro se puede
-- subir hasta 500 GB. Si el plan es Free, el bucket no puede exceder ese tope.
update storage.buckets
   set file_size_limit = 104857600
 where id = 'gdp-billing-files';

-- Verificación:
-- select id, file_size_limit from storage.buckets where id = 'gdp-billing-files';
-- Reversión: update storage.buckets set file_size_limit = 52428800 where id = 'gdp-billing-files';
