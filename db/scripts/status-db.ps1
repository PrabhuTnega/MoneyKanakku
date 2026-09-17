# Reports whether the project-local MoneyKanakku PostgreSQL instance is running.

$root   = Split-Path -Parent $PSScriptRoot
$pgData = Join-Path $root "pgdata"
$pgCtl  = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"

& $pgCtl -D $pgData status
