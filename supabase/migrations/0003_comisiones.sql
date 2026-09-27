-- ============================================================================
-- Comisiones de conductores
--
-- Una comisión es un pago al conductor por su trabajo en la ruta. Se calcula
-- de tres formas (columna "tipo"):
--   PORCENTAJE -> monto = base_calculo * valor_calculo / 100
--   POR_KM     -> monto = base_calculo * valor_calculo      (km recorridos)
--   FIJO       -> monto = valor_calculo                     (monto fijo)
--
-- "periodo" (AAAA-MM) permite liquidar las comisiones de un mes junto a la
-- planilla, y "estado" (PENDIENTE / PAGADA) marca lo que ya se le pagó.
-- ============================================================================
create table if not exists comisiones (
  id            bigint generated always as identity primary key,
  conductor_id  bigint references conductores(id),
  viaje_id      bigint references bitacora_viajes(id),
  fecha         date not null,
  periodo       text,
  concepto      text,
  tipo          text not null default 'PORCENTAJE',
  base_calculo  numeric(12,2) not null default 0,
  valor_calculo numeric(12,4) not null default 0,
  monto         numeric(12,2) not null default 0,
  estado        text not null default 'PENDIENTE',
  fecha_pago    date,
  metodo        text,
  referencia    text,
  observacion   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_comisiones_fecha     on comisiones(fecha);
create index if not exists idx_comisiones_conductor on comisiones(conductor_id);
create index if not exists idx_comisiones_viaje     on comisiones(viaje_id);
create index if not exists idx_comisiones_periodo   on comisiones(periodo);
