-- Tarifas por destino: cada ruta origen -> destino tiene un valor de comision.
create table if not exists tarifas_destino (
  id bigint generated always as identity primary key,
  origen text not null,
  destino text not null,
  valor numeric(12,2) not null default 0,
  activo integer not null default 1,
  observacion text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_tarifas_destino_ruta
  on tarifas_destino(lower(origen), lower(destino));
