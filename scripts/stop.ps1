param(
  [string]$TaskName = 'codex-translator'
)

$ErrorActionPreference = 'Stop'
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Write-Host "stopped $TaskName"
