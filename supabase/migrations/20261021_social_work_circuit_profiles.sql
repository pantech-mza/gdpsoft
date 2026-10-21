-- GDPSoft v3.13.76 · Ficha por circuito (Cámara / Colegio).
-- La fila de social_works es la base. Esta tabla guarda SOLO lo que difiere en cada circuito;
-- un campo NULL hereda el valor base. Seguro de correr varias veces.
create table if not exists public.social_work_circuit_profiles (
  id bigserial primary key,
  social_work_id bigint not null references public.social_works(id) on delete cascade,
  circuit_group text not null check (circuit_group in ('CAMARA','COLEGIO')),
  recipe_type text,
  recipe_validity_days integer,
  letterhead text,
  rp text,
  diagnosis text,
  monodrug text,
  commercial_name text,
  substitution text,
  validator_name text,
  validator_type text,
  observations text,
  legacy_name text,
  updated_at timestamptz not null default now(),
  unique (social_work_id, circuit_group)
);
alter table public.social_work_circuit_profiles enable row level security;
