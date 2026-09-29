-- ============================================================================
-- Monitoreo por GPS de los teléfonos de los conductores.
--
--   dispositivos_gps : un teléfono por conductor. Guarda solo el HASH de la
--                      clave del enlace y la última posición conocida.
--   posiciones_gps   : historial de recorridos (se depura solo a los 14 días).
--
-- Idempotente: se puede volver a ejecutar sin romper nada.
-- ============================================================================
create table if not exists dispositivos_gps (
  id             bigint generated always as identity primary key,
  conductor_id   bigint not null unique references conductores(id) on delete cascade,
  vehiculo_id    bigint references vehiculos(id) on delete set null,
  token_hash     text not null unique,
  activo         boolean not null default true,
  lat            numeric(10,6),
  lng            numeric(10,6),
  precision_m    numeric(10,2),
  velocidad_kmh  numeric(8,2),
  rumbo          numeric(6,2),
  bateria        numeric(5,1),
  ultimo_reporte timestamptz,
  created_at     timestamptz not null default now()
);

create table if not exists posiciones_gps (
  id             bigint generated always as identity primary key,
  dispositivo_id bigint not null references dispositivos_gps(id) on delete cascade,
  lat            numeric(10,6) not null,
  lng            numeric(10,6) not null,
  precision_m    numeric(10,2),
  velocidad_kmh  numeric(8,2),
  registrado_en  timestamptz not null
);

create index if not exists idx_posiciones_disp_fecha on posiciones_gps(dispositivo_id, registrado_en);
