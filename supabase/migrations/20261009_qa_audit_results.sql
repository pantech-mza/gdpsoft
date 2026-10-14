create table if not exists public.assistant_qa_audits (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  qa_result_id uuid null,
  case_id text null,
  audit_type text not null check (audit_type in ('NORMATIVE','PERFORMANCE')),
  social_work_id bigint null,
  question text null,
  original_status text null,
  original_answer text null,
  route text null,
  source text null,
  verdict text not null,
  reason text null,
  evidence text null,
  evidence_file_id text null,
  evidence_filename text null,
  elapsed_ms integer null,
  routing_duration_ms integer null,
  db_duration_ms integer null,
  openai_duration_ms integer null,
  file_search_duration_ms integer null,
  vision_duration_ms integer null,
  model text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, qa_result_id, audit_type)
);

create index if not exists assistant_qa_audits_run_idx
  on public.assistant_qa_audits(run_id);
create index if not exists assistant_qa_audits_type_idx
  on public.assistant_qa_audits(audit_type);
create index if not exists assistant_qa_audits_verdict_idx
  on public.assistant_qa_audits(verdict);
create index if not exists assistant_qa_audits_social_work_idx
  on public.assistant_qa_audits(social_work_id);

alter table public.assistant_qa_audits enable row level security;
