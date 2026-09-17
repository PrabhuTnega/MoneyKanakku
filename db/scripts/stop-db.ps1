# Stops ONLY the project-local MoneyKanakku PostgreSQL instance (port 5544).
# Does not touch any other PostgreSQL service running on this machine.

$ErrorActionPreference = "Stop"
$root   = Split-Path -Parent $PSScriptRoot
$pgData = Join-Path $root "pgdata"
$pgCtl  = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"

& $pgCtl -D $pgData stop -m fast
Write-Host "MoneyKanakku Postgres (port 5544) stopped." -ForegroundColor Green
