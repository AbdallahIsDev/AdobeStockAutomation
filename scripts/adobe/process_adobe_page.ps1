param(
  [ValidateSet("check", "apply")]
  [string]$Action = "apply",
  [string]$Date = "2026-03-28",
  [int]$PageLimit = 999,
  [int]$ItemLimit = 9999
)

$ErrorActionPreference = "Stop"
$runtime = Join-Path $PSScriptRoot "..\adobe_runtime.ts"

npx --yes tsx $runtime --action=$Action --date=$Date --page-limit=$PageLimit --item-limit=$ItemLimit
