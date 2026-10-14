-- GDPSoft QA · Quality Score v1
-- 2026-10-07

alter table if exists public.assistant_qa_results
  add column if not exists quality_score numeric(5,2) null,
  add column if not exists quality_level text null,
  add column if not exists quality_breakdown jsonb not null default '{}'::jsonb;

alter table if exists public.assistant_qa_runs
  add column if not exists avg_quality numeric(5,2) null;

create index if not exists idx_assistant_qa_results_quality_score
  on public.assistant_qa_results(quality_score);

create index if not exists idx_assistant_qa_results_quality_level
  on public.assistant_qa_results(quality_level);

update public.assistant_qa_results
set
  quality_score = coalesce(score, case
    when status = 'PASS' then 100
    when status = 'WARNING' then 80
    else 0
  end),
  quality_level = case
    when coalesce(score, case when status='PASS' then 100 when status='WARNING' then 80 else 0 end) >= 85 then 'BUENA'
    when coalesce(score, case when status='PASS' then 100 when status='WARNING' then 80 else 0 end) >= 70 then 'ACEPTABLE'
    else 'CRITICA'
  end,
  quality_breakdown = case
    when quality_breakdown = '{}'::jsonb then
      jsonb_build_object('legacy_backfill', true, 'note', 'Puntaje inicial derivado del estado histórico')
    else quality_breakdown
  end
where quality_score is null;

update public.assistant_qa_runs r
set avg_quality = x.avg_quality
from (
  select run_id, round(avg(quality_score)::numeric, 2) as avg_quality
  from public.assistant_qa_results
  where quality_score is not null
  group by run_id
) x
where r.id = x.run_id;
