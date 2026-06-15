param(
  [switch]$SkipInstallDeps,
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = if ($ProjectRoot) { [System.IO.Path]::GetFullPath($ProjectRoot) } else { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')) }

function Assert-CommandExists([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name is required"
  }
}

function Test-GitClean([string]$Path) {
  $status = & git -C $Path status --porcelain
  return [string]::IsNullOrWhiteSpace($status)
}

Assert-CommandExists 'git'
Assert-CommandExists 'node'
Assert-CommandExists 'npm'

& git -C $ProjectRoot rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "$ProjectRoot is not a git repository"
}

if (-not (Test-GitClean $ProjectRoot)) {
  Write-Host 'working tree has local changes; commit or stash them before upgrading' -ForegroundColor Red
  & git -C $ProjectRoot status --short
  exit 1
}

$upstream = & git -C $ProjectRoot rev-parse --abbrev-ref --symbolic-full-name '@{u}'
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
  throw 'current branch has no upstream; set one with git branch --set-upstream-to'
}

Write-Host "fetching latest $upstream"
& git -C $ProjectRoot fetch --prune

$currentRev = & git -C $ProjectRoot rev-parse HEAD
$remoteRev = & git -C $ProjectRoot rev-parse $upstream

if ($currentRev -eq $remoteRev) {
  Write-Host "already up to date: $currentRev"
} else {
  & git -C $ProjectRoot merge-base --is-ancestor $currentRev $remoteRev
  if ($LASTEXITCODE -ne 0) {
    throw "local branch cannot fast-forward to $upstream; resolve git history manually"
  }

  Write-Host "upgrading $currentRev -> $remoteRev"
  & git -C $ProjectRoot merge --ff-only $upstream
}

if (-not $SkipInstallDeps) {
  Push-Location $ProjectRoot
  try {
    & npm install
  } finally {
    Pop-Location
  }
}

& $PSScriptRoot\install.ps1 -SkipInstallDeps

Write-Host "translator upgraded to $(git -C $ProjectRoot rev-parse --short HEAD)"
