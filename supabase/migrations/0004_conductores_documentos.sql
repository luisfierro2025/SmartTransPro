-- ============================================================================
-- Documentos del conductor
--
-- La ficha de "Guardar Conductor" ahora guarda el número de licencia y las
-- fotos de los documentos (licencia frontal/trasera y carnet de federación).
-- En SQLite estas columnas las agrega src/main/database.js al abrir la base;
-- en la nube faltaba el equivalente, y por eso el guardado fallaba con:
--   [42703] column "numero_licencia" of relation "conductores" does not exist
--
-- Las imágenes se guardan como data URL (texto "data:image/jpeg;base64,..."),
-- igual que en la versión de escritorio. El navegador las redimensiona antes
-- de enviarlas para que la petición no supere el límite del cuerpo.
--
-- Idempotente: se puede volver a ejecutar sin romper nada.
-- ============================================================================
alter table conductores add column if not exists numero_licencia   text;
alter table conductores add column if not exists licencia_frontal  text;
alter table conductores add column if not exists licencia_trasera  text;
alter table conductores add column if not exists carnet_federacion text;

create index if not exists idx_conductores_licencia on conductores(numero_licencia);
