const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const { Pool, types } = require("pg");

// DATE llega como texto "YYYY-MM-DD" (sin desfases de zona horaria)
types.setTypeParser(1082, (v) => v);
const { version: VERSION } = require("./package.json");

const app = express();
const port = Number(process.env.PORT || 3000);
const ENTORNO = process.env.NODE_ENV || "development";
const INICIO = Date.now();

const DB_URL = (process.env.DATABASE_URL || "").trim();
const DB_LOCAL = /@(localhost|127\.0\.0\.1)(:|\/)/.test(DB_URL);

const pool = new Pool({
  connectionString: DB_URL || undefined,
  ssl: DB_LOCAL ? false : { rejectUnauthorized: false },
  max: 10, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30000, keepAlive: true
});

// Sin este manejador, una conexión inactiva cortada por Supabase tumba todo el proceso.
pool.on("error", (e) => console.error("[pg pool]", e.message));

/* ---------------------- Auditoría ---------------------- */
const ESQUEMA_AUDITORIA = `
  CREATE TABLE IF NOT EXISTS auditoria (
    id BIGSERIAL PRIMARY KEY,
    fecha TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accion VARCHAR(40) NOT NULL,
    entidad VARCHAR(30) NOT NULL,
    entidad_id BIGINT,
    detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip VARCHAR(60)
  );
  CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(fecha DESC);`;

const audit = (req, accion, entidad, id = null, detalle = {}) =>
  pool.query(
    "INSERT INTO auditoria (accion, entidad, entidad_id, detalle, ip) VALUES ($1,$2,$3,$4,$5)",
    [accion, entidad, id, JSON.stringify(detalle), req?.ip || null]
  ).catch((e) => console.error("[auditoria]", e.message));

function explicarErrorDb(e) {
  const m = e?.message || "";
  if (!DB_URL) return "DATABASE_URL no está configurada en .env";
  if (/tenant or user not found/i.test(m)) return "Supabase: usuario o región del pooler incorrectos (copia la cadena exacta de Connect > Session pooler)";
  if (/password authentication failed/i.test(m)) return "Contraseña de la base de datos incorrecta";
  if (e?.code === "ENOTFOUND") return "No se resuelve el host de la base de datos (revisa DATABASE_URL o tu internet)";
  if (e?.code === "ENETUNREACH" || e?.code === "EHOSTUNREACH") return "Red sin ruta al host (la conexión directa de Supabase es solo IPv6: usa el pooler)";
  if (/timeout|ETIMEDOUT/i.test(m + (e?.code || ""))) return "Tiempo de espera agotado conectando a la base de datos";
  if (e?.code === "ECONNREFUSED") return "Conexión rechazada por la base de datos";
  return m || "Base de datos no disponible";
}

/* ------------------------------------------------------------------ *
 * Observabilidad: métricas en memoria para la barra de estado del panel
 * ------------------------------------------------------------------ */
const metricas = {
  peticiones: 0,
  errores: 0,
  latenciaAcumulada: 0,
  ultimaPeticion: null,
  ultimaRuta: null,
  ventanaInicio: Date.now(),
  peticionesVentana: 0
};

app.use((req, res, next) => {
  const inicio = process.hrtime.bigint();

  metricas.peticiones += 1;
  metricas.peticionesVentana += 1;
  metricas.ultimaPeticion = new Date().toISOString();
  metricas.ultimaRuta = `${req.method} ${req.originalUrl}`;

  res.on("finish", () => {
    if (res.statusCode >= 500) metricas.errores += 1;
    metricas.latenciaAcumulada += Number(process.hrtime.bigint() - inicio) / 1e6;

    if (Date.now() - metricas.ventanaInicio >= 60000) {
      metricas.ventanaInicio = Date.now();
      metricas.peticionesVentana = 0;
    }
  });

  next();
});

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.param("id", (req, res, next, v) =>
  /^\d+$/.test(v) ? next() : res.status(400).json({ ok: false, error: "Id no válido" }));

function formatoDuracion(segundos) {
  const s = Math.max(0, Math.floor(segundos));
  const dias = Math.floor(s / 86400);
  const horas = Math.floor((s % 86400) / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  const resto = s % 60;

  if (dias) return `${dias}d ${horas}h ${minutos}m`;
  if (horas) return `${horas}h ${minutos}m ${resto}s`;
  return `${minutos}m ${resto}s`;
}

function instantaneaMetricas() {
  const memoria = process.memoryUsage();
  return {
    peticiones: metricas.peticiones,
    errores: metricas.errores,
    latenciaPromedioMs: metricas.peticiones
      ? Number((metricas.latenciaAcumulada / metricas.peticiones).toFixed(1))
      : 0,
    porMinuto: metricas.peticionesVentana,
    ultimaPeticion: metricas.ultimaPeticion,
    ultimaRuta: metricas.ultimaRuta,
    memoriaMB: {
      rss: Number((memoria.rss / 1048576).toFixed(1)),
      heapUsado: Number((memoria.heapUsed / 1048576).toFixed(1)),
      heapTotal: Number((memoria.heapTotal / 1048576).toFixed(1))
    }
  };
}

const sesionesAdmin = new Map();
const SESION_MS = 8 * 60 * 60 * 1000;

setInterval(() => {
  const limite = Date.now() - SESION_MS;
  for (const [t, s] of sesionesAdmin) if (s.creada < limite) sesionesAdmin.delete(t);
}, 10 * 60 * 1000).unref();

function claveValida(dada) {
  const a = crypto.createHash("sha256").update(String(dada || "")).digest();
  const b = crypto.createHash("sha256").update(String(process.env.ADMIN_KEY || "")).digest();
  return crypto.timingSafeEqual(a, b);
}

function crearSesionAdmin() {
  const token = crypto.randomBytes(32).toString("hex");
  sesionesAdmin.set(token, {
    creada: Date.now(),
    ultimaActividad: Date.now()
  });
  return token;
}

function admin(req, res, next) {
  const token = req.cookies?.alisAdminSession;

  if (!token || !sesionesAdmin.has(token)) {
    return res.status(401).json({
      ok: false,
      error: "No autorizado"
    });
  }

  const sesion = sesionesAdmin.get(token);
  if (Date.now() - sesion.creada > SESION_MS) {
    sesionesAdmin.delete(token);
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  sesion.ultimaActividad = Date.now();

  next();
}

function generarCodigo() {
  const a = crypto.randomBytes(4).toString("hex").toUpperCase();
  const b = crypto.randomBytes(4).toString("hex").toUpperCase();
  const c = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `ALIS-${a}-${b}-${c}`;
}

app.post("/api/admin/login", (req, res) => {
  const { clave } = req.body || {};

  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({
      ok: false,
      error: "ADMIN_KEY no configurada en el servidor"
    });
  }

  if (!clave || !claveValida(clave)) {
    audit(req, "LOGIN_FALLIDO", "sesion");
    return res.status(401).json({
      ok: false,
      error: "Clave incorrecta"
    });
  }

  const token = crearSesionAdmin();
  audit(req, "LOGIN", "sesion");

  res.cookie("alisAdminSession", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/"
  });

  return res.json({
    ok: true,
    mensaje: "Acceso administrativo autorizado"
  });
});

app.post("/api/admin/logout", admin, (req, res) => {
  const token = req.cookies?.alisAdminSession;

  if (token) {
    sesionesAdmin.delete(token);
    audit(req, "LOGOUT", "sesion");
  }

  res.clearCookie("alisAdminSession", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/"
  });

  return res.json({
    ok: true,
    mensaje: "Sesión cerrada"
  });
});

app.get("/api/health", async (req, res) => {
  const inicioDb = Date.now();
  let baseDatos;

  try {
    await pool.query("SELECT 1");
    baseDatos = {
      ok: true,
      latenciaMs: Date.now() - inicioDb,
      detalle: "Conexión estable"
    };
  } catch (error) {
    console.error("ERROR DB:", error.code || "", error.message);
    baseDatos = { ok: false, latenciaMs: null, detalle: explicarErrorDb(error) };
  }

  const segundos = Math.floor((Date.now() - INICIO) / 1000);

  res.status(baseDatos.ok ? 200 : 503).json({
    ok: baseDatos.ok,
    servicio: "Alis Software Licensing",
    version: VERSION,
    entorno: ENTORNO,
    node: process.version,
    plataforma: `${process.platform} ${process.arch}`,
    uptime: segundos,
    uptimeTexto: formatoDuracion(segundos),
    proceso: { pid: process.pid, arranque: new Date(INICIO).toISOString() },
    metricas: instantaneaMetricas(),
    baseDatos,
    horaServidor: new Date().toISOString(),
    marcaTiempo: Date.now()
  });
});

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

app.post("/api/licencias/activar", async (req, res) => {
  const { codigo, equipoId, nombreEquipo, version } = req.body || {};

  if (!codigo || !equipoId) {
    return res.status(400).json({ ok: false, error: "codigo y equipoId son obligatorios" });
  }

  let client, licencia;

  const rechazar = async (http, error, commit = false) => {
    await client.query(commit ? "COMMIT" : "ROLLBACK");
    audit(req, "ACTIVACION_RECHAZADA", "licencia", licencia?.id ?? null, {
      codigo: String(codigo).slice(0, 40), equipo: String(equipoId).slice(0, 80), motivo: error
    });
    return res.status(http).json({ ok: false, error });
  };

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    const lr = await client.query(`
      SELECT l.*, p.nombre AS producto_nombre, p.activo AS producto_activo, c.activo AS cliente_activo
      FROM licencias l
      INNER JOIN productos p ON p.id = l.producto_id
      INNER JOIN clientes c ON c.id = l.cliente_id
      WHERE UPPER(l.codigo) = UPPER($1)
      FOR UPDATE OF l
    `, [String(codigo).trim()]);

    if (!lr.rowCount) return await rechazar(404, "Licencia no encontrada");

    licencia = lr.rows[0];

    if (licencia.estado !== "ACTIVA") return await rechazar(403, `Licencia ${licencia.estado.toLowerCase()}`);
    if (!licencia.producto_activo) return await rechazar(403, "Producto desactivado");
    if (!licencia.cliente_activo) return await rechazar(403, "Cliente inactivo");

    if (licencia.fecha_vencimiento && ymd(new Date()) > String(licencia.fecha_vencimiento).slice(0, 10)) {
      await client.query("UPDATE licencias SET estado='VENCIDA' WHERE id=$1", [licencia.id]);
      return await rechazar(403, "Licencia vencida", true);
    }

    const existente = await client.query(
      "SELECT id FROM activaciones WHERE licencia_id=$1 AND equipo_id=$2", [licencia.id, equipoId]);

    if (existente.rowCount) {
      await client.query(`
        UPDATE activaciones
        SET ultima_validacion=NOW(), nombre_equipo=$3, version_app=$4, activa=TRUE
        WHERE licencia_id=$1 AND equipo_id=$2
      `, [licencia.id, equipoId, nombreEquipo || null, version || null]);
    } else {
      const cantidad = await client.query(
        "SELECT COUNT(*)::int AS total FROM activaciones WHERE licencia_id=$1 AND activa=TRUE", [licencia.id]);

      if (cantidad.rows[0].total >= licencia.max_equipos) {
        return await rechazar(409, "La licencia ya alcanzó el máximo de equipos autorizados");
      }

      await client.query(`
        INSERT INTO activaciones (licencia_id, equipo_id, nombre_equipo, version_app)
        VALUES ($1,$2,$3,$4)
      `, [licencia.id, equipoId, nombreEquipo || null, version || null]);
    }

    await client.query("COMMIT");

    audit(req, "ACTIVAR_EQUIPO", "licencia", licencia.id, {
      codigo: licencia.codigo, equipo: equipoId, nombre: nombreEquipo || null, nuevo: !existente.rowCount
    });

    res.json({
      ok: true,
      mensaje: "Licencia activada correctamente",
      licencia: {
        codigo: licencia.codigo,
        producto: licencia.producto_nombre,
        tipo: licencia.tipo,
        estado: "ACTIVA",
        fechaVencimiento: licencia.fecha_vencimiento,
        maxEquipos: licencia.max_equipos
      }
    });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("[activar]", error.code || "", error.message);
    res.status(503).json({ ok: false, error: "Servicio de licencias no disponible, intenta de nuevo" });
  } finally {
    client?.release();
  }
});

/* ------------------------- Helpers admin ------------------------- */
const TIPOS = ["ANUAL", "MENSUAL", "TRIMESTRAL", "PERPETUA"];
const txt = (v) => String(v ?? "").trim() || null;
const nom = (v) => String(v ?? "").trim();
const bad = (res, error, http = 400) => res.status(http).json({ ok: false, error });
const correoMal = (v) => !!v && !/^\S+@\S+\.\S+$/.test(String(v).trim());
const fechaMal = (v) => !!v && !/^\d{4}-\d{2}-\d{2}$/.test(v);
const accionPatch = (b) =>
  b.activo !== undefined && Object.keys(b).length === 1 ? (b.activo ? "ACTIVAR" : "DESACTIVAR") : "EDITAR";

// UPDATE parcial: solo columnas del mapa (nunca del cliente). null = nada que actualizar, false = no existe.
async function actualizar(tabla, id, mapa, cuerpo) {
  const claves = Object.keys(mapa).filter((k) => cuerpo[k] !== undefined);
  if (!claves.length) return null;
  const r = await pool.query(
    `UPDATE ${tabla} SET ${claves.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${claves.length + 1} RETURNING *`,
    [...claves.map((k) => mapa[k](cuerpo[k])), id]
  );
  return r.rows[0] || false;
}

/* ---------------------------- Productos ---------------------------- */
app.get("/api/admin/productos", admin, async (req, res) => {
  const r = await pool.query(`
    SELECT p.*, COUNT(l.id)::int AS licencias
    FROM productos p LEFT JOIN licencias l ON l.producto_id = p.id
    GROUP BY p.id ORDER BY p.nombre`);
  res.json({ ok: true, productos: r.rows });
});

app.post("/api/admin/productos", admin, async (req, res) => {
  const b = req.body || {};
  const nombre = nom(b.nombre);
  const codigo = String(b.codigo ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  if (!nombre || !codigo) return bad(res, "Nombre y código son obligatorios");

  const r = await pool.query(
    "INSERT INTO productos (nombre, codigo, descripcion) VALUES ($1,$2,$3) RETURNING *",
    [nombre, codigo, txt(b.descripcion)]);

  audit(req, "CREAR", "producto", r.rows[0].id, { nombre, codigo });
  res.status(201).json({ ok: true, producto: r.rows[0] });
});

app.patch("/api/admin/productos/:id", admin, async (req, res) => {
  const b = req.body || {};
  if (b.nombre !== undefined && !nom(b.nombre)) return bad(res, "El nombre no puede estar vacío");

  const p = await actualizar("productos", req.params.id, { nombre: nom, descripcion: txt, activo: Boolean }, b);
  if (p === null) return bad(res, "Nada que actualizar");
  if (!p) return bad(res, "Producto no encontrado", 404);

  audit(req, accionPatch(b), "producto", p.id, { nombre: p.nombre });
  res.json({ ok: true, producto: p });
});

/* ----------------------------- Clientes ----------------------------- */
app.get("/api/admin/clientes", admin, async (req, res) => {
  const r = await pool.query(`
    SELECT c.*, COUNT(l.id)::int AS licencias
    FROM clientes c LEFT JOIN licencias l ON l.cliente_id = c.id
    GROUP BY c.id ORDER BY c.nombre`);
  res.json({ ok: true, clientes: r.rows });
});

app.post("/api/admin/clientes", admin, async (req, res) => {
  const b = req.body || {};
  if (!nom(b.nombre)) return bad(res, "El nombre es obligatorio");
  if (correoMal(b.correo)) return bad(res, "El correo no es válido");

  const r = await pool.query(
    "INSERT INTO clientes (nombre, identificacion, telefono, correo) VALUES ($1,$2,$3,$4) RETURNING *",
    [nom(b.nombre), txt(b.identificacion), txt(b.telefono), txt(b.correo)]);

  audit(req, "CREAR", "cliente", r.rows[0].id, { nombre: r.rows[0].nombre });
  res.status(201).json({ ok: true, cliente: r.rows[0] });
});

app.patch("/api/admin/clientes/:id", admin, async (req, res) => {
  const b = req.body || {};
  if (b.nombre !== undefined && !nom(b.nombre)) return bad(res, "El nombre no puede estar vacío");
  if (correoMal(b.correo)) return bad(res, "El correo no es válido");

  const c = await actualizar("clientes", req.params.id,
    { nombre: nom, identificacion: txt, telefono: txt, correo: txt, activo: Boolean }, b);
  if (c === null) return bad(res, "Nada que actualizar");
  if (!c) return bad(res, "Cliente no encontrado", 404);

  audit(req, accionPatch(b), "cliente", c.id, { nombre: c.nombre });
  res.json({ ok: true, cliente: c });
});

/* ----------------------------- Licencias ----------------------------- */
app.get("/api/admin/licencias", admin, async (req, res) => {
  const r = await pool.query(`
    SELECT l.id, l.codigo, l.estado, l.tipo, l.fecha_inicio,
           l.fecha_vencimiento, l.max_equipos,
           p.nombre AS producto, c.nombre AS cliente,
           COUNT(a.id)::int AS equipos
    FROM licencias l
    INNER JOIN productos p ON p.id = l.producto_id
    INNER JOIN clientes c ON c.id = l.cliente_id
    LEFT JOIN activaciones a ON a.licencia_id = l.id AND a.activa = TRUE
    GROUP BY l.id, p.nombre, c.nombre
    ORDER BY l.id DESC`);
  res.json({ ok: true, licencias: r.rows });
});

app.post("/api/admin/licencias", admin, async (req, res) => {
  const { productoId, clienteId, tipo = "ANUAL", fechaVencimiento, maxEquipos = 1 } = req.body || {};
  const max = Number(maxEquipos);

  if (!productoId || !clienteId) return bad(res, "productoId y clienteId son obligatorios");
  if (!TIPOS.includes(tipo)) return bad(res, "Tipo de licencia no válido");
  if (!Number.isInteger(max) || max < 1) return bad(res, "El máximo de equipos debe ser 1 o más");

  // La fecha de vencimiento se calcula en el servidor según el tipo.
  // ANUAL      = +1 año
  // TRIMESTRAL = +3 meses
  // MENSUAL    = +1 mes
  // PERPETUA   = sin vencimiento
  let vencimiento = null;

  if (tipo !== "PERPETUA") {
    const inicio = new Date();
    const anio = inicio.getFullYear();
    const mes = inicio.getMonth();
    const dia = inicio.getDate();

    if (tipo === "ANUAL") {
      vencimiento = new Date(anio + 1, mes, dia);
    } else if (tipo === "TRIMESTRAL") {
      vencimiento = new Date(anio, mes + 3, dia);
    } else if (tipo === "MENSUAL") {
      vencimiento = new Date(anio, mes + 1, dia);
    }

    vencimiento = ymd(vencimiento);
  }

  const codigo = generarCodigo();
  const r = await pool.query(
    `INSERT INTO licencias (producto_id, cliente_id, codigo, tipo, fecha_vencimiento, max_equipos)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [productoId, clienteId, codigo, tipo, vencimiento, max]);

  audit(req, "CREAR", "licencia", r.rows[0].id, { codigo, tipo, maxEquipos: max });
  res.status(201).json({ ok: true, licencia: r.rows[0] });
});

app.patch("/api/admin/licencias/:id", admin, async (req, res) => {
  const { tipo, fechaVencimiento, maxEquipos } = req.body || {};
  const max = Number(maxEquipos);

  if (tipo && !TIPOS.includes(tipo)) return bad(res, "Tipo de licencia no válido");
  if (!Number.isInteger(max) || max < 1) return bad(res, "El máximo de equipos debe ser 1 o más");
  if (fechaMal(fechaVencimiento)) return bad(res, "Fecha de vencimiento no válida");

  const uso = await pool.query(
    "SELECT COUNT(*)::int AS n FROM activaciones WHERE licencia_id=$1 AND activa=TRUE", [req.params.id]);
  if (max < uso.rows[0].n) {
    return bad(res, `Hay ${uso.rows[0].n} equipos activos: libera equipos antes de reducir el cupo`, 409);
  }

  // Renovar una licencia VENCIDA con fecha vigente (o sin fecha) la reactiva.
  const r = await pool.query(`
    UPDATE licencias SET
      tipo = COALESCE($2, tipo),
      fecha_vencimiento = $3,
      max_equipos = $4,
      estado = CASE WHEN estado = 'VENCIDA' AND ($3::date IS NULL OR $3::date >= CURRENT_DATE)
                    THEN 'ACTIVA' ELSE estado END
    WHERE id = $1 RETURNING *`,
    [req.params.id, tipo || null, fechaVencimiento || null, max]);

  if (!r.rowCount) return bad(res, "Licencia no encontrada", 404);

  audit(req, "EDITAR", "licencia", r.rows[0].id, {
    codigo: r.rows[0].codigo, tipo: r.rows[0].tipo, vence: r.rows[0].fecha_vencimiento, maxEquipos: max
  });
  res.json({ ok: true, licencia: r.rows[0] });
});

app.patch("/api/admin/licencias/:id/estado", admin, async (req, res) => {
  const { estado } = req.body || {};
  if (!["ACTIVA", "SUSPENDIDA", "VENCIDA", "CANCELADA"].includes(estado)) return bad(res, "Estado no válido");

  const r = await pool.query("UPDATE licencias SET estado=$1 WHERE id=$2 RETURNING *", [estado, req.params.id]);
  if (!r.rowCount) return bad(res, "Licencia no encontrada", 404);

  audit(req, "ESTADO_" + estado, "licencia", r.rows[0].id, { codigo: r.rows[0].codigo });
  res.json({ ok: true, licencia: r.rows[0] });
});

/* ---------------------------- Activaciones ---------------------------- */
app.get("/api/admin/activaciones", admin, async (req, res) => {
  const r = await pool.query(`
    SELECT a.*, l.codigo AS licencia, c.nombre AS cliente, p.nombre AS producto
    FROM activaciones a
    INNER JOIN licencias l ON l.id = a.licencia_id
    INNER JOIN clientes c ON c.id = l.cliente_id
    INNER JOIN productos p ON p.id = l.producto_id
    ORDER BY a.ultima_validacion DESC`);
  res.json({ ok: true, activaciones: r.rows });
});

app.patch("/api/admin/activaciones/:id/liberar", admin, async (req, res) => {
  const r = await pool.query("UPDATE activaciones SET activa=FALSE WHERE id=$1 RETURNING *", [req.params.id]);
  if (!r.rowCount) return bad(res, "Activación no encontrada", 404);

  const a = r.rows[0];
  audit(req, "LIBERAR_EQUIPO", "activacion", a.id, { licenciaId: a.licencia_id, equipo: a.equipo_id, nombre: a.nombre_equipo });
  res.json({ ok: true, activacion: a });
});

/* ----------------------------- Auditoría ----------------------------- */
app.get("/api/admin/auditoria", admin, async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 200, 1), 500);
  const r = await pool.query(
    "SELECT id, fecha, accion, entidad, entidad_id, detalle, ip FROM auditoria ORDER BY id DESC LIMIT $1", [limite]);
  res.json({ ok: true, registros: r.rows });
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

app.use((error, req, res, next) => {
  console.error("[error interno]", error);
  if (res.headersSent) return next(error);
  if (error.code === "23505") return bad(res, "Ya existe un registro con ese nombre o código", 409);
  if (error.code === "23503") return bad(res, "El registro está en uso por otros datos", 409);
  if (/timeout|ECONN|ENOTFOUND|terminated|tenant or user/i.test(`${error.message}${error.code || ""}`)) {
    return bad(res, explicarErrorDb(error), 503);
  }
  res.status(500).json({ ok: false, error: "Error interno del servidor" });
});

app.listen(port, () => {
  console.log(`Alis Software Licensing v${VERSION} · ${ENTORNO} · http://localhost:${port}`);
  pool.query(ESQUEMA_AUDITORIA)
    .then(() => console.log("[db] Conexión a PostgreSQL correcta"))
    .catch((e) => console.error("[db] NO conecta:", explicarErrorDb(e)));
});

process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e?.message || e));


