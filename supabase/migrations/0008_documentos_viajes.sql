-- Hasta tres imágenes opcionales por registro de Bitácora.
alter table bitacora_viajes add column if not exists documento_viaje_1_nombre text;
alter table bitacora_viajes add column if not exists documento_viaje_1 text;
alter table bitacora_viajes add column if not exists documento_viaje_2_nombre text;
alter table bitacora_viajes add column if not exists documento_viaje_2 text;
alter table bitacora_viajes add column if not exists documento_viaje_3_nombre text;
alter table bitacora_viajes add column if not exists documento_viaje_3 text;
