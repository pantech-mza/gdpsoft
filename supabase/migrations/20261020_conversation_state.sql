-- GDPSoft v3.13.20 — estado conversacional (tema pendiente y repreguntas).
-- Aditiva y reversible. No modifica filas, claves ni índices existentes.
-- El código funciona igual si esta migración todavía no se aplicó
-- (en ese caso simplemente no hay continuidad conversacional).

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS conversation_state jsonb;

COMMENT ON COLUMN public.conversations.conversation_state IS
  'Estado del asistente: tema de la consulta, última ruta/resultado y pregunta pendiente (v1).';

-- Reversión (solo si hiciera falta):
-- ALTER TABLE public.conversations DROP COLUMN IF EXISTS conversation_state;
