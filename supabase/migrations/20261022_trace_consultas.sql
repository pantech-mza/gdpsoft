-- GDPSoft v3.13.97 — rastro de pasos de cada respuesta del bot (Validación: «¿Cómo llegó a esta respuesta?»).
alter table public.assistant_query_log add column if not exists trace jsonb null;
