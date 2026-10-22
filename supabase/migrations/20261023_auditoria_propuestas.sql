-- v3.13.98 — Módulo de auditoría (superadmin): respuestas propuestas por la auditoría, con evidencia,
-- marca de antigüedad y banco de preguntas parecidas. Nada se aplica solo: el superadmin aprueba.
create table if not exists public.audit_proposals (
  id bigint generated always as identity primary key,
  batch text not null,
  query_id bigint not null references public.assistant_query_log(id) on delete cascade,
  social_work_id bigint null,
  social_work_name text null,
  circuit text null check (circuit in ('CAMARA','COLEGIO')),
  branch_name text null,
  question text not null,
  bot_answer text null,
  route text null,
  query_created_at timestamptz null,
  verdict_ai text not null check (verdict_ai in ('CORRECT','PARTIAL','INCORRECT','NO_BASE','NA')),
  cause text null,
  proposed_answer text null,
  sources jsonb not null default '[]'::jsonb,
  admin_verdict text null,
  agrees_admin boolean null,
  note text null,
  applies_to_suggested text not null default 'BOTH' check (applies_to_suggested in ('BOTH','CAMARA','COLEGIO')),
  -- Antigüedad: VIGENTE | POSIBLEMENTE_RESUELTA (hay una corrección posterior de esa obra social) | SIN_CAMBIOS
  aging text not null default 'VIGENTE',
  aging_detail jsonb null,
  replay_verdict text null,
  replay_answer text null,
  replay_at timestamptz null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  final_answer text null,
  final_applies_to text null check (final_applies_to in ('BOTH','CAMARA','COLEGIO')),
  decided_by uuid null references public.profiles(id),
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint audit_proposals_batch_query_unique unique (batch, query_id)
);
create index if not exists idx_audit_proposals_status on public.audit_proposals(status, verdict_ai);
create index if not exists idx_audit_proposals_sw on public.audit_proposals(social_work_id);

create table if not exists public.audit_variants (
  id bigint generated always as identity primary key,
  proposal_id bigint not null references public.audit_proposals(id) on delete cascade,
  variant_question text not null,
  replay_verdict text null,
  replay_answer text null,
  replay_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint audit_variants_unique unique (proposal_id, variant_question)
);
create index if not exists idx_audit_variants_proposal on public.audit_variants(proposal_id);

alter table public.audit_proposals enable row level security;
alter table public.audit_variants enable row level security;
revoke all on public.audit_proposals from anon, authenticated;
revoke all on public.audit_variants from anon, authenticated;
-- Acceso solo desde endpoints server-side con service_role y JWT de superadmin validado.
