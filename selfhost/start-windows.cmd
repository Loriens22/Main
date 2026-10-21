@echo off
rem Maverick Bot: double-click this file to start your own server on Windows.
rem It runs start.ps1 with PowerShell. Keep the window open to read the address and code.
if not exist "%~dp0start.ps1" (
  echo Please extract the ZIP file first: right-click it and choose "Extract All...",
  echo then open the extracted folder and double-click selfhost\start-windows there.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
set "MAVERICK_EXIT=%ERRORLEVEL%"
if not defined CI pause
exit /b %MAVERICK_EXIT%
