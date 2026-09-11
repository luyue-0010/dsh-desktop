@echo off
rem Double-click friendly wrapper for scripts\push-to-github.ps1
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" %*
echo.
pause
