param(
  [switch]$SkipInstallDeps,
  [string]$ProjectRoot,
  [string]$ServiceName = 'codex-translator'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = if ($ProjectRoot) { [System.IO.Path]::GetFullPath($ProjectRoot) } else { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }
$EnvPath = Join-Path $ProjectRoot '.env'
$EnvExamplePath = Join-Path $ProjectRoot '.env.example'
$NodeExe = 'node'
$NpmExe = 'npm'
$InstallDir = Join-Path $env:ProgramData 'codex-translator'
$RunScript = Join-Path $InstallDir 'run.ps1'
$TaskName = $ServiceName

function Assert-CommandExists([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required"
  }
}

function Read-EnvValue([string]$Key) {
  if (-not (Test-Path $EnvPath)) { return $null }
  $match = Select-String -Path $EnvPath -Pattern "^$Key=(.*)$" | Select-Object -Last 1
  if (-not $match) { return $null }
  return $match.Matches[0].Groups[1].Value.Trim().Trim('"').Trim("'")
}

Assert-CommandExists $NodeExe
Assert-CommandExists $NpmExe

if (-not $SkipInstallDeps -and -not (Test-Path (Join-Path $ProjectRoot 'node_modules'))) {
  Push-Location $ProjectRoot
  try {
    & $NpmExe install
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path $EnvPath)) {
  Copy-Item $EnvExamplePath $EnvPath
  Write-Host "created $EnvPath from .env.example"
}

$placeholder = Read-EnvValue 'UPSTREAM_API_KEY'
if ($placeholder -eq 'replace-me') {
  Write-Warning '.env still contains placeholder UPSTREAM_API_KEY=replace-me'
}

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

$runScriptContent = @"
Set-Location "$ProjectRoot"
`$envFile = "$EnvPath"
if (Test-Path `$envFile) {
  Get-Content `$envFile | ForEach-Object {
    if (`$_ -match '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      `$key = `$Matches.key
      `$value = `$Matches.value.Trim().Trim('"').Trim("'")
      [Environment]::SetEnvironmentVariable(`$key, `$value, 'Process')
    }
  }
}
& node "$ProjectRoot/src/index.ts"
"@

Set-Content -Path $RunScript -Value $runScriptContent -Encoding UTF8

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$RunScript`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Seconds 10)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "installed $TaskName for $ProjectRoot"
