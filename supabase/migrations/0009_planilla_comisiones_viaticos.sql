-- Vincula cada empleado con su conductor y permite liquidar movimientos desde
-- planilla sin cambiar el concepto de neto salarial.
alter table empleados
  add column if not exists conductor_id bigint references conductores(id) on delete set null;

create unique index if not exists idx_empleados_conductor_unico
  on empleados(conductor_id);

alter table planillas
  add column if not exists total_viaticos numeric(12,2) not null default 0;
alter table planillas
  add column if not exists total_a_pagar numeric(12,2) not null default 0;
update planillas
set total_a_pagar = total_neto + total_viaticos
where total_a_pagar = 0;

alter table planilla_detalle
  add column if not exists comisiones numeric(12,2) not null default 0;
alter table planilla_detalle
  add column if not exists viaticos numeric(12,2) not null default 0;

create table if not exists planilla_movimientos (
  id bigint generated always as identity primary key,
  planilla_id bigint not null references planillas(id) on delete cascade,
  empleado_id bigint not null references empleados(id),
  tipo text not null check (tipo in ('COMISION', 'VIATICO')),
  movimiento_id bigint not null,
  monto numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (tipo, movimiento_id)
);

create index if not exists idx_planilla_movimientos_planilla
  on planilla_movimientos(planilla_id);
