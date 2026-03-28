param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("full_system", "stage_only")]
  [string]$Mode,

  [Parameter(Mandatory = $false)]
  [string]$Stage
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sessionStatePath = Join-Path $projectRoot "data\session_state.json"

if (-not (Test-Path $sessionStatePath)) {
  & (Join-Path $PSScriptRoot "bootstrap_runtime_state.ps1")
}

$session = Get-Content $sessionStatePath -Raw | ConvertFrom-Json -Depth 100

if ($Mode -eq "full_system") {
  $session.pipeline_mode = "full_system"
  $session.post_download_policy = "fifo_upscale_prepare"
  if (-not $Stage) {
    $Stage = "trend_research"
  }
} else {
  $session.pipeline_mode = "stage_only"
  $session.post_download_policy = "download_only"
}

if ($Stage) {
  $session.current_stage = $Stage
}

$session.current_step = "session_mode_configured"
$session | ConvertTo-Json -Depth 100 | Set-Content -Path $sessionStatePath -Encoding UTF8

Write-Output "Session mode set: mode=$($session.pipeline_mode) policy=$($session.post_download_policy) stage=$($session.current_stage)"
