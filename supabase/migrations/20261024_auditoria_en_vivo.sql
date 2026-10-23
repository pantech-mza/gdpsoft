-- v3.13.99 — Auditoría en vivo: corridas, trabajadores (agentes) y latido del script local.
create table if not exists public.audit_runs (
  id bigint generated always as identity primary key,
  model text not null check (length(model) between 2 and 80),
  since timestamptz not null,
  workers int not null default 4 check (workers between 1 and 8),
  status text not null default 'QUEUED' check (status in ('QUEUED','PREPARING','RUNNING','PAUSED','STOPPED','DONE','ERROR')),
  control text not null default 'RUN' check (control in ('RUN','PAUSE','STOP')),
  total int not null default 0,
  done int not null default 0,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  cost_usd_est numeric null,
  message text null,
  created_by uuid null references public.profiles(id),
  created_at timestamptz not null default now(),
  started_at timestamptz null,
  finished_at timestamptz null
);
create table if not exists public.audit_run_workers (
  run_id bigint not null references public.audit_runs(id) on delete cascade,
  worker_no int not null,
  status text not null default 'WAITING',
  current_social_work text null,
  current_question text null,
  done int not null default 0,
  total int not null default 0,
  note text null,
  updated_at timestamptz not null default now(),
  primary key (run_id, worker_no)
);
create table if not exists public.audit_runner (
  id int primary key default 1 check (id = 1),
  heartbeat_at timestamptz not null default now(),
  host text null
);
alter table public.audit_proposals add column if not exists run_id bigint null references public.audit_runs(id) on delete set null;
create index if not exists idx_audit_proposals_run on public.audit_proposals(run_id, id desc);
alter table public.audit_runs enable row level security;
alter table public.audit_run_workers enable row level security;
alter table public.audit_runner enable row level security;
revoke all on public.audit_runs from anon, authenticated;
revoke all on public.audit_run_workers from anon, authenticated;
revoke all on public.audit_runner from anon, authenticated;
