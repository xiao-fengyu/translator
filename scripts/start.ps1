param(
  [string]$TaskName = 'codex-translator'
)

$ErrorActionPreference = 'Stop'
Start-ScheduledTask -TaskName $TaskName
Write-Host "started $TaskName"
