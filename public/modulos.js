/* ALIS SOFTWARE LICENSING - Módulos: Clientes, Activaciones, Productos, Auditoría
   Reutiliza $, api, toast, esc, fecha, estado y cargar() de app.js */
"use strict";

const Modulos = (() => {
  const VISTAS = {
    licencias: { t: "Centro de Licencias", s: "Administracion de productos, clientes, licencias y activaciones", nuevo: "Nueva licencia" },
    clientes: { t: "Clientes", s: "Empresas y personas a quienes se emiten licencias", nuevo: "Nuevo cliente" },
    activaciones: { t: "Activaciones", s: "Equipos que han validado una licencia", nuevo: null },
    productos: { t: "Productos", s: "Catalogo de software licenciable", nuevo: "Nuevo producto" },
    auditoria: { t: "Auditoria", s: "Registro de acciones administrativas y activaciones", nuevo: null }
  };
  const TIPOS = ["ANUAL", "MENSUAL", "TRIMESTRAL", "PERPETUA"];
  const f = { clientes: { q: "" }, activaciones: { q: "", e: "TODOS" }, productos: { q: "" }, auditoria: { q: "", e: "TODOS" } };
  let actual = "licencias", montado = false, registros = [], cfg = null;

  /* ------------------------------ helpers ------------------------------ */
  const coincide = (q, ...v) => !q || v.some((x) => String(x ?? "").toLowerCase().includes(q));
  const badge = (ok, si = "Activo", no = "Inactivo") => `<span class="badge ${ok ? "activa" : "cancelada"}">${ok ? si : no}</span>`;
  const vacio = (n, t, p = "") => `<tr><td colspan="${n}"><div class="empty"><h3>${esc(t)}</h3>${p ? `<p>${esc(p)}</p>` : ""}</div></td></tr>`;
  const btn = (cls, m, id, txt) => `<button class="btn btn--sm ${cls}" data-m="${m}" data-id="${id}" type="button">${txt}</button>`;
  const fila = (celdas) => `<tr>${celdas.map((c) => `<td${c.cls ? ` class="${c.cls}"` : ""}>${c.h}</td>`).join("")}</tr>`;
  const dos = (a, b) => `<div class="cell-main">${esc(a)}</div><div class="cell-sub">${esc(b)}</div>`;
  const acciones = (...b) => ({ cls: "actions", h: `<div>${b.join("")}</div>` });
  const resumen = (v, n, total, nom) => ($(`rs-${v}`).textContent = n === total ? `${total} ${nom} en total` : `Mostrando ${n} de ${total} ${nom}`);
  const claseAccion = (a) => (/RECHAZ|FALLID/.test(a) ? "cancelada" : /LIBERAR|DESACTIV|SUSPEND/.test(a) ? "suspendida" : /LOGOUT/.test(a) ? "neutra" : "activa");

  /* ------------------------------ montaje ------------------------------ */
  const seg = (v, ops) => `<div class="seg" data-seg="${v}" role="group">${ops.map(([k, l], i) => `<button class="seg__btn${i ? "" : " is-active"}" data-v="${k}" type="button">${l}</button>`).join("")}</div>`;
  const lupa = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.6-3.6"/></svg>';

  function montar() {
    if (montado) return;
    const defs = [
      ["clientes", "Clientes registrados", "Datos de contacto y licencias emitidas por cliente.", "", ["Cliente", "Identificacion", "Contacto", "Licencias", "Estado", "Acciones"]],
      ["activaciones", "Equipos activados", "Cada equipo que ha validado una licencia, con su ultima conexion.", seg("activaciones", [["TODOS", "Todos"], ["ACTIVA", "Activos"], ["LIBERADA", "Liberados"]]), ["Equipo", "Licencia", "Cliente", "Version", "Ultima validacion", "Estado", "Acciones"]],
      ["productos", "Catalogo de productos", "Software que puede licenciarse. Desactivar un producto bloquea nuevas activaciones.", "", ["Producto", "Descripcion", "Licencias", "Estado", "Acciones"]],
      ["auditoria", "Registro de auditoria", "Ultimas 300 acciones: administracion, sesiones y activaciones de equipos.", seg("auditoria", [["TODOS", "Todo"], ["licencia", "Licencias"], ["cliente", "Clientes"], ["producto", "Productos"], ["activacion", "Equipos"], ["sesion", "Sesiones"]]), ["Fecha", "Accion", "Entidad", "Detalle", "IP"]]
    ];
    $("content").insertAdjacentHTML("beforeend", defs.map(([v, t, d, s, cols]) =>
      `<section class="panel view view--tabla" id="v-${v}" hidden>
        <div class="panel__head"><div><h2>${t}</h2><p class="panel__desc">${d}</p></div>
          <div class="panel__tools"><div class="search">${lupa}<input data-buscar="${v}" type="search" placeholder="Buscar..." aria-label="Buscar"></div>${s}</div></div>
        <div class="table-wrap"><table class="table"><thead><tr>${cols.map((c) => `<th${c === "Acciones" ? ' class="th-actions"' : ""}>${c}</th>`).join("")}</tr></thead><tbody id="tb-${v}"></tbody></table></div>
        <div class="panel__foot"><span id="rs-${v}">&mdash;</span></div>
      </section>`).join(""));
    montado = true;
    pintar();
  }

  /* ------------------------------- vistas ------------------------------- */
  function pClientes() {
    const { q } = f.clientes, all = estado.datos.clientes, l = all.filter((c) => coincide(q, c.nombre, c.identificacion, c.telefono, c.correo));
    $("tb-clientes").innerHTML = l.length ? l.map((c) => fila([
      { h: `<div class="cell-main">${esc(c.nombre)}</div>` }, { h: esc(c.identificacion || "---") },
      { h: dos(c.telefono || "---", c.correo || "---") }, { h: c.licencias ?? 0 }, { h: badge(c.activo) },
      acciones(btn(c.activo ? "btn--danger" : "btn--ok", "toggle-cliente", c.id, c.activo ? "Desactivar" : "Activar"), btn("btn--ghost", "editar-cliente", c.id, "Editar"))
    ])).join("") : vacio(6, q ? "Sin resultados" : "Aun no hay clientes", q ? "" : 'Registra el primero con el boton "Nuevo cliente".');
    resumen("clientes", l.length, all.length, "clientes");
  }

  function pActiv() {
    const { q, e } = f.activaciones, all = estado.datos.activaciones;
    const l = all.filter((a) => (e === "TODOS" || (e === "ACTIVA") === !!a.activa) && coincide(q, a.nombre_equipo, a.equipo_id, a.licencia, a.cliente, a.producto));
    $("tb-activaciones").innerHTML = l.length ? l.map((a) => fila([
      { h: dos(a.nombre_equipo || "Equipo sin nombre", a.equipo_id) },
      { h: `<span class="code">${esc(a.licencia)}</span><div class="cell-sub">${esc(a.producto)}</div>` },
      { h: esc(a.cliente) }, { h: "v" + esc(a.version_app || "---") },
      { h: `<div>${esc(fecha(a.ultima_validacion, true))}</div><div class="cell-sub">Primera: ${esc(fecha(a.primera_activacion))}</div>` },
      { h: badge(a.activa, "Activo", "Liberado") },
      acciones(a.activa ? `<button class="btn btn--sm btn--danger" data-accion="liberar" data-id="${a.id}" type="button">Liberar</button>` : "")
    ])).join("") : vacio(7, q || e !== "TODOS" ? "Sin resultados" : "Ningun equipo ha activado licencias", "");
    resumen("activaciones", l.length, all.length, "equipos");
  }

  function pProductos() {
    const { q } = f.productos, all = estado.datos.productos, l = all.filter((p) => coincide(q, p.nombre, p.codigo, p.descripcion));
    $("tb-productos").innerHTML = l.length ? l.map((p) => fila([
      { h: `<div class="cell-main">${esc(p.nombre)}</div><div class="cell-sub mono">${esc(p.codigo)}</div>` },
      { cls: "cell-trunc", h: esc(p.descripcion || "---") }, { h: p.licencias ?? 0 }, { h: badge(p.activo) },
      acciones(btn(p.activo ? "btn--danger" : "btn--ok", "toggle-producto", p.id, p.activo ? "Desactivar" : "Activar"), btn("btn--ghost", "editar-producto", p.id, "Editar"))
    ])).join("") : vacio(5, q ? "Sin resultados" : "Aun no hay productos", q ? "" : 'Agrega el primero con el boton "Nuevo producto".');
    resumen("productos", l.length, all.length, "productos");
  }

  function pAudit() {
    const { q, e } = f.auditoria;
    const l = registros.filter((r) => (e === "TODOS" || r.entidad === e) && coincide(q, r.accion, r.entidad, r.entidad_id, JSON.stringify(r.detalle), r.ip));
    $("tb-auditoria").innerHTML = l.length ? l.map((r) => fila([
      { h: esc(fecha(r.fecha, true)) }, { h: `<span class="badge ${claseAccion(r.accion)}">${esc(r.accion.replaceAll("_", " "))}</span>` },
      { h: `${esc(r.entidad)}${r.entidad_id ? ` <span class="cell-sub mono">#${esc(r.entidad_id)}</span>` : ""}` },
      { cls: "detalle", h: esc(Object.entries(r.detalle || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "---") },
      { h: `<span class="mono">${esc(r.ip || "---")}</span>` }
    ])).join("") : vacio(5, q || e !== "TODOS" ? "Sin resultados" : "Aun no hay registros", "");
    resumen("auditoria", l.length, registros.length, "registros");
  }

  async function cargarAudit() {
    try { registros = (await api("/api/admin/auditoria?limite=300")).registros || []; pAudit(); }
    catch (e) { $("tb-auditoria").innerHTML = vacio(5, "No se pudo cargar la auditoria", e.message); }
  }

  function pintar() {
    if (!montado) return;
    pClientes(); pActiv(); pProductos();
    if (actual === "auditoria") cargarAudit();
  }

  function ir(s) {
    actual = VISTAS[s] ? s : "licencias";
    document.querySelectorAll(".view").forEach((v) => (v.hidden = v.id !== "v-" + actual));
    const v = VISTAS[actual], b = $("btnNuevaLicencia");
    $("pageTitle").textContent = v.t;
    $("pageSubtitle").textContent = v.s;
    b.hidden = !v.nuevo;
    if (v.nuevo) b.querySelector("span").textContent = v.nuevo;
    $("content").scrollTop = 0;
    if (actual === "auditoria") cargarAudit(); else pintar();
  }

  /* ----------------------------- formularios ----------------------------- */
  function formulario(c) {
    cfg = c;
    const v = c.valores || {};
    $("mfTitulo").textContent = c.titulo;
    $("mfGuardar").textContent = c.boton || "Guardar";
    $("mfError").hidden = true;
    $("mfCampos").innerHTML = c.campos.map((k) => `<label class="field"><span>${k.l}${k.req ? "" : " <em>(opcional)</em>"}</span>` + (k.op
      ? `<select name="${k.k}">${k.op.map(([o, t]) => `<option value="${esc(o)}"${String(v[k.k] ?? "") === String(o) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`
      : `<input name="${k.k}" type="${k.tipo || "text"}" value="${esc(v[k.k] ?? "")}"${k.req ? " required" : ""}${k.min ? ` min="${k.min}"` : ""}${k.max ? ` maxlength="${k.max}"` : ""}${k.ro ? " readonly" : ""}${k.ph ? ` placeholder="${k.ph}"` : ""}>`) + "</label>").join("");
    $("modalForm").hidden = false;
    $("mfCampos").querySelector("input:not([readonly]),select")?.focus();
  }

  const cerrarForm = () => { $("modalForm").hidden = true; cfg = null; };
  const enviar = (url, metodo, cuerpo) => api(url, { method: metodo, body: JSON.stringify(cuerpo) });

  async function alternar(url, cuerpo, msg, conf) {
    if (conf && !confirm(conf)) return;
    try { await enviar(url, "PATCH", cuerpo); toast("ok", msg); await cargar({ silencioso: true }); }
    catch (e) { toast("bad", "No se pudo completar", e.message); }
  }

  const CAMPOS_CLIENTE = [
    { k: "nombre", l: "Nombre", req: 1, max: 180 }, { k: "identificacion", l: "Identificacion (RUC / cedula)", max: 80 },
    { k: "telefono", l: "Telefono", tipo: "tel", max: 50 }, { k: "correo", l: "Correo", tipo: "email", max: 180 }
  ];
  const CAMPOS_PRODUCTO = [{ k: "nombre", l: "Nombre", req: 1, max: 120 }, { k: "descripcion", l: "Descripcion" }];
  const buscar = (lista, id) => lista.find((x) => Number(x.id) === id);

  const ACCIONES = {
    "editar-cliente": (id) => formulario({ titulo: "Editar cliente", campos: CAMPOS_CLIENTE, valores: buscar(estado.datos.clientes, id), ok: "Cliente actualizado", enviar: (d) => enviar(`/api/admin/clientes/${id}`, "PATCH", d) }),
    "toggle-cliente": (id) => { const c = buscar(estado.datos.clientes, id); if (c) alternar(`/api/admin/clientes/${id}`, { activo: !c.activo }, c.activo ? "Cliente desactivado" : "Cliente activado", c.activo && "Desactivar cliente?\nSus licencias dejaran de validar equipos."); },
    "editar-producto": (id) => { const p = buscar(estado.datos.productos, id); formulario({ titulo: "Editar producto", campos: [{ k: "codigo", l: "Codigo", req: 1, ro: 1 }, ...CAMPOS_PRODUCTO], valores: p, ok: "Producto actualizado", enviar: (d) => enviar(`/api/admin/productos/${id}`, "PATCH", d) }); },
    "toggle-producto": (id) => { const p = buscar(estado.datos.productos, id); if (p) alternar(`/api/admin/productos/${id}`, { activo: !p.activo }, p.activo ? "Producto desactivado" : "Producto activado", p.activo && "Desactivar producto?\nSus licencias dejaran de validar equipos."); },
    "editar-licencia": (id) => {
      const l = buscar(estado.datos.licencias, id);
      if (l) formulario({
        titulo: "Renovar / ajustar " + l.codigo, ok: "Licencia actualizada",
        campos: [{ k: "tipo", l: "Tipo", req: 1, op: TIPOS.map((t) => [t, t]) }, { k: "maxEquipos", l: "Max. equipos", req: 1, tipo: "number", min: 1 }, { k: "fechaVencimiento", l: "Vencimiento", tipo: "date" }],
        valores: { tipo: l.tipo, maxEquipos: l.max_equipos, fechaVencimiento: String(l.fecha_vencimiento || "").slice(0, 10) },
        enviar: (d) => enviar(`/api/admin/licencias/${id}`, "PATCH", d)
      });
    }
  };

  function nuevo() {
    if (actual === "clientes") return formulario({ titulo: "Nuevo cliente", campos: CAMPOS_CLIENTE, boton: "Registrar cliente", ok: "Cliente registrado", enviar: (d) => enviar("/api/admin/clientes", "POST", d) });
    if (actual === "productos") return formulario({ titulo: "Nuevo producto", campos: [CAMPOS_PRODUCTO[0], { k: "codigo", l: "Codigo", req: 1, max: 50, ph: "SMARTPOSPRO" }, CAMPOS_PRODUCTO[1]], boton: "Crear producto", ok: "Producto creado", enviar: (d) => enviar("/api/admin/productos", "POST", d) });
    abrirModal();
  }

  /* ------------------------------- eventos ------------------------------- */
  document.addEventListener("DOMContentLoaded", () => {
    montar();

    $("mfCerrar").addEventListener("click", cerrarForm);
    $("mfCancelar").addEventListener("click", cerrarForm);
    $("modalForm").addEventListener("click", (e) => { if (e.target === $("modalForm")) cerrarForm(); });

    $("mfForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!cfg) return;
      const b = $("mfGuardar"), er = $("mfError"), c = cfg;
      er.hidden = true; b.disabled = true;
      try { await c.enviar(Object.fromEntries(new FormData(e.target))); cerrarForm(); toast("ok", c.ok); await cargar({ silencioso: true }); }
      catch (x) { er.textContent = x.message; er.hidden = false; }
      finally { b.disabled = false; }
    });

    document.addEventListener("input", (e) => {
      const v = e.target.dataset?.buscar;
      if (!v) return;
      f[v].q = e.target.value.trim().toLowerCase();
      ({ clientes: pClientes, activaciones: pActiv, productos: pProductos, auditoria: pAudit })[v]();
    });

    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-seg] .seg__btn");
      if (g) {
        const cont = g.parentElement, v = cont.dataset.seg;
        cont.querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b === g));
        f[v].e = g.dataset.v;
        return v === "activaciones" ? pActiv() : pAudit();
      }
      const a = e.target.closest("[data-m]");
      if (a) ACCIONES[a.dataset.m]?.(Number(a.dataset.id));
    });

    // Esc cierra primero el formulario (queda encima del panel de detalle)
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("modalForm").hidden) { e.stopPropagation(); cerrarForm(); }
    }, true);
  });

  return { ir, pintar, nuevo };
})();
