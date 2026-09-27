-- Vincula cada viático a un conductor (en vez de a un empleado) y,
-- opcionalmente, al viaje de Bitácora que lo originó.
alter table viaticos add column if not exists conductor_id bigint references conductores(id);
alter table viaticos add column if not exists viaje_id bigint references bitacora_viajes(id);

create index if not exists idx_viaticos_conductor on viaticos(conductor_id);
create index if not exists idx_viaticos_viaje on viaticos(viaje_id);
