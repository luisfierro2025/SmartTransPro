# Control Empresa

Aplicación de escritorio instalable para Windows.

Tecnologías: Electron, Node.js, SQLite, HTML/CSS/JavaScript.

## Ejecutar

Instalar Node.js LTS, abrir esta carpeta en Visual Studio Code y ejecutar:

npm install
npm start

## Crear instalador

npm run build

El instalador quedará en `dist/`.

La base de datos se guarda en la carpeta de datos de usuario de Windows.

## Acceso al sistema (usuarios y login)

La aplicación pide usuario y contraseña al abrir. **No hay credenciales de
fábrica**: la primera vez que se abre (con la base recién creada) aparece la
**Configuración inicial**, donde usted escribe su empresa, su nombre, el usuario
que quiere usar y la contraseña que quiera ponerle. Al confirmar, esa cuenta
queda como administrador y se entra de inmediato.

Esa pantalla solo aparece una vez: después, al abrir el sistema se muestra el
formulario de acceso normal. Si cambia de equipo o reinstala, la base conserva
sus cuentas.

### Roles

| Rol | Puede hacer |
| --- | --- |
| `ADMIN` | Todo, incluido el módulo **Usuarios** y el borrado de información. |
| `OPERADOR` | Opera el sistema, pero no administra cuentas de usuario. |
| `CONSULTA` | Solo consulta la información registrada. |

El sidebar oculta los módulos que el rol no puede abrir, y el servidor vuelve a
comprobar el permiso en cada llamada: ocultar el botón no es la protección.
No se puede desactivar, degradar ni eliminar **al único administrador activo**,
para que el sistema nunca quede sin nadie que pueda administrarlo.

### Módulo Usuarios

Crear, editar, activar/desactivar y eliminar cuentas, además de restablecer la
contraseña de alguien que la olvidó. El botón **Cerrar sesión** del pie del
sidebar cierra la sesión en el servidor y devuelve a la pantalla de acceso.

### Cómo se guardan las credenciales

- La **contraseña nunca se guarda**: se almacena su hash `scrypt` con una sal
  por usuario, y la comparación se hace en tiempo constante.
- El **token de sesión tampoco**: en la tabla `sesiones` se guarda su SHA-256.
  Quien lea el archivo de la base no puede suplantar a nadie con ese valor.
- La sesión vence a las 12 horas (`CONTROL_EMPRESA_HORAS_SESION` lo ajusta) y
  se renueva cada vez que se abre la aplicación.
- Un usuario desactivado, o al que se le cambie la contraseña, ve cerradas
  automáticamente sus sesiones abiertas.
- Si a un usuario se le **restablece** la contraseña desde el módulo Usuarios,
  el sistema le avisa al próximo ingreso y le pide cambiarla.

Las tablas son `usuarios` y `sesiones`: en SQLite las crea
`src/main/database.js`, y en la nube están en
`supabase/migrations/0005_usuarios_sesiones.sql`. Si la base de la nube fuera
anterior, el servidor las crea al arrancar.

## Base de datos en la nube (Supabase)

La versión web usa PostgreSQL (Supabase) en lugar de SQLite.

1. Copiar `.env.example` a `.env` y pegar la cadena `DATABASE_URL` de Supabase.
2. Aplicar las migraciones (una vez, y cada vez que se agregue un archivo nuevo
   en `supabase/migrations`):

```
npm run db:migraciones
```

3. Levantar la versión web (interfaz + API en `http://localhost:3000`):

```
npm run dev:nube
```

Las migraciones se registran en la tabla `migraciones_aplicadas`, así que el
comando solo ejecuta las pendientes. Al arrancar, el servidor verifica además
que la base tenga las columnas que el código espera y las agrega si faltan.

## Comisiones de conductores

Está en la pestaña **Comisiones** de *Planilla, Viáticos y Comisiones*. Cada comisión
se calcula según su tipo:

| Tipo | Cómo se calcula el monto |
| --- | --- |
| `PORCENTAJE` | `base_calculo × valor_calculo / 100` (porcentaje del flete) |
| `POR_KM` | `base_calculo × valor_calculo` (kilómetros recorridos × tarifa) |
| `FIJO` | `valor_calculo` (monto fijo) |

- **+ Registrar Comisión**: registra la comisión de un viaje. El porcentaje sobre el
  flete se captura a mano, porque Bitácora no guarda el monto de cada flete.
- **Generar del período**: crea una comisión por conductor con los viajes de Bitácora
  del período (por kilómetro o monto fijo). Si el conductor ya tiene comisión en ese
  período se omite, para no duplicar el pago.
- **Pagar** y **Pagar pendientes**: la ficha muestra a quién se le paga y queda como
  comprobante. "Pagar pendientes" liquida de una sola vez todo lo que se le debe a un
  conductor dentro del filtro de fechas o del período.

La tabla `comisiones` la crea `supabase/migrations/0003_comisiones.sql`; si la base en
la nube es anterior a esa migración, el servidor la crea al arrancar.

## Comprobar

```
npm test          # base de datos, capa de nube y los 60 canales de la API
npm run test:ui   # recorre la interfaz real y verifica que los pagos se guarden
```

`test:ui` abre la aplicación con una base temporal y recorre las dos rutas de pago de
las comisiones (la ficha individual de la tabla y la liquidación por conductor),
comprobando después contra la base que efectivamente quedaron pagadas.

