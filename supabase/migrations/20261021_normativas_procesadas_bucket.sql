-- v3.13.47 — bucket privado para el texto generado a partir de planillas Excel (y OCR).
-- Idempotente: si el bucket ya existe no cambia nada.
insert into storage.buckets (id, name, public)
values ('normativas-procesadas', 'normativas-procesadas', false)
on conflict (id) do nothing;
