-- v3.13.100 — Motor de contexto completo (modo sombra): texto de normativas para el motor, resultados en
-- sombra y campos de repetición en la auditoría. No cambia ninguna respuesta que ve la sucursal.
create table if not exists public.assistant_normative_text (
  normative_id bigint primary key references public.normatives(id) on delete cascade,
  text text not null,
  extraction text null,
  chars int not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.assistant_shadow_results (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  branch_id bigint null,
  social_work_id bigint null,
  conversation_id uuid null,
  question text not null,
  current_answer text null,
  current_route text null,
  engine_model text null,
  engine_answer text null,
  engine_status text not null default 'OK',   -- OK | UNVERIFIED | NO_BASIS | CLARIFY | ERROR
  engine_sources jsonb not null default '[]'::jsonb,
  engine_conflicts jsonb not null default '[]'::jsonb,
  latency_ms int null,
  tokens_in int null,
  tokens_out int null,
  error text null
);
create index if not exists idx_shadow_created on public.assistant_shadow_results(created_at desc);
alter table public.audit_proposals add column if not exists replay_model text null;
alter table public.audit_proposals add column if not exists replay_detail jsonb null;
alter table public.assistant_normative_text enable row level security;
alter table public.assistant_shadow_results enable row level security;
revoke all on public.assistant_normative_text from anon, authenticated;
revoke all on public.assistant_shadow_results from anon, authenticated;
