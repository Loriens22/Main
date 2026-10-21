@echo off
rem Maverick Bot: double-click this file to stop your own server on Windows.
rem Projects and chats are kept for the next start.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop.ps1"
set "MAVERICK_EXIT=%ERRORLEVEL%"
if not defined CI pause
exit /b %MAVERICK_EXIT%
