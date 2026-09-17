# Starts the project-local, isolated PostgreSQL instance for MoneyKanakku.
# This is a SEPARATE data cluster from any other PostgreSQL install on this
# machine - it never touches the system services on ports 5432 / 5433.

$ErrorActionPreference = "Stop"
$root    = Split-Path -Parent $PSScriptRoot
$pgData  = Join-Path $root "pgdata"
$logFile = Join-Path $root "logs\postgres.log"
$pgCtl   = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"

if (-not (Test-Path $pgCtl)) {
    Write-Error "PostgreSQL 17 not found at $pgCtl - install it or update this script's path."
    exit 1
}

$status = & $pgCtl -D $pgData status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "MoneyKanakku Postgres is already running (port 5544)." -ForegroundColor Yellow
    exit 0
}

New-Item -ItemType Directory -Force -Path (Split-Path $logFile) | Out-Null
& $pgCtl -D $pgData -l $logFile start
Write-Host "MoneyKanakku Postgres started on port 5544 (data: $pgData)" -ForegroundColor Green
