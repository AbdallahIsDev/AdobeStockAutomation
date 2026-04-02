$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot

& (Join-Path $PSScriptRoot "set_session_mode.ps1") -Mode full_system -Stage trend_research

Write-Output "Full-system session ready."
