-- ============================================================================
-- Usuarios del sistema, roles y sesiones abiertas
--
-- Antes de este cambio la aplicación no tenía cuentas de usuario: cualquiera
-- que abriera el programa entraba con todos los permisos.
--
-- NO se crea ninguna cuenta aquí a propósito. El sistema no trae credenciales
-- de fábrica: la primera vez se muestra el formulario de "Configuración
-- inicial" y es el usuario quien elige su usuario y su contraseña. El canal
-- usuarios:instalar solo funciona si la tabla queda vacía, así que no sirve
-- para crear cuentas sin autenticarse.
--
-- Diseño:
--   - La contraseña NUNCA se guarda. Se almacena el hash scrypt y su sal, igual
--     que en la versión de escritorio (src/main/seguridad.js).
--   - El token de sesión tampoco: en "sesiones" se guarda su SHA-256. Quien
--     lea la base no puede suplantar a alguien con el valor almacenado.
--   - "expira_en_ms" es el vencimiento en milisegundos epoch, para compararlo
--     como número igual que en SQLite.
--   - Los roles son los mismos tres que ya usa public.perfiles (Supabase Auth):
--     ADMIN, OPERADOR y CONSULTA. Así una cuenta migrada conserva sus accesos.
--
-- Idempotente: se puede volver a ejecutar sin romper nada.
-- ============================================================================

create table if not exists public.usuarios (
  id                 bigint generated always as identity primary key,
  usuario            text not null unique,
  nombre             text not null,
  email              text,
  rol                text not null default 'OPERADOR' check (rol in ('ADMIN','OPERADOR','CONSULTA')),
  clave_hash         text not null,
  clave_salt         text not null,
  debe_cambiar_clave boolean not null default true,
  activo             boolean not null default true,
  ultimo_acceso      timestamptz,
  creado_en          timestamptz not null default now()
);

create table if not exists public.sesiones (
  token_hash    text primary key,
  usuario_id    bigint not null references public.usuarios(id) on delete cascade,
  creado_en     timestamptz not null default now(),
  expira_en_ms  bigint not null
);

create index if not exists idx_usuarios_rol      on public.usuarios(rol);
create index if not exists idx_usuarios_activo   on public.usuarios(activo);
create index if not exists idx_sesiones_usuario  on public.sesiones(usuario_id);
create index if not exists idx_sesiones_vencimiento on public.sesiones(expira_en_ms);
