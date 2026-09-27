-- ============================================================================
-- Control Empresa - Esquema inicial para Supabase (PostgreSQL)
--
-- Aplicación:  Control Empresa (Transportes Fierro)
-- Ejecutar en: Supabase > SQL Editor > New query > Run
--
-- Este script es idempotente: se puede volver a ejecutar sin romper nada.
-- No crea el esquema "auth": Supabase Auth ya lo proporciona.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Perfiles de usuario (se vinculan con auth.users de Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nombre     text not null,
  rol        text not null default 'OPERADOR' check (rol in ('ADMIN','OPERADOR','CONSULTA')),
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Catálogo de clientes
-- ---------------------------------------------------------------------------
create table if not exists clientes (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  identificacion text,
  telefono       text,
  email          text,
  direccion      text,
  contacto       text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Recursos humanos
-- ---------------------------------------------------------------------------
create table if not exists empleados (
  id            bigint generated always as identity primary key,
  codigo        text unique,
  nombre        text not null,
  cedula        text,
  cargo         text,
  salario_base  numeric(12,2) not null default 0,
  fecha_ingreso date,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists planillas (
  id                 bigint generated always as identity primary key,
  periodo            text not null,
  fecha_pago         date,
  observacion        text,
  estado             text not null default 'BORRADOR',
  total_bruto        numeric(12,2) not null default 0,
  total_deducciones  numeric(12,2) not null default 0,
  total_neto         numeric(12,2) not null default 0,
  created_at         timestamptz not null default now()
);

create table if not exists planilla_detalle (
  id             bigint generated always as identity primary key,
  planilla_id    bigint not null references planillas(id) on delete cascade,
  empleado_id    bigint not null references empleados(id),
  salario        numeric(12,2) not null default 0,
  horas_extra    numeric(12,2) not null default 0,
  bonificaciones numeric(12,2) not null default 0,
  deducciones    numeric(12,2) not null default 0,
  neto           numeric(12,2) not null default 0
);

create table if not exists viaticos (
  id         bigint generated always as identity primary key,
  empleado_id bigint references empleados(id),
  fecha      date not null,
  destino    text,
  motivo     text,
  monto      numeric(12,2) not null default 0,
  liquidado  boolean not null default false,
  estado     text not null default 'PENDIENTE',
  observacion text,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Finanzas
-- ---------------------------------------------------------------------------
create table if not exists ingresos (
  id          bigint generated always as identity primary key,
  fecha       date not null,
  concepto    text not null,
  categoria   text,
  cliente_id  bigint references clientes(id),
  monto       numeric(12,2) not null default 0,
  metodo      text,
  referencia  text,
  observacion text,
  created_at  timestamptz not null default now()
);

create table if not exists egresos (
  id          bigint generated always as identity primary key,
  fecha       date not null,
  concepto    text not null,
  categoria   text,
  beneficiario text,
  monto       numeric(12,2) not null default 0,
  metodo      text,
  referencia  text,
  observacion text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Flota
-- ---------------------------------------------------------------------------
create table if not exists vehiculos (
  id         bigint generated always as identity primary key,
  codigo     text unique,
  placa      text,
  marca      text,
  modelo     text,
  anio       integer,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists conductores (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  documento  text,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists combustible (
  id              bigint generated always as identity primary key,
  fecha           date not null,
  vehiculo_id     bigint not null references vehiculos(id),
  conductor_id    bigint references conductores(id),
  kilometraje     numeric(12,1) not null default 0,
  cantidad        numeric(12,2) not null default 0,
  precio_unitario numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  tipo_combustible text,
  estacion        text,
  factura         text,
  observacion     text,
  created_at      timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- Operación: bitácora de viajes
--
-- km_recorridos es una columna GENERATED (STORED): Postgres no admite VIRTUAL.
-- actualizado_en / actualizado_por resuelven el control de concurrencia: si dos
-- usuarios editan el mismo viaje, el segundo guardado avisa que hubo cambios.
-- ---------------------------------------------------------------------------
create table if not exists bitacora_viajes (
  id                bigint generated always as identity primary key,
  fecha             date not null,
  vehiculo_id       bigint references vehiculos(id),
  conductor_id      bigint references conductores(id),
  cliente_id        bigint references clientes(id),
  modulo            text,
  hora_salida       time,
  lugar_salida      text,
  hora_llegada      time,
  destino           text not null,
  hora_salida_destino time,
  hora_retorno      time,
  km_salida         numeric(12,1) not null default 0,
  km_llegada        numeric(12,1) not null default 0,
  km_recorridos     numeric(12,1) generated always as (
                      case when km_llegada >= km_salida then km_llegada - km_salida else 0 end
                    ) stored,
  viatico           numeric(12,2) not null default 0,
  estadia           numeric(12,2) not null default 0,
  esteli            numeric(12,2) not null default 0,
  origen            text,
  carga_descripcion text,
  cliente           text,
  estado            text not null default 'EN CURSO',
  observaciones     text,
  registrado_por    uuid references auth.users(id),
  actualizado_por   uuid references auth.users(id),
  actualizado_en    timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Auditoría y configuración
-- ---------------------------------------------------------------------------
create table if not exists movimientos_auditoria (
  id            bigint generated always as identity primary key,
  modulo        text not null,
  accion        text not null,
  referencia_id bigint,
  descripcion   text,
  usuario_id    uuid references auth.users(id),
  ip            text,
  fecha         timestamptz not null default now()
);

create table if not exists configuracion (
  id             integer primary key check (id = 1),
  nombre_empresa text not null default 'Transporte Fierro',
  moneda         text not null default 'NIO',
  simbolo        text not null default 'C$',
  logo_empresa   text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

insert into configuracion (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Índices (mismos criterios que la versión de escritorio)
-- ---------------------------------------------------------------------------
create index if not exists idx_empleados_nombre         on empleados(nombre);
create index if not exists idx_planillas_periodo         on planillas(periodo);
create index if not exists idx_planilla_detalle_planilla on planilla_detalle(planilla_id);
create index if not exists idx_planilla_detalle_empleado on planilla_detalle(empleado_id);
create index if not exists idx_viaticos_fecha            on viaticos(fecha);
create index if not exists idx_viaticos_empleado         on viaticos(empleado_id);
create index if not exists idx_ingresos_fecha            on ingresos(fecha);
create index if not exists idx_ingresos_cliente          on ingresos(cliente_id);
create index if not exists idx_egresos_fecha             on egresos(fecha);
create index if not exists idx_combustible_fecha         on combustible(fecha);
create index if not exists idx_bitacora_fecha            on bitacora_viajes(fecha);
create index if not exists idx_bitacora_estado           on bitacora_viajes(estado);
create index if not exists idx_auditoria_fecha           on movimientos_auditoria(fecha);
