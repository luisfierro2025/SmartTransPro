# Compilar el instalador de SmartPosPro

El instalador es un **NSIS (.exe)** que se genera con `electron-builder` a partir del
código ya compilado por TypeScript. No hay ningún paso manual extra.

## Uso rápido

```bat
herramientas\compilar-instalador.cmd
```

El instalador queda en:

```
D:\SmartPosPro\installer\SmartPosPro Setup <version>.exe
```

## Qué hace el script

1. `npm run build` → compila `src/**/*.ts` a JavaScript (ESM) y el `preload` aparte
   en CommonJS (obligatorio porque el preload corre con `sandbox: true`).
2. `npm run icon` → regenera `build\icon.png` y `build\icon.ico` (ícono propio de la
   aplicación, no el de Electron).
3. `electron-builder --win nsis` → empaqueta en `installer\win-unpacked` y compila el
   instalador NSIS.

## Por qué el script fija TEMP/TMP

`makensis` (el compilador de NSIS) necesita espacio temporal para montar en memoria el
instalador completo (~120 MB). En este equipo la unidad **C: está casi llena**, y con
`TEMP` apuntando a `C:\Users\...\AppData\Local\Temp` el build falla con:

```
Internal compiler error #12345: error creating mmap the size of 125863989.
```

El script redirige `TEMP` y `TMP` a `D:\_temp-build` antes de compilar, que es donde hay
espacio. Si cambia la unidad con espacio, edite la línea `CARPETA_TEMPORAL` del `.cmd`.

## Dónde quedan los datos del usuario

La base de datos **no** viaja dentro del instalador. Al arrancar, la app crea y usa:

```
%APPDATA%\SmartPosPro\pos.db
```

Eso significa que reinstalar o actualizar SmartPosPro **no borra** los datos, y que
desinstalarlo tampoco (`deleteAppDataOnUninstall: false` en `package.json`).

Para respaldar, use el botón de respaldo dentro de la app (Reportes / Configuración) o
simplemente copie ese archivo `pos.db`.

## Notas

- El instalador queda **sin firmar digital**. Windows SmartScreen mostrará el aviso
  "Windows Protegió su PC" la primera vez; hay que pulsar *Más información* →
  *Ejecutar de todas formas*. Firmarlo con un certificado de code signing elimina ese aviso.
- La instalación es **por usuario** (no pide permisos de administrador) y deja acceso
  directo en el Escritorio y en el Menú Inicio.
- Para regenerar desde cero (borra `installer\` antes de compilar):
  `node tools\limpiar-dist.cjs installer`
- Antes de distribuirlor, conviene ejecutar la prueba de humo sobre el ejecutable
  empaquetado: `node tools\verificar-empaquetado.cjs`
