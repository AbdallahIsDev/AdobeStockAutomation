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

$session = Get-Content $sessionStatePath -Raw | ConvertFrom-Json
$now = Get-Date
$session.session_date = $now.ToString("yyyy-MM-dd")
$session.session_started_at = "{0}__{1} {2}" -f $now.ToString("yyyy-MM-dd"), $now.ToString("hh:mm:ss"), $now.ToString("tt")

if ($Mode -eq "full_system") {
  $session.pipeline_mode = "full_system"
  $session.post_download_policy = "fifo_upscale_prepare"
  if (-not $Stage) {
    $Stage = "trend_research"
  }
} else {
  $session.pipeline_mode = "stage_only"
  $session.post_download_policy = "fifo_upscale_prepare"
}

if ($Stage) {
  $session.current_stage = $Stage
}

$session.current_step = "session_mode_configured"
$session.images_created_count = 0
$session.images_created_16x9_count = 0
$session.images_created_1x1_count = 0
$session.images_downloaded_count = 0
$session.downloads_completed = 0
$session.current_description_index = $null
$session.current_trend_id = $null
$session.current_series_slot = $null
$session.run_baseline_media_names = @()
$session.active_batches = @()
$session.downloaded_images = @()
$session.current_16x9_submitted = @()
$session.current_16x9_rendered = @()
$session.current_16x9_failed = @()
$session.current_16x9_downloaded = 0
$session.current_1x1_submitted = @()
$session.current_1x1_rendered = @()
$session.current_1x1_failed = @()
$session.current_1x1_downloaded = 0
$session.remaining_session_image_capacity = if ($session.session_image_cap) { $session.session_image_cap } else { 64 }
$session.remaining_16x9_capacity = if ($session.session_aspect_cap) { $session.session_aspect_cap } else { 32 }
$session.remaining_1x1_capacity = if ($session.session_aspect_cap) { $session.session_aspect_cap } else { 32 }

$session | ConvertTo-Json -Depth 100 | Set-Content -Path $sessionStatePath -Encoding UTF8

Write-Output "Session mode set: mode=$($session.pipeline_mode) policy=$($session.post_download_policy) stage=$($session.current_stage)"
