$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataDir = Join-Path $projectRoot "data"

function Convert-ToPlainObject {
  param([Parameter(ValueFromPipeline = $true)]$InputObject)

  if ($null -eq $InputObject) {
    return $null
  }

  if ($InputObject -is [System.Collections.IDictionary]) {
    $result = [ordered]@{}
    foreach ($key in $InputObject.Keys) {
      $result[$key] = Convert-ToPlainObject $InputObject[$key]
    }
    return $result
  }

  if ($InputObject -is [System.Collections.IEnumerable] -and $InputObject -isnot [string]) {
    $items = @()
    foreach ($item in $InputObject) {
      $items += ,(Convert-ToPlainObject $item)
    }
    return $items
  }

  if ($InputObject -is [pscustomobject]) {
    $result = [ordered]@{}
    foreach ($property in $InputObject.PSObject.Properties) {
      $result[$property.Name] = Convert-ToPlainObject $property.Value
    }
    return $result
  }

  return $InputObject
}

function Merge-Defaults {
  param(
    $Defaults,
    $Current
  )

  if ($null -eq $Current) {
    return Convert-ToPlainObject $Defaults
  }

  $plainDefaults = Convert-ToPlainObject $Defaults
  $plainCurrent = Convert-ToPlainObject $Current

  if ($plainDefaults -is [System.Collections.IDictionary] -and $plainCurrent -is [System.Collections.IDictionary]) {
    $merged = [ordered]@{}

    foreach ($key in $plainDefaults.Keys) {
      if ($plainCurrent.Contains($key)) {
        $merged[$key] = Merge-Defaults $plainDefaults[$key] $plainCurrent[$key]
      } else {
        $merged[$key] = Convert-ToPlainObject $plainDefaults[$key]
      }
    }

    foreach ($key in $plainCurrent.Keys) {
      if (-not $merged.Contains($key)) {
        $merged[$key] = Convert-ToPlainObject $plainCurrent[$key]
      }
    }

    return $merged
  }

  if ($plainDefaults -is [System.Collections.IEnumerable] -and $plainDefaults -isnot [string]) {
    return $plainCurrent
  }

  return $plainCurrent
}

function Ensure-JsonFile {
  param(
    [string]$Path,
    $Defaults
  )

  $existing = $null
  if (Test-Path $Path) {
    try {
      $existing = Get-Content $Path -Raw | ConvertFrom-Json -Depth 100
    } catch {
      $existing = $null
    }
  }

  $finalObject = Merge-Defaults $Defaults $existing
  $json = $finalObject | ConvertTo-Json -Depth 100
  Set-Content -Path $Path -Value ($json + "`r`n") -Encoding UTF8
}

$now = Get-Date
$nowIso = $now.ToString("yyyy-MM-ddTHH:mm:ssK")
$today = $now.ToString("yyyy-MM-dd")
$validUntilIso = $now.AddHours(4).ToString("yyyy-MM-ddTHH:mm:ssK")

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

$seriesStructure = [ordered]@{
  "16:9" = @("16A_establishing", "16B_detail", "16C_scale", "16D_alt")
  "1:1"  = @("1A_iconic", "1B_variation", "1C_closeup", "1D_isolated")
}

Ensure-JsonFile -Path (Join-Path $dataDir "session_state.json") -Defaults ([ordered]@{
  session_date = $today
  session_started_at = $nowIso
  pipeline_mode = "stage_only"
  post_download_policy = "download_only"
  current_stage = $null
  last_completed_stage = $null
  current_account_index = 0
  current_account_email = $null
  current_model = $null
  current_aspect_ratio = $null
  current_step = "boot"
  loop_index = 0
  current_description_index = $null
  current_project_url = $null
  current_project_id = $null
  current_trend_id = $null
  current_series_slot = $null
  static_cache_status = "missing"
  static_cache_age_days = $null
  dynamic_cache_status = "missing"
  dynamic_cache_valid_until = $null
  descriptions_queue = @()
  images_created_count = 0
  images_downloaded_count = 0
  downloads_completed = 0
  upscale_requested_ids = @()
  downloaded_images = @()
  current_16x9_submitted = 0
  current_16x9_rendered = 0
  current_16x9_failed = 0
  current_16x9_downloaded = 0
  current_1x1_submitted = 0
  current_1x1_rendered = 0
  current_1x1_failed = 0
  current_1x1_downloaded = 0
  limit_reached_on_image = $null
  errors = @()
  accounts = @()
})

Ensure-JsonFile -Path (Join-Path $dataDir "accounts.json") -Defaults ([ordered]@{
  accounts = @(
    [ordered]@{ email = "account01@example.com"; display_name = "Account 01"; enabled = $true },
    [ordered]@{ email = "account02@example.com"; display_name = "Account 02"; enabled = $true }
  )
})

Ensure-JsonFile -Path (Join-Path $dataDir "static_knowledge_cache.json") -Defaults ([ordered]@{
  cached_at = $null
  valid_for_days = 90
  force_refresh = $false
  static_data = [ordered]@{
    priority_niches = @()
    seasonal_calendar = @()
    design_signals = @()
  }
})

Ensure-JsonFile -Path (Join-Path $dataDir "dynamic_trend_cache.json") -Defaults ([ordered]@{
  cached_at = $null
  valid_until = $validUntilIso
  ttl_hours = 4
  queries_run = 0
  sources_queried = @()
  results = @()
})

Ensure-JsonFile -Path (Join-Path $dataDir "trend_data.json") -Defaults ([ordered]@{
  generated_at = $null
  session_date = $null
  static_cache_used = $false
  static_cache_age_days = $null
  dynamic_cache_used = $false
  dynamic_cache_cached_at = $null
  dynamic_cache_valid_until = $null
  dynamic_query_groups_run = @()
  sources_queried = @()
  trends = @()
})

Ensure-JsonFile -Path (Join-Path $dataDir "descriptions.json") -Defaults ([ordered]@{
  generated_at = $null
  total_descriptions = 0
  loop_index = 0
  descriptions_per_trend = 8
  series_structure = $seriesStructure
  descriptions = @()
})

Ensure-JsonFile -Path (Join-Path $dataDir "selectors_registry.json") -Defaults ([ordered]@{
  updated_at = $null
  selectors = [ordered]@{}
})

Ensure-JsonFile -Path (Join-Path $dataDir "image_registry.json") -Defaults ([ordered]@{
  last_updated = $null
  total_images = 0
  images = [ordered]@{}
})

Ensure-JsonFile -Path (Join-Path $dataDir "upscaler_state.json") -Defaults ([ordered]@{
  cli_binary_path = $null
  models_dir = $null
  model_name = "ultrasharp-4x"
  method = $null
})

Ensure-JsonFile -Path (Join-Path $dataDir "adobe_stock_selectors.json") -Defaults ([ordered]@{
  updated_at = $null
  selectors = [ordered]@{}
})

Write-Output "Runtime JSON bootstrap complete."
