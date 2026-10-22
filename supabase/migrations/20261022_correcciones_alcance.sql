-- v3.13.84 — alcance de una corrección del administrador: ambos circuitos (por defecto), solo Cámara o solo Colegio.
alter table public.branch_response_reviews
  add column if not exists applies_to text check (applies_to in ('BOTH','CAMARA','COLEGIO'));
comment on column public.branch_response_reviews.applies_to is
  'Dónde aplica la corrección sugerida. NULL = correcciones anteriores a esta versión (se comportan según el circuito de la sucursal donde se hicieron).';
