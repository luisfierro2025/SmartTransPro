/* ==================================================================
   ALIS SOFTWARE LICENSING - Panel administrativo
   ================================================================== */
"use strict";

const REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);

const estado = {
  clave: "",
  datos: { productos: [], clientes: [], licencias: [], activaciones: [] },
  busqueda: "",
  filtro: "TODOS",
  orden: { columna: null, direccion: 1 },
  seleccionada: null,
  cargando: false
};

/* ---------------------------- Utilidades ---------------------------- */
function esc(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const dLocal = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v));

function fecha(valor, conHora) {
  if (!valor) return "---";
  const d = dLocal(valor);
  if (Number.isNaN(d.getTime())) return "---";
  return d.toLocaleString("es-NI", conHora
    ? { dateStyle: "medium", timeStyle: "short" }
    : { day: "2-digit", month: "short", year: "numeric" });
}

function diasRestantes(iso) {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = dLocal(iso);
  if (Number.isNaN(objetivo.getTime())) return null;
  objetivo.setHours(0, 0, 0, 0);
  return Math.round((objetivo - hoy) / 86400000);
}

function claseEstado(valor) {
  return String(valor || "").toLowerCase().replaceAll(" ", "-");
}

/* ==================================================================
   SESION ADMINISTRATIVA
   ================================================================== */
async function iniciarSesionAdmin() {
  const clave = estado.clave;

  if (!clave) {
    throw new Error("Escribe la ADMIN_KEY para acceder al panel.");
  }

  const res = await fetch("/api/admin/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ clave })
  });

  let data = {};

  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok) {
    throw new Error(data.error || "No se pudo iniciar sesión");
  }

  // La clave ya no se necesita en el navegador.
  estado.clave = "";
  $("adminKey").value = "";

  return data;
}

/* ==================================================================
   API
   ================================================================== */
async function api(url, opciones) {
  const res = await fetch(url, {
    ...(opciones || {}),
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...((opciones && opciones.headers) || {})
    }
  });

  let data = {};

  try {
    data = await res.json();
  } catch {
    /* respuesta sin cuerpo */
  }

  if (!res.ok) {
    throw new Error(data.error || "Error " + res.status);
  }

  return data;
}

/* ==================================================================
   BARRA DE ESTADO INFERIOR
   ================================================================== */
const sb = {
  reloj: $("sbReloj"),
  fecha: $("sbFecha"),
  conexion: $("sbConexion"),
  bd: $("sbBd"),
  version: $("sbVersion"),
  entorno: $("sbEntorno"),
  uptime: $("sbUptime"),
  peticiones: $("sbPeticiones"),
  errores: $("sbErrores"),
  latencia: $("sbLatencia"),
  memoria: $("sbMemoria"),
  navDot: $("navDot"),
  navTexto: $("navEstadoTexto")
};

function pintarEstadoConexion(nivel, texto) {
  const clase = { ok: "ok", warn: "warn", bad: "bad", idle: "idle" }[nivel] || "idle";

  sb.conexion.querySelector(".dot").className = "dot dot--" + clase;
  sb.conexion.querySelector("b").textContent = texto;
  sb.conexion.className = "sb-item is-" + clase;

  sb.navDot.className = "dot dot--" + clase;
  sb.navTexto.textContent = texto;
}

function pintarEstadoBd(ok, detalle, latenciaMs) {
  const nivel = ok ? "ok" : "bad";

  sb.bd.querySelector(".dot").className = "dot dot--" + nivel;
  sb.bd.querySelector("b").textContent = ok
    ? "Conectada" + (latenciaMs != null ? " - " + latenciaMs + " ms" : "")
    : "Sin conexion";

  sb.bd.className = "sb-item is-" + nivel;
  sb.bd.title = detalle || "";
}

function iniciarReloj() {
  const tick = () => {
    const ahora = new Date();

    sb.reloj.textContent = ahora.toLocaleTimeString("es-NI", {
      hour12: false
    });

    sb.fecha.textContent = ahora.toLocaleDateString("es-NI", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  tick();
  setInterval(tick, 1000);
}

async function consultarSalud() {
  const inicio = performance.now();

  try {
    const respuesta = await fetch("/api/health", {
      cache: "no-store"
    });

    const data = await respuesta.json();
    const ida = Math.round(performance.now() - inicio);
    const met = data.metricas || {};

    pintarEstadoConexion(
      data.ok ? "ok" : "warn",
      data.ok ? "API conectada" : "API degradada"
    );

    pintarEstadoBd(
      !!(data.baseDatos && data.baseDatos.ok),
      data.baseDatos && data.baseDatos.detalle,
      data.baseDatos && data.baseDatos.latenciaMs
    );

    sb.version.textContent = data.version || "---";
    sb.entorno.textContent = data.entorno || "---";
    sb.uptime.textContent = data.uptimeTexto || "---";

    sb.peticiones.textContent =
      met.peticiones != null ? met.peticiones : 0;

    sb.errores.textContent =
      met.errores != null ? met.errores : 0;

    sb.latencia.textContent =
      met.latenciaPromedioMs != null
        ? met.latenciaPromedioMs + " ms"
        : "---";

    sb.memoria.textContent =
      met.memoriaMB && met.memoriaMB.rss != null
        ? met.memoriaMB.rss + " MB"
        : "---";

    $("navVersion").textContent =
      "v" + (data.version || "---") + " - " + (data.node || "");

    if (data.ok) {
      pintarEstadoConexion("ok", "API conectada - " + ida + " ms");
    }
  } catch {
    pintarEstadoConexion("bad", "Servidor sin respuesta");
    pintarEstadoBd(false, "API inaccesible", null);

    for (const el of [
      sb.version,
      sb.entorno,
      sb.uptime,
      sb.latencia,
      sb.memoria
    ]) {
      el.textContent = "---";
    }
  }
}

/* ==================================================================
   TOASTS
   ================================================================== */
const ICONOS = {
  ok: '<path d="M20 6L9 17l-5-5"/>',
  bad: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
  warn: '<path d="M12 4l9 16H3l9-16z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

function toast(tipo, titulo, texto) {
  const cont = $("toasts");

  const el = document.createElement("div");

  el.className = "toast toast--" + tipo;

  el.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      (ICONOS[tipo] || ICONOS.info) +
    '</svg>' +
    '<div class="toast__body">' +
      '<p class="toast__title">' + esc(titulo) + "</p>" +
      (texto
        ? '<p class="toast__text">' + esc(texto) + "</p>"
        : "") +
    "</div>" +
    '<button class="toast__close" aria-label="Cerrar">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 6l12 12M18 6L6 18"/>' +
      "</svg>" +
    "</button>";

  const cerrar = () => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 200);
  };

  el.querySelector(".toast__close").addEventListener("click", cerrar);

  cont.appendChild(el);

  setTimeout(cerrar, 4200);
}

/* ==================================================================
   RENDER - KPIs, tabla y resumen
   ================================================================== */
function skeletons() {
  const anchos = [140, 110, 120, 90, 100, 80];

  $("tabla").innerHTML = Array.from({ length: 6 }, () =>
    "<tr>" +
      Array.from({ length: 6 }, (_, i) =>
        '<td><span class="skeleton" style="width:' +
        anchos[i] +
        'px"></span></td>'
      ).join("") +
      '<td class="actions"><span class="skeleton" style="width:90px"></span></td>' +
    "</tr>"
  ).join("");
}

function hayFiltro() {
  return estado.busqueda.trim() !== "" ||
    estado.filtro !== "TODOS";
}

function licenciasVisibles() {
  const q = estado.busqueda.trim().toLowerCase();

  let lista = estado.datos.licencias.filter((l) => {
    if (estado.filtro !== "TODOS" && l.estado !== estado.filtro) {
      return false;
    }

    if (!q) return true;

    return [l.codigo, l.producto, l.cliente, l.tipo]
      .some((v) =>
        String(v ?? "").toLowerCase().includes(q)
      );
  });

  const col = estado.orden.columna;
  const dir = estado.orden.direccion;

  if (col) {
    lista = [...lista].sort((a, b) => {
      const va = a[col] ?? "";
      const vb = b[col] ?? "";

      if (
        typeof va === "number" &&
        typeof vb === "number"
      ) {
        return (va - vb) * dir;
      }

      return String(va).localeCompare(
        String(vb),
        "es",
        { numeric: true }
      ) * dir;
    });
  }

  return lista;
}

function pintarKpis() {
  const d = estado.datos;

  const activas =
    d.activaciones.filter((a) => a.activa).length;

  const porEstado = (e) =>
    d.licencias.filter((l) => l.estado === e).length;

  const inactivas =
    porEstado("VENCIDA") +
    porEstado("CANCELADA");

  const libres = d.licencias.reduce(
    (acc, l) =>
      acc +
      Math.max(
        0,
        (l.max_equipos ?? 0) -
        (l.equipos ?? 0)
      ),
    0
  );

  const conCliente =
    new Set(d.licencias.map((l) => l.cliente)).size;

  const vencen = d.licencias.filter((l) => {
    const n = diasRestantes(l.fecha_vencimiento);

    return n !== null &&
      n >= 0 &&
      n <= 30;
  }).length;

  $("totalLicencias").textContent =
    d.licencias.length;

  $("hintLicencias").textContent =
    porEstado("ACTIVA") +
    " activas - " +
    porEstado("SUSPENDIDA") +
    " suspendidas - " +
    inactivas +
    " inactivas";

  $("totalEquipos").textContent = activas;

  $("hintEquipos").textContent =
    libres +
    " cupos libres de " +
    d.activaciones.length +
    " registros";

  $("totalClientes").textContent =
    d.clientes.length;

  $("hintClientes").textContent =
    d.clientes.length
      ? conCliente + " con licencias emitidas"
      : "Sin clientes registrados";

  $("totalProductos").textContent =
    d.productos.length;

  $("hintProductos").textContent =
    vencen
      ? vencen + " licencias vencen en 30 dias"
      : "Sin vencimientos proximos";
}

function celdaVencimiento(l) {
  if (!l.fecha_vencimiento) {
    return '<span class="badge neutra">Sin fecha</span>';
  }

  const d = diasRestantes(l.fecha_vencimiento);

  const tarde =
    d !== null && d < 0;

  const pronto =
    d !== null &&
    d >= 0 &&
    d <= 30;

  let sub = "";
  let color = "inherit";

  if (tarde) {
    sub =
      "Vencio hace " +
      Math.abs(d) +
      " d";

    color = "var(--bad-700)";
  } else if (pronto) {
    sub =
      "Vence en " +
      d +
      " d";

    color = "var(--warn-700)";
  }

  return (
    '<div class="cell-main">' +
      esc(fecha(l.fecha_vencimiento)) +
    "</div>" +
    (
      sub
        ? '<div class="cell-sub" style="color:' +
          color +
          '">' +
          esc(sub) +
          "</div>"
        : ""
    )
  );
}

function pintarTabla() {
  const lista = licenciasVisibles();
  const cuerpo = $("tabla");

  if (!lista.length) {
    const vacio = hayFiltro()
      ? {
          titulo: "Sin resultados",
          texto:
            "Ajusta la busqueda o el filtro de estado para ver otras licencias."
        }
      : {
          titulo: "Aun no hay licencias",
          texto:
            'Emite la primera licencia con el boton "Nueva licencia".'
        };

    cuerpo.innerHTML =
      '<tr><td colspan="7"><div class="empty">' +
        '<div class="empty__icon">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true">' +
            '<path d="M4 5h16v14H4z"/>' +
            '<path d="M4 10h16"/>' +
            '<path d="M9 15h6"/>' +
          "</svg>" +
        "</div>" +
        "<h3>" + esc(vacio.titulo) + "</h3>" +
        "<p>" + esc(vacio.texto) + "</p>" +
      "</div></td></tr>";

    $("resumenTabla").textContent = "0 registros";

    return;
  }

  cuerpo.innerHTML = lista.map((l) => {
    const usados = l.equipos ?? 0;
    const max = l.max_equipos ?? 0;

    const pct = max
      ? Math.min(
          100,
          Math.round((usados / max) * 100)
        )
      : 0;

    const lleno =
      max > 0 &&
      usados >= max;

    const activa =
      l.estado === "ACTIVA";

    return (
      '<tr data-id="' +
        l.id +
        '" data-codigo="' +
        esc(l.codigo) +
        '" tabindex="0">' +

        '<td><span class="code">' +
          esc(l.codigo) +
        "</span></td>" +

        '<td><div class="cell-main">' +
          esc(l.producto) +
        "</div>" +
        '<div class="cell-sub">' +
          esc(l.tipo || "---") +
        "</div></td>" +

        '<td><span class="cell-main">' +
          esc(l.cliente) +
        "</span></td>" +

        '<td><span class="badge ' +
          claseEstado(l.estado) +
        '">' +
          esc(l.estado) +
        "</span></td>" +

        "<td>" +
          celdaVencimiento(l) +
        "</td>" +

        '<td><div class="meter">' +
          '<span class="meter__track">' +
            '<span class="meter__fill' +
              (lleno ? " is-full" : "") +
              '" style="width:' +
              pct +
              '%"></span>' +
          "</span>" +
          '<span class="meter__text">' +
            usados +
            " / " +
            max +
          "</span>" +
        "</div></td>" +

        '<td class="actions"><div>' +

          '<button class="btn btn--sm ' +
            (activa
              ? "btn--danger"
              : "btn--ok") +
            '" data-accion="estado"' +
            ' data-id="' +
              l.id +
            '"' +
            ' data-nuevo="' +
              (activa
                ? "SUSPENDIDA"
                : "ACTIVA") +
            '"' +
            ' data-actual="' +
              esc(l.estado) +
            '">' +
              (activa
                ? "Suspender"
                : "Activar") +
          "</button>" +

          '<button class="btn btn--sm btn--ghost" ' +
            'data-accion="detalle" ' +
            'data-id="' +
              l.id +
            '">' +
              "Detalle" +
          "</button>" +

        "</div></td>" +

      "</tr>"
    );
  }).join("");

  const total =
    estado.datos.licencias.length;

  $("resumenTabla").textContent =
    lista.length === total
      ? total +
        (total === 1
          ? " licencia en total"
          : " licencias en total")
      : "Mostrando " +
        lista.length +
        " de " +
        total +
        " licencias";
}

/* ==================================================================
   DRAWER - detalle de licencia y equipos
   ================================================================== */
function mostrarDrawer(abrir) {
  $("drawer").classList.toggle(
    "is-open",
    abrir
  );

  $("drawer").setAttribute(
    "aria-hidden",
    String(!abrir)
  );

  $("scrim").hidden = !abrir;

  if (!abrir) {
    estado.seleccionada = null;

    document
      .querySelectorAll("#tabla tr")
      .forEach((tr) =>
        tr.classList.remove("is-selected")
      );
  }
}

function abrirDetalle(id) {
  const licencia =
    estado.datos.licencias.find((l) => Number(l.id) === id);

  if (!licencia) return;

  estado.seleccionada = id;

  document
    .querySelectorAll("#tabla tr")
    .forEach((tr) => {
      tr.classList.toggle(
        "is-selected",
        Number(tr.dataset.id) === id
      );
    });

  const equipos =
    estado.datos.activaciones
      .filter(
        (a) => a.licencia === licencia.codigo
      )
      .sort(
        (a, b) =>
          Number(b.activa) -
          Number(a.activa)
      );

  const fila = (etiqueta, valor) =>
    '<div class="spec__row"><span>' +
      etiqueta +
    "</span><b>" +
      valor +
    "</b></div>";

  let html =
    '<div class="spec">' +

      fila(
        "Estado",
        '<span class="badge ' +
          claseEstado(licencia.estado) +
        '">' +
          esc(licencia.estado) +
        "</span>"
      ) +

      fila(
        "Producto",
        esc(licencia.producto)
      ) +

      fila(
        "Cliente",
        esc(licencia.cliente)
      ) +

      fila(
        "Tipo",
        esc(licencia.tipo || "---")
      ) +

      fila(
        "Inicio",
        esc(fecha(licencia.fecha_inicio))
      ) +

      fila(
        "Vencimiento",
        licencia.fecha_vencimiento
          ? esc(fecha(licencia.fecha_vencimiento))
          : "Sin vencimiento"
      ) +

      fila(
        "Equipos",
        (licencia.equipos ?? 0) +
        " de " +
        (licencia.max_equipos ?? 0)
      ) +

    "</div>";

  html +=
    '<p class="sub-title">Equipos registrados (' +
    equipos.length +
    ")</p>";

  html += equipos.length
    ? equipos.map((a) =>
        '<div class="activ">' +

          '<div class="activ__top">' +

            '<span class="activ__name">' +
              esc(
                a.nombre_equipo ||
                "Equipo sin nombre"
              ) +
            "</span>" +

            '<span class="badge ' +
              (a.activa
                ? "activa"
                : "cancelada") +
            '">' +
              (a.activa
                ? "Activo"
                : "Liberado") +
            "</span>" +

          "</div>" +

          '<p class="activ__id">' +
            esc(a.equipo_id) +
          "</p>" +

          '<div class="activ__foot">' +

            "<span>v" +
              esc(a.version_app || "---") +
              " - " +
              esc(
                fecha(
                  a.ultima_validacion,
                  true
                )
              ) +
            "</span>" +

            (
              a.activa
                ? '<button class="btn btn--sm btn--danger" ' +
                    'data-accion="liberar" ' +
                    'data-id="' +
                      a.id +
                    '">' +
                      "Liberar" +
                  "</button>"
                : ""
            ) +

          "</div>" +

        "</div>"
      ).join("")
    : '<div class="empty" style="padding:28px 8px">' +
        "<p>Ningun equipo ha activado esta licencia todavia.</p>" +
      "</div>";

  html += '<button class="btn btn--ghost" style="width:100%;justify-content:center;margin-top:8px" data-m="editar-licencia" data-id="' + licencia.id + '">Renovar / ajustar cupos</button>';

  $("drawerCodigo").textContent =
    licencia.codigo;

  $("drawerBody").innerHTML =
    html;

  mostrarDrawer(true);
}

/* ==================================================================
   Carga de datos
   ================================================================== */
async function cargar(opciones) {
  const silencioso =
    !!(opciones && opciones.silencioso);

  if (estado.cargando) return;

  estado.cargando = true;

  $("btnRefrescar").disabled = true;

  if (!silencioso) {
    skeletons();
  }

  try {
    if (estado.clave) {
      await iniciarSesionAdmin();
    }

    const [
      productos,
      clientes,
      licencias,
      activaciones
    ] = await Promise.all([
      api("/api/admin/productos"),
      api("/api/admin/clientes"),
      api("/api/admin/licencias"),
      api("/api/admin/activaciones")
    ]);

    estado.datos = {
      productos:
        productos.productos || [],

      clientes:
        clientes.clientes || [],

      licencias:
        licencias.licencias || [],

      activaciones:
        activaciones.activaciones || []
    };

    pintarKpis();
    pintarTabla();
    if (typeof Modulos !== "undefined") Modulos.pintar();

    if (estado.seleccionada !== null) {
      abrirDetalle(
        estado.seleccionada
      );
    }

    if (!silencioso) {
      toast(
        "ok",
        "Datos sincronizados",
        estado.datos.licencias.length +
        " licencias cargadas."
      );
    }

  } catch (error) {

    if (/no autoriz/i.test(error.message)) {

      if (!silencioso) toast("bad", "Sesion requerida", "Introduce la ADMIN_KEY para acceder al panel.");

      $("adminKey").focus();
      error.message = "Escribe la clave de administrador arriba y presiona Enter.";

    } else {

      toast(
        "bad",
        "Error de conexion",
        error.message
      );
    }

    if (!estado.datos.licencias.length) {

      $("tabla").innerHTML =
        '<tr><td colspan="7"><div class="empty">' +

          '<div class="empty__icon">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' +
              '<path d="M12 4l9 16H3l9-16z"/>' +
              '<path d="M12 10v4M12 17h.01"/>' +
            "</svg>" +
          "</div>" +

          "<h3>No se pudieron cargar los datos</h3>" +

          "<p>" +
            esc(error.message) +
          "</p>" +

        "</div></td></tr>";

      $("resumenTabla").textContent =
        "0 registros";
    }

  } finally {

    estado.cargando = false;

    $("btnRefrescar").disabled = false;
  }
}

/* ==================================================================
   Acciones
   ================================================================== */
async function cambiarEstado(
  id,
  nuevo,
  actual
) {
  if (
    nuevo === "SUSPENDIDA" &&
    !confirm(
      "Suspender la licencia?\n" +
      "Los equipos dejaran de validar al momento."
    )
  ) {
    return;
  }

  try {

    await api(
      "/api/admin/licencias/" +
      id +
      "/estado",
      {
        method: "PATCH",
        body: JSON.stringify({
          estado: nuevo
        })
      }
    );

    toast(
      "ok",
      "Licencia " +
        nuevo.toLowerCase(),
      "El estado cambio de " +
        actual +
        " a " +
        nuevo +
        "."
    );

    await cargar({
      silencioso: true
    });

  } catch (error) {

    toast(
      "bad",
      "No se pudo cambiar el estado",
      error.message
    );
  }
}

async function liberarEquipo(id) {
  if (
    !confirm(
      "Liberar este equipo? " +
      "Volvera a ocupar un cupo de la licencia."
    )
  ) {
    return;
  }

  try {

    await api(
      "/api/admin/activaciones/" +
      id +
      "/liberar",
      {
        method: "PATCH"
      }
    );

    toast(
      "ok",
      "Equipo liberado",
      "El cupo quedo disponible para otro equipo."
    );

    await cargar({
      silencioso: true
    });

  } catch (error) {

    toast(
      "bad",
      "No se pudo liberar",
      error.message
    );
  }
}

/* ==================================================================
   Modal - emitir nueva licencia
   ================================================================== */
function abrirModal() {
  const d = { productos: estado.datos.productos.filter((p) => p.activo !== false), clientes: estado.datos.clientes.filter((c) => c.activo !== false) };

  $("mProducto").innerHTML =
    d.productos.length
      ? d.productos
          .map(
            (p) =>
              '<option value="' +
              p.id +
              '">' +
              esc(p.nombre) +
              "</option>"
          )
          .join("")
      : '<option value="">Sin productos registrados</option>';

  $("mCliente").innerHTML =
    d.clientes.length
      ? d.clientes
          .map(
            (c) =>
              '<option value="' +
              c.id +
              '">' +
              esc(c.nombre) +
              "</option>"
          )
          .join("")
      : '<option value="">Sin clientes registrados</option>';

  $("modalError").hidden = true;
  $("modalNueva").hidden = false;
  $("mProducto").focus();
}

function cerrarModal() {
  $("modalNueva").hidden = true;
  $("formLicencia").reset();
}

async function guardarLicencia(evento) {
  evento.preventDefault();

  const boton =
    $("btnGuardarLicencia");

  const error =
    $("modalError");

  error.hidden = true;

  boton.disabled = true;
  boton.textContent = "Emitiendo...";

  try {

    const respuesta =
      await api(
        "/api/admin/licencias",
        {
          method: "POST",

          body: JSON.stringify({
            productoId:
              $("mProducto").value,

            clienteId:
              $("mCliente").value,

            tipo:
              $("mTipo").value,

            maxEquipos:
              Number(
                $("mEquipos").value
              ) || 1,

            fechaVencimiento:
              $("mVence").value ||
              null
          })
        }
      );

    cerrarModal();

    toast(
      "ok",
      "Licencia emitida",
      (
        respuesta.licencia &&
        respuesta.licencia.codigo
      ) ||
      "Se genero un nuevo codigo."
    );

    await cargar({
      silencioso: true
    });

  } catch (e) {

    error.textContent =
      e.message;

    error.hidden = false;

  } finally {

    boton.disabled = false;
    boton.textContent =
      "Emitir licencia";
  }
}

/* ==================================================================
   Eventos
   ================================================================== */
function initEventos() {

  $("adminKey").addEventListener(
    "input",
    (e) => {
      estado.clave =
        e.target.value.trim();
    }
  );

  $("adminKey").addEventListener(
    "keydown",
    (e) => {

      if (e.key === "Enter") {
        e.preventDefault();
        cargar();
      }

    }
  );

  $("btnVerClave").addEventListener(
    "click",
    () => {

      const campo =
        $("adminKey");

      campo.type =
        campo.type === "password"
          ? "text"
          : "password";
    }
  );

  $("btnRefrescar").addEventListener(
    "click",
    () => cargar()
  );

  $("btnNuevaLicencia").addEventListener("click", () => (typeof Modulos !== "undefined" ? Modulos.nuevo() : abrirModal()));

  $("btnCerrarModal").addEventListener(
    "click",
    cerrarModal
  );

  $("btnCancelarModal").addEventListener(
    "click",
    cerrarModal
  );

  $("mTipo").addEventListener(
    "change",
    () => {
      const tipo = $("mTipo").value;
      const campo = $("mVence");

      if (tipo === "PERPETUA") {
        campo.value = "";
        campo.disabled = true;
        return;
      }

      const fecha = new Date();

      if (tipo === "ANUAL") {
        fecha.setFullYear(fecha.getFullYear() + 1);
      } else if (tipo === "TRIMESTRAL") {
        fecha.setMonth(fecha.getMonth() + 3);
      } else if (tipo === "MENSUAL") {
        fecha.setMonth(fecha.getMonth() + 1);
      }

      const yyyy = fecha.getFullYear();
      const mm = String(fecha.getMonth() + 1).padStart(2, "0");
      const dd = String(fecha.getDate()).padStart(2, "0");

      campo.value = `${yyyy}-${mm}-${dd}`;
      campo.disabled = false;
    }
  );

  $("formLicencia").addEventListener(
    "submit",
    guardarLicencia
  );

  $("modalNueva").addEventListener(
    "click",
    (e) => {
      if (
        e.target ===
        $("modalNueva")
      ) {
        cerrarModal();
      }
    }
  );

  $("scrim").addEventListener(
    "click",
    () => mostrarDrawer(false)
  );

  $("btnCerrarDrawer").addEventListener(
    "click",
    () => mostrarDrawer(false)
  );

  $("buscar").addEventListener(
    "input",
    (e) => {
      estado.busqueda =
        e.target.value;

      pintarTabla();
    }
  );

  $("filtros").addEventListener(
    "click",
    (e) => {

      const boton =
        e.target.closest(".seg__btn");

      if (!boton) return;

      $("filtros")
        .querySelectorAll(".seg__btn")
        .forEach((b) =>
          b.classList.remove("is-active")
        );

      boton.classList.add(
        "is-active"
      );

      estado.filtro =
        boton.dataset.estado;

      pintarTabla();
    }
  );

  document
    .querySelectorAll("th.sortable")
    .forEach((th) => {

      th.addEventListener(
        "click",
        () => {

          const col =
            th.dataset.col;

          document
            .querySelectorAll(
              "th.sortable"
            )
            .forEach((t) =>
              t.classList.remove(
                "asc",
                "desc"
              )
            );

          const misma =
            estado.orden.columna ===
            col;

          estado.orden = {
            columna: col,
            direccion:
              misma
                ? -estado.orden.direccion
                : 1
          };

          th.classList.add(
            misma &&
            estado.orden.direccion === 1
              ? "asc"
              : "desc"
          );

          pintarTabla();
        }
      );
    });

  document.addEventListener(
    "click",
    async (e) => {

      const boton =
        e.target.closest(
          "[data-accion]"
        );

      if (boton) {

        e.stopPropagation();

        const id =
          Number(
            boton.dataset.id
          );

        if (
          boton.dataset.accion ===
          "estado"
        ) {

          await cambiarEstado(
            id,
            boton.dataset.nuevo,
            boton.dataset.actual
          );

        } else if (
          boton.dataset.accion ===
          "liberar"
        ) {

          await liberarEquipo(id);

        } else if (
          boton.dataset.accion ===
          "detalle"
        ) {

          abrirDetalle(id);
        }

        return;
      }

      const fila =
        e.target.closest(
          "#tabla tr[data-id]"
        );

      if (fila) {
        abrirDetalle(
          Number(fila.dataset.id)
        );
      }
    }
  );

  $("tabla").addEventListener(
    "keydown",
    (e) => {

      if (
        e.key !== "Enter" &&
        e.key !== " "
      ) {
        return;
      }

      const fila =
        e.target.closest(
          "tr[data-id]"
        );

      if (!fila) return;

      e.preventDefault();

      abrirDetalle(
        Number(fila.dataset.id)
      );
    }
  );

  $("sidebar").addEventListener(
    "click",
    (e) => {

      const enlace =
        e.target.closest(
          ".nav__item[data-section]"
        );

      if (!enlace) return;

      document
        .querySelectorAll(
          ".nav__item[data-section]"
        )
        .forEach((a) =>
          a.classList.remove(
            "is-active"
          )
        );

      enlace.classList.add(
        "is-active"
      );

      $("sidebar").classList.remove(
        "is-open"
      );

      Modulos.ir(enlace.dataset.section);
    }
  );

  $("btnMenu").addEventListener(
    "click",
    () =>
      $("sidebar").classList.toggle(
        "is-open"
      )
  );

  document.addEventListener(
    "keydown",
    (e) => {

      if (e.key === "Escape") {

        if (
          !$("modalNueva").hidden
        ) {
          cerrarModal();

        } else if (
          $("drawer")
            .classList
            .contains("is-open")
        ) {
          mostrarDrawer(false);
        }
      }

      const escribiendo = document.activeElement.matches("input,select,textarea");

      if (
        e.key === "/" &&
        !escribiendo
      ) {
        e.preventDefault();
        (document.querySelector(".view:not([hidden]) input[type=search]") || $("buscar")).focus();
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "r"
      ) {
        e.preventDefault();
        cargar();
      }
    }
  );
}

/* ==================================================================
   Arranque
   ================================================================== */
function init() {
  initEventos();
  iniciarReloj();
  skeletons();
  consultarSalud();
  cargar({ silencioso: true });

  $("sbRefresco").textContent =
    REFRESH_MS / 1000 + "s";

  setInterval(() => {
    consultarSalud();
    if (document.visibilityState === "visible" && estado.datos.licencias.length) cargar({ silencioso: true });
  }, REFRESH_MS);

  setTimeout(
    () => $("adminKey").focus(),
    120
  );
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
