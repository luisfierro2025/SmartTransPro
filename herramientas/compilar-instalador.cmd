@echo off
REM ===========================================================================
REM  Compila el instalador de SmartPosPro (NSIS) en Windows.
REM
REM  electron-builder -> 7z -> NSIS (makensis)
REM
REM  makensis necesita espacio temporal suficiente. En equipos con la unidad C:
REM  casi llena falla con "Internal compiler error #12345: error creating mmap",
REM  por eso este script dirige TEMP/TMP a una carpeta con espacio antes de
REM  compilar. Para cambiar el destino, edite CARPETA_TEMPORAL.
REM
REM  Uso:  herramientas\compilar-instalador.cmd   [carpeta de salida]
REM ===========================================================================
setlocal

set "RAIZ=%~dp0.."
set "CARPETA_TEMPORAL=D:\_temp-build"
if not exist "%CARPETA_TEMPORAL%" mkdir "%CARPETA_TEMPORAL%"

set "TEMP=%CARPETA_TEMPORAL%"
set "TMP=%CARPETA_TEMPORAL%"

cd /d "%RAIZ%"

echo === SmartPosPro: generando el instalador ===
echo    temporalNSIS : %TEMP%
echo    salida       : %~1
echo.

call npm run build || goto :error
call npm run icon || goto :error

if "%~1"=="" (
  call npx electron-builder --win nsis
) else (
  call npx electron-builder --win nsis --config.directories.output="%~1"
)

if errorlevel 1 goto :error

echo.
echo === Listo. El instalador esta en:
dir /b "%RAIZ%\installer\*.exe"
endlocal
exit /b 0

:error
echo.
echo === ERROR: la compilacion fallo. Revisa el mensaje de arriba.
endlocal
exit /b 1
