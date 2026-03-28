param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("batch", "fifo")]
  [string]$Action,

  [Parameter(Mandatory = $false)]
  [string]$ImagePath
)

$ErrorActionPreference = "Stop"

$runner = Join-Path $PSScriptRoot "upscale\run_pipeline.ts"

switch ($Action) {
  "batch" {
    & npx --yes tsx $runner --mode=batch
    break
  }
  "fifo" {
    if (-not $ImagePath) {
      throw "ImagePath is required when Action=fifo."
    }
    & npx --yes tsx $runner --mode=fifo "--image=$ImagePath"
    break
  }
}

if ($LASTEXITCODE -ne 0) {
  throw "Upscale runtime failed with exit code $LASTEXITCODE."
}
