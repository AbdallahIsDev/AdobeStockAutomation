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
$downloadsDir = Join-Path $projectRoot "downloads"
$logsDir = Join-Path $projectRoot "logs"

function Set-SessionValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session,

    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $false)]
    $Value
  )

  $property = $Session.PSObject.Properties[$Name]
  if ($null -ne $property) {
    $property.Value = $Value
  } else {
    $Session | Add-Member -NotePropertyName $Name -NotePropertyValue $Value
  }
}

if (-not (Test-Path $sessionStatePath)) {
  $hasHistoricalProjectState = (
    ((Test-Path $downloadsDir) -and (Get-ChildItem -Path $downloadsDir -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1)) -or
    ((Test-Path $logsDir) -and (Get-ChildItem -Path $logsDir -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1))
  )

  if ($hasHistoricalProjectState) {
    & (Join-Path $PSScriptRoot "reconcile_runtime_state.ps1")
  } else {
    & (Join-Path $PSScriptRoot "bootstrap_runtime_state.ps1")
  }
}

$session = Get-Content $sessionStatePath -Raw | ConvertFrom-Json
$now = Get-Date
Set-SessionValue -Session $session -Name "session_date" -Value $now.ToString("yyyy-MM-dd")
Set-SessionValue -Session $session -Name "session_started_at" -Value ("{0}__{1} {2}" -f $now.ToString("yyyy-MM-dd"), $now.ToString("hh:mm:ss"), $now.ToString("tt"))

if ($Mode -eq "full_system") {
  Set-SessionValue -Session $session -Name "pipeline_mode" -Value "full_system"
  Set-SessionValue -Session $session -Name "post_download_policy" -Value "fifo_upscale_prepare"
  if (-not $Stage) {
    $Stage = "trend_research"
  }
} else {
  Set-SessionValue -Session $session -Name "pipeline_mode" -Value "stage_only"
  Set-SessionValue -Session $session -Name "post_download_policy" -Value "fifo_upscale_prepare"
}

if ($Stage) {
  Set-SessionValue -Session $session -Name "current_stage" -Value $Stage
}

Set-SessionValue -Session $session -Name "current_step" -Value "session_mode_configured"
Set-SessionValue -Session $session -Name "images_created_count" -Value 0
Set-SessionValue -Session $session -Name "images_created_16x9_count" -Value 0
Set-SessionValue -Session $session -Name "images_created_1x1_count" -Value 0
Set-SessionValue -Session $session -Name "images_downloaded_count" -Value 0
Set-SessionValue -Session $session -Name "downloads_completed" -Value 0
Set-SessionValue -Session $session -Name "current_description_index" -Value $null
Set-SessionValue -Session $session -Name "current_trend_id" -Value $null
Set-SessionValue -Session $session -Name "current_series_slot" -Value $null
Set-SessionValue -Session $session -Name "run_baseline_media_names" -Value @()
Set-SessionValue -Session $session -Name "active_batches" -Value @()
Set-SessionValue -Session $session -Name "downloaded_images" -Value @()
Set-SessionValue -Session $session -Name "current_16x9_submitted" -Value @()
Set-SessionValue -Session $session -Name "current_16x9_rendered" -Value @()
Set-SessionValue -Session $session -Name "current_16x9_failed" -Value @()
Set-SessionValue -Session $session -Name "current_16x9_downloaded" -Value 0
Set-SessionValue -Session $session -Name "current_1x1_submitted" -Value @()
Set-SessionValue -Session $session -Name "current_1x1_rendered" -Value @()
Set-SessionValue -Session $session -Name "current_1x1_failed" -Value @()
Set-SessionValue -Session $session -Name "current_1x1_downloaded" -Value 0
Set-SessionValue -Session $session -Name "remaining_session_image_capacity" -Value $(if ($session.session_image_cap) { $session.session_image_cap } else { 64 })
Set-SessionValue -Session $session -Name "remaining_16x9_capacity" -Value $(if ($session.session_aspect_cap) { $session.session_aspect_cap } else { 32 })
Set-SessionValue -Session $session -Name "remaining_1x1_capacity" -Value $(if ($session.session_aspect_cap) { $session.session_aspect_cap } else { 32 })

$session | ConvertTo-Json -Depth 100 | Set-Content -Path $sessionStatePath -Encoding UTF8

Write-Output "Session mode set: mode=$($session.pipeline_mode) policy=$($session.post_download_policy) stage=$($session.current_stage)"
