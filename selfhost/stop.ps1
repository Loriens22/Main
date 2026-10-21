# Maverick Bot: stop your own server on Windows. Double-click stop-windows.cmd (it runs this file).
# Projects and chats are kept for the next start.
# Works with Windows PowerShell 5.1 and PowerShell 7. Keep this file ASCII-only.

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host 'Docker is not installed, so the server is not running.'
  exit 0
}
docker compose down
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Could not stop the server. Is Docker Desktop running?' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host 'Maverick server stopped. Your projects and chats are kept.'
Write-Host 'Start it again with start-windows. It gets a new address, so sign out in the app'
Write-Host '(Settings > Sign out this device) and pair again with the new address and the same code.'
exit 0
