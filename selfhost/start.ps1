# Maverick Bot: start your own server on Windows. No account is needed.
#
# Double-click start.cmd (it runs this file), or in PowerShell:
#   powershell -ExecutionPolicy Bypass -File start.ps1
#
# The first run takes 5-15 minutes because it builds the server. Run it again at any time:
# it keeps your access code and prints the current address. Stop the server with stop.cmd.
# Works with Windows PowerShell 5.1 and PowerShell 7. Keep this file ASCII-only: Windows
# PowerShell 5.1 misreads other characters in files without a byte order mark.

$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$line = '=' * 70
$envFile = Join-Path $PSScriptRoot '.env'

function Say([string]$Message) {
  Write-Host ''
  Write-Host ">> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "ERROR: $Message" -ForegroundColor Red
  Write-Host ''
  exit 1
}

function Test-Docker {
  docker info > $null 2>&1
  return ($LASTEXITCODE -eq 0)
}

# Runs curl inside the core container, so nothing extra is needed on this computer.
function Invoke-InCore([string]$Url, [int]$Seconds = 10) {
  $out = docker compose exec -T core curl -fsS -m $Seconds $Url 2> $null
  if ($LASTEXITCODE -ne 0) { return '' }
  return (($out | Out-String).Trim())
}

function New-RandomText([int]$Length, [string]$Alphabet) {
  # The alphabet length divides 256, so every character is equally likely.
  $bytes = New-Object byte[] $Length
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  $chars = foreach ($b in $bytes) { $Alphabet[$b % $Alphabet.Length] }
  return (-join $chars)
}

function Get-EnvValue([string]$Name) {
  $value = ''
  foreach ($l in [System.IO.File]::ReadAllLines($envFile)) {
    if ($l -match ('^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*?)\s*$')) {
      $value = $Matches[1].Trim([char[]]@('"', "'"))
    }
  }
  return $value
}

# ---------- 1. Docker ----------
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host ''
  Write-Host 'Docker is not installed. It is free and needs no account:' -ForegroundColor Yellow
  Write-Host '  1. Download Docker Desktop: https://www.docker.com/products/docker-desktop/'
  Write-Host '  2. Install it (restart Windows if it asks), open it once and click Accept.'
  Write-Host '     You can skip signing in.'
  Write-Host '  3. Double-click start.cmd again.'
  Write-Host ''
  exit 1
}

if (-not (Test-Docker)) {
  $candidates = @()
  if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe' }
  if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker\Docker Desktop.exe' }
  $desktop = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if ($desktop) {
    Say 'Starting Docker Desktop (this can take a minute or two) ...'
    Start-Process -FilePath $desktop
    for ($i = 0; $i -lt 60; $i++) {
      Start-Sleep -Seconds 3
      if (Test-Docker) { break }
    }
  }
}
if (-not (Test-Docker)) {
  Write-Host ''
  Write-Host 'Docker is not running.' -ForegroundColor Yellow
  Write-Host 'Open Docker Desktop from the Start menu and wait until it shows "Engine running",'
  Write-Host 'then double-click start.cmd again.'
  Write-Host ''
  exit 1
}
docker compose version > $null 2>&1
if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose is missing. Update Docker Desktop to the latest version.' }

# ---------- 2. Access code and secrets (.env), created once and never overwritten ----------
if (-not (Test-Path -LiteralPath $envFile) -or (Get-Item -LiteralPath $envFile).Length -eq 0) {
  Say 'Creating your access code and secrets (selfhost\.env)'
  $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $hex = '0123456789abcdef'
  $code = 'MAV-' + (New-RandomText 4 $letters) + '-' + (New-RandomText 4 $letters) + '-' + (New-RandomText 4 $letters)
  $text = "# Maverick server settings, created by the start script. Keep this file private:`n" +
    "# anyone with the access code can connect a phone to your server.`n" +
    "ACCESS_CODE=$code`n" +
    "SERVER_SECRET=$(New-RandomText 64 $hex)`n" +
    "VOICE_SECRET=$(New-RandomText 48 $hex)`n"
  # UTF-8 without a byte order mark and with LF line ends, which Docker Compose reads reliably.
  [System.IO.File]::WriteAllText($envFile, $text, (New-Object System.Text.UTF8Encoding($false)))
}
$accessCode = Get-EnvValue 'ACCESS_CODE'
if (-not $accessCode) { Fail 'selfhost\.env has no ACCESS_CODE. Delete selfhost\.env and run start.cmd again to make a new one.' }
if ($env:GITHUB_ACTIONS -eq 'true') {
  # Keep the code and secrets out of CI logs (the repository is public).
  foreach ($k in 'ACCESS_CODE', 'SERVER_SECRET', 'VOICE_SECRET') {
    $v = Get-EnvValue $k
    if ($v) { Write-Host "::add-mask::$v" }
  }
}

$osType = (docker info --format '{{.OSType}}' 2> $null | Out-String).Trim()
if ($osType -ne 'linux') {
  Fail 'Docker Desktop is set to Windows containers. Right-click the Docker whale icon near the clock, choose "Switch to Linux containers...", then run start.cmd again.'
}

# ---------- 3. Build and start ----------
Say 'Building and starting the server. The first time takes 5-15 minutes; later runs take seconds.'
$voiceNote = ''
docker compose up -d --build
if ($LASTEXITCODE -ne 0) {
  Say 'Starting everything failed. Trying again without the voice engine (chat does not need it) ...'
  docker compose up -d --build core tunnel
  if ($LASTEXITCODE -ne 0) {
    docker compose ps -a
    docker compose logs --tail 40 core tunnel
    Fail 'The server could not be started. See the messages above.'
  }
  $voiceNote = 'Voice calls are off: the voice engine could not be built or started (chat works).'
}

# ---------- 4. Wait for the server ----------
Say 'Waiting for the server to be ready ...'
$ready = $false
for ($i = 0; $i -lt 100; $i++) {
  if ((Invoke-InCore 'http://127.0.0.1:8080/health' 5) -match '"ready":true') { $ready = $true; break }
  Start-Sleep -Seconds 3
}
if (-not $ready) {
  docker compose logs --tail 60 core
  Fail 'The server did not become ready. See the log above.'
}

# ---------- 5. Public https address of the Cloudflare Quick Tunnel ----------
Say 'Getting the public https address from Cloudflare ...'
$tunnelHost = ''
for ($i = 0; $i -lt 60; $i++) {
  if ((Invoke-InCore 'http://tunnel:20241/quicktunnel' 5) -match '"hostname":"([a-z0-9.-]+)"') { $tunnelHost = $Matches[1]; break }
  Start-Sleep -Seconds 3
}
if (-not $tunnelHost) {
  # Fallback: the address is also printed in the tunnel's log.
  $logText = (docker compose logs --no-color tunnel 2> $null | Out-String)
  $found = @([regex]::Matches($logText, 'https://[a-z0-9-]+\.trycloudflare\.com') | ForEach-Object { $_.Value } | Where-Object { $_ -notmatch '://api\.' })
  if ($found.Count -gt 0) { $tunnelHost = $found[$found.Count - 1] -replace '^https://', '' }
}
if (-not $tunnelHost) {
  docker compose logs --tail 40 tunnel
  Fail 'Could not get an address from Cloudflare. Check the internet connection, then run start.cmd again.'
}
$url = "https://$tunnelHost"

# ---------- 6. Check the address from the internet, the way the phone will reach it ----------
Say "Checking $url from the internet ..."
$reachable = $false
for ($i = 0; $i -lt 40; $i++) {
  if ((Invoke-InCore "$url/health" 15) -match '"ok":true') { $reachable = $true; break }
  Start-Sleep -Seconds 3
}

$copied = $false
try { Set-Clipboard -Value $url -ErrorAction Stop; $copied = $true } catch { $copied = $false }

# ---------- 7. What to type into the app ----------
Write-Host ''
Write-Host $line -ForegroundColor Green
Write-Host '  Your Maverick server is running.' -ForegroundColor Green
Write-Host ''
Write-Host "    Server URL:   $url" -ForegroundColor Green
Write-Host "    Access code:  $accessCode" -ForegroundColor Green
Write-Host ''
Write-Host '  In the Maverick Bot app, on the pairing screen tap "Server: ... change",' -ForegroundColor Green
Write-Host '  paste the Server URL, then enter the access code.' -ForegroundColor Green
Write-Host $line -ForegroundColor Green
if ($copied) { Write-Host '  The Server URL is copied: paste it into a message to your phone.' }
if ($voiceNote) { Write-Host "  $voiceNote" -ForegroundColor Yellow }
Write-Host '  Keep this computer on and awake, with Docker Desktop running.'
Write-Host '  The address changes when the server or computer restarts: run start.cmd again to see it.'
Write-Host '  Stop the server: double-click stop.cmd'
Write-Host ''

if (-not $reachable) {
  Write-Host "WARNING: $url did not answer from the internet yet. Wait a minute, then open" -ForegroundColor Yellow
  Write-Host "$url/health in a browser: it should show {""ok"":true,...}. If not, run start.cmd again." -ForegroundColor Yellow
  Write-Host ''
  exit 3
}
exit 0
