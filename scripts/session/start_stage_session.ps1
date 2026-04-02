param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("trend_research", "image_creation", "image_upscaler", "metadata_optimizer")]
  [string]$Stage
)

$ErrorActionPreference = "Stop"

& (Join-Path $PSScriptRoot "set_session_mode.ps1") -Mode stage_only -Stage $Stage

Write-Output "Stage-only session ready for $Stage."
