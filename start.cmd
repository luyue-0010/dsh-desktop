@echo off
rem ---------------------------------------------------------------------------
rem DeepSeek Harness Desktop launcher (double-click friendly).
rem Boots the Electron shell, which starts its own `dsh web` server on a free
rem loopback port and wraps the browser GUI in a desktop window.
rem ---------------------------------------------------------------------------
setlocal
set "ROOT=%~dp0"
set "ELECTRON=%ROOT%node_modules\electron\dist\electron.exe"

if not exist "%ELECTRON%" (
  echo [DeepSeek Harness] Electron is not installed yet.
  echo Run this once in the project folder:
  echo     npm install
  echo.
  pause
  exit /b 1
)

if "%DSH_HOME%"=="" (
  echo [DeepSeek Harness] DSH_HOME is not set; dsh will use the default ^(~/.dsh^).
)

"%ELECTRON%" "%ROOT%."
exit /b %ERRORLEVEL%
