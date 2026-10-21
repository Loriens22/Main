# Maverick Bot: stop your own server on Windows. Double-click stop.cmd (it runs this file).
# Projects, chats and paired phones are kept for the next start.
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
Write-Host 'Maverick server stopped. Your projects, chats and paired phones are kept.'
Write-Host 'Start it again with start.cmd (it will get a new address).'
exit 0
