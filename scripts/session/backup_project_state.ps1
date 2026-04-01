param(
  [string]$Reason = "manual",
  [switch]$Auto,
  [int]$MinAgeHours = 6,
  [switch]$IncludeTrackedProjectFiles
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$backupRoot = Join-Path $projectRoot "project_backups"
$timestamp = Get-Date
$timestampJson = $timestamp.ToString("yyyy-MM-dd__HH:mm:ss")
$timestampFolder = $timestamp.ToString("yyyy-MM-dd__HH-mm-ss")

function Save-JsonFile {
  param(
    [string]$Path,
    $Data
  )

  $json = $Data | ConvertTo-Json -Depth 100
  Set-Content -Path $Path -Value ($json + "`r`n") -Encoding UTF8
}

function Copy-PathIfPresent {
  param(
    [string]$Source,
    [string]$Destination
  )

  if (Test-Path $Source) {
    Copy-Item -Path $Source -Destination $Destination -Recurse -Force
  }
}

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

if ($Auto) {
  $cutoff = $timestamp.AddHours(-1 * $MinAgeHours)
  $recentAutoBackup = Get-ChildItem -Path $backupRoot -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $cutoff } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

  if ($recentAutoBackup) {
    Write-Output ("Project backup skipped; recent snapshot already exists: {0}" -f $recentAutoBackup.FullName)
    return
  }
}

$reasonSlug = ($Reason -replace "[^A-Za-z0-9_-]", "_").Trim("_")
if ([string]::IsNullOrWhiteSpace($reasonSlug)) {
  $reasonSlug = "snapshot"
}

$snapshotDir = Join-Path $backupRoot ("{0}__{1}" -f $timestampFolder, $reasonSlug)
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

Copy-PathIfPresent -Source (Join-Path $projectRoot "data") -Destination (Join-Path $snapshotDir "data")
Copy-PathIfPresent -Source (Join-Path $projectRoot "logs") -Destination (Join-Path $snapshotDir "logs")
Copy-PathIfPresent -Source (Join-Path $projectRoot "staging") -Destination (Join-Path $snapshotDir "staging")

if ($IncludeTrackedProjectFiles) {
  Copy-PathIfPresent -Source (Join-Path $projectRoot "instructions") -Destination (Join-Path $snapshotDir "instructions")
  Copy-PathIfPresent -Source (Join-Path $projectRoot "scripts") -Destination (Join-Path $snapshotDir "scripts")
  Copy-PathIfPresent -Source (Join-Path $projectRoot "SKILL.md") -Destination (Join-Path $snapshotDir "SKILL.md")
  Copy-PathIfPresent -Source (Join-Path $projectRoot "README.md") -Destination (Join-Path $snapshotDir "README.md")
  Copy-PathIfPresent -Source (Join-Path $projectRoot ".gitignore") -Destination (Join-Path $snapshotDir ".gitignore")
}

$includes = @(
  "data/",
  "logs/",
  "staging/"
)

if ($IncludeTrackedProjectFiles) {
  $includes += @(
    "SKILL.md",
    "README.md",
    ".gitignore",
    "instructions/",
    "scripts/"
  )
}

$manifest = [ordered]@{
  created_at = $timestampJson
  mode = if ($Auto) { "automatic" } else { "manual" }
  reason = $Reason
  focus = if ($IncludeTrackedProjectFiles) { "full_project_snapshot" } else { "local_state_only" }
  project_root = $projectRoot
  includes = $includes
  excludes = @(
    "downloads/",
    "project_backups/"
  )
}

Save-JsonFile -Path (Join-Path $snapshotDir "backup_manifest.json") -Data $manifest

Write-Output ("Project backup created: {0}" -f $snapshotDir)
