-- Permitir adjuntar PDFs a las recetas del asistente sin alterar la política privada del bucket.
-- No crea un bucket público. Conserva los tipos admitidos existentes.
UPDATE storage.buckets
SET allowed_mime_types = CASE
    WHEN allowed_mime_types IS NULL THEN NULL
    WHEN 'application/pdf' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'application/pdf')
  END
WHERE id = 'assistant-images';
-- Si no existe el bucket 'assistant-images', revisar la configuración original antes de usar el adjunto.
