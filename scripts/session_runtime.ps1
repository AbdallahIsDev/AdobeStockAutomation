param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("bootstrap", "full-system", "stage")]
  [string]$Action,

  [Parameter(Mandatory = $false)]
  [ValidateSet("trend_research", "image_creation", "image_upscaler", "metadata_optimizer")]
  [string]$Stage
)

$ErrorActionPreference = "Stop"

$sessionDir = Join-Path $PSScriptRoot "session"

switch ($Action) {
  "bootstrap" {
    & (Join-Path $sessionDir "bootstrap_runtime_state.ps1")
    break
  }
  "full-system" {
    & (Join-Path $sessionDir "start_full_system_session.ps1")
    break
  }
  "stage" {
    if (-not $Stage) {
      throw "Stage is required when Action=stage."
    }
    & (Join-Path $sessionDir "start_stage_session.ps1") -Stage $Stage
    break
  }
}
