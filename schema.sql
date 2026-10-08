-- ALIS SOFTWARE LICENSING
-- Base inicial para PostgreSQL / Supabase

CREATE TABLE IF NOT EXISTS productos (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL UNIQUE,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    descripcion TEXT,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
    id BIGSERIAL PRIMARY KEY,
    nombre VARCHAR(180) NOT NULL,
    identificacion VARCHAR(80),
    telefono VARCHAR(50),
    correo VARCHAR(180),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS licencias (
    id BIGSERIAL PRIMARY KEY,
    producto_id BIGINT NOT NULL REFERENCES productos(id),
    cliente_id BIGINT NOT NULL REFERENCES clientes(id),
    codigo VARCHAR(80) NOT NULL UNIQUE,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVA'
        CHECK (estado IN ('ACTIVA','SUSPENDIDA','VENCIDA','CANCELADA')),
    tipo VARCHAR(30) NOT NULL DEFAULT 'ANUAL',
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento DATE,
    max_equipos INTEGER NOT NULL DEFAULT 1 CHECK (max_equipos > 0),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activaciones (
    id BIGSERIAL PRIMARY KEY,
    licencia_id BIGINT NOT NULL REFERENCES licencias(id) ON DELETE CASCADE,
    equipo_id VARCHAR(180) NOT NULL,
    nombre_equipo VARCHAR(180),
    version_app VARCHAR(50),
    primera_activacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultima_validacion TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (licencia_id, equipo_id)
);

CREATE INDEX IF NOT EXISTS idx_licencias_codigo ON licencias(codigo);
CREATE INDEX IF NOT EXISTS idx_activaciones_licencia ON activaciones(licencia_id);

CREATE TABLE IF NOT EXISTS auditoria (
    id BIGSERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accion VARCHAR(40) NOT NULL,
    entidad VARCHAR(30) NOT NULL,
    entidad_id BIGINT,
    detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip VARCHAR(60)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);

INSERT INTO productos (nombre, codigo, descripcion)
VALUES ('SmartPosPro', 'SMARTPOSPRO', 'Sistema POS de escritorio')
ON CONFLICT (codigo) DO NOTHING;
