-- GDPSoft: revisiones humanas de consultas operativas (separadas de la batería QA técnica).
create table if not exists public.branch_response_reviews (
 id bigint generated always as identity primary key,
 query_id bigint not null references public.assistant_query_log(id) on delete cascade,
 reviewer_profile_id uuid not null references public.profiles(id),
 verdict text not null check (verdict in ('CORRECT','INCORRECT','PARTIAL')),
 suggested_answer text,
 comment text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint branch_response_reviews_query_reviewer_unique unique(query_id,reviewer_profile_id)
);
create index if not exists idx_branch_response_reviews_reviewer on public.branch_response_reviews(reviewer_profile_id,updated_at desc);
alter table public.branch_response_reviews enable row level security;
revoke all on public.branch_response_reviews from anon, authenticated;
-- Lectura/escritura exclusivamente desde endpoints server-side con service_role y JWT validado.
