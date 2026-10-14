-- GDPSoft v5.1
-- Permite conversaciones administrativas sin sucursal/dispositivo físico.
-- Es idempotente: si las columnas ya aceptan NULL, no cambia el comportamiento.

alter table if exists public.conversations
  alter column branch_id drop not null,
  alter column device_id drop not null;

alter table if exists public.conversation_images
  alter column branch_id drop not null,
  alter column device_id drop not null;
