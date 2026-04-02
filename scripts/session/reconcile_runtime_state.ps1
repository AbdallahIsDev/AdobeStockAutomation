param(
  [string]$SourceDataDir
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dataDir = Join-Path $projectRoot "data"
$downloadsDir = Join-Path $projectRoot "downloads"
$upscaledDir = Join-Path $downloadsDir "upscaled"
$manualDir = Join-Path $downloadsDir "manual"
$backupScript = Join-Path $PSScriptRoot "backup_project_state.ps1"
$now = Get-Date
$imageExtensions = @(".png", ".jpg", ".jpeg", ".webp")

Add-Type -AssemblyName System.Drawing

function Format-ProjectTimestamp {
  param([datetime]$Date)

  return "{0}__{1} {2}" -f $Date.ToString("yyyy-MM-dd"), $Date.ToString("hh:mm:ss"), $Date.ToString("tt")
}

$nowJson = Format-ProjectTimestamp -Date $now

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

function Load-JsonOrDefault {
  param(
    [string]$Path,
    $Default
  )

  if (-not (Test-Path $Path)) {
    return Convert-ToPlainObject $Default
  }

  try {
    return Convert-ToPlainObject (Get-Content -Path $Path -Raw | ConvertFrom-Json)
  } catch {
    return Convert-ToPlainObject $Default
  }
}

function Save-JsonFile {
  param(
    [string]$Path,
    $Data
  )

  $json = $Data | ConvertTo-Json -Depth 100
  Set-Content -Path $Path -Value ($json + "`r`n") -Encoding UTF8
}

function Get-ProjectRelativePath {
  param([string]$FullPath)

  $relative = $FullPath.Substring($projectRoot.Length).TrimStart("\")
  return ($relative -replace "/", "\")
}

function Get-ImageDimensions {
  param([string]$Path)

  try {
    $image = [System.Drawing.Image]::FromFile($Path)
    $dimensions = [ordered]@{
      width = [int]$image.Width
      height = [int]$image.Height
    }
    $image.Dispose()
    return $dimensions
  } catch {
    return $null
  }
}

function Get-ImageFiles {
  param([string]$Root)

  if (-not (Test-Path $Root)) {
    return @()
  }

  return @(Get-ChildItem -Path $Root -File -ErrorAction SilentlyContinue | Where-Object {
      $imageExtensions -contains $_.Extension.ToLowerInvariant()
    })
}

function Get-MediaName {
  param([string]$Filename)

  if ($Filename -match "__([0-9a-fA-F-]{36})\.[^.]+$") {
    return $Matches[1].ToLowerInvariant()
  }

  return $null
}

function Get-AssignedScale {
  param(
    [string]$Filename,
    $ExistingValue
  )

  if ($null -ne $ExistingValue -and $ExistingValue -ne "") {
    return $ExistingValue
  }

  if ($Filename -like "*__2K__*") {
    return 2
  }

  return $null
}

function New-DownloadedImageRecord {
  param(
    [System.IO.FileInfo]$File,
    $Existing,
    $SessionState
  )

  if ($Existing) {
    $record = Convert-ToPlainObject $Existing
    $record.saved_path = $File.FullName
    if (-not $record.downloaded_at) {
      $record.downloaded_at = Format-ProjectTimestamp -Date $File.LastWriteTime
    }
    return $record
  }

  return [ordered]@{
    media_name = Get-MediaName $File.Name
    tile_id = $null
    href = $null
    project_id = $SessionState.current_project_id
    download_mode = if ($File.Name -like "*__2K__*") { "2K" } else { "1X" }
    saved_path = $File.FullName
    suggested_filename = $File.Name
    download_attempt = 1
    downloaded_at = Format-ProjectTimestamp -Date $File.LastWriteTime
    note = "Reconciled from disk."
  }
}

& $backupScript -Reason "pre_reconcile_snapshot"

New-Item -ItemType Directory -Path $dataDir -Force | Out-Null

if ($SourceDataDir) {
  $resolvedSourceDataDir = Resolve-Path -LiteralPath $SourceDataDir -ErrorAction Stop
  Get-ChildItem -Path $resolvedSourceDataDir -Filter *.json -File | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $dataDir $_.Name) -Force
  }
}

$registryPath = Join-Path $dataDir "image_registry.json"
$sessionStatePath = Join-Path $dataDir "session_state.json"

$registry = Load-JsonOrDefault -Path $registryPath -Default ([ordered]@{
  last_updated = $null
  total_images = 0
  images = [ordered]@{}
})

$sessionState = Load-JsonOrDefault -Path $sessionStatePath -Default ([ordered]@{
  session_date = $null
  session_started_at = $null
  pipeline_mode = "stage_only"
  post_download_policy = "fifo_upscale_prepare"
  current_stage = $null
  last_completed_stage = $null
  current_step = "boot"
  current_project_id = $null
  downloaded_images = @()
  images_downloaded_count = 0
  downloads_completed = 0
})

$imagesMap = [ordered]@{}
if ($registry.images) {
  $reservedRegistryKeys = @("Count", "IsReadOnly", "Keys", "Values", "IsFixedSize", "SyncRoot", "IsSynchronized")
  foreach ($property in $registry.images.PSObject.Properties) {
    if ($reservedRegistryKeys -contains $property.Name) {
      continue
    }
    $imagesMap[$property.Name] = Convert-ToPlainObject $property.Value
  }
}

$sourceDirs = @(
  Get-ChildItem -Path $downloadsDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^\d{4}-\d{2}-\d{2}$" }
)

if (Test-Path $manualDir) {
  $sourceDirs += Get-Item -LiteralPath $manualDir
}

foreach ($directory in $sourceDirs) {
  foreach ($file in Get-ImageFiles -Root $directory.FullName) {
    $filename = $file.Name
    $relativePath = Get-ProjectRelativePath $file.FullName
    $metadataPath = [System.IO.Path]::ChangeExtension($file.FullName, ".metadata.json")
    $relativeMetadataPath = if (Test-Path $metadataPath) { Get-ProjectRelativePath $metadataPath } else { $null }
    $dimensions = Get-ImageDimensions -Path $file.FullName
    $existingEntry = if ($imagesMap.Contains($filename)) { Convert-ToPlainObject $imagesMap[$filename] } else { $null }
    $entry = if ($existingEntry) { $existingEntry } else { [ordered]@{} }

    $entry.source = if ($directory.Name -eq "manual") { "manual" } elseif ($entry.source) { $entry.source } else { "ai_generated" }
    $entry.final_name = $filename
    if (-not $entry.original_name) { $entry.original_name = $filename }
    $entry.source_path = $relativePath
    if ($dimensions) {
      $entry.dimensions = $dimensions
      $entry.long_side = [Math]::Max([int]$dimensions.width, [int]$dimensions.height)
    }
    $entry.assigned_scale = Get-AssignedScale -Filename $filename -ExistingValue $entry.assigned_scale
    $entry.metadata_sidecar = if ($relativeMetadataPath) { $relativeMetadataPath } else { $entry.metadata_sidecar }
    if (-not $entry.Contains("upscaled")) { $entry.upscaled = $false }
    if (-not $entry.Contains("upscaled_path")) { $entry.upscaled_path = $null }
    if (-not $entry.Contains("upscaled_dimensions")) { $entry.upscaled_dimensions = $null }
    if (-not $entry.registered_at) { $entry.registered_at = Format-ProjectTimestamp -Date $file.LastWriteTime }
    if (-not $entry.Contains("upscaled_at")) { $entry.upscaled_at = $null }
    if (-not $entry.adobe_stock_status) { $entry.adobe_stock_status = "not_uploaded" }
    if (-not $entry.Contains("trend_topic")) { $entry.trend_topic = $null }
    if (-not $entry.Contains("series_slot")) { $entry.series_slot = $null }
    if (-not $entry.Contains("prompt_id")) { $entry.prompt_id = $null }
    if (-not $entry.Contains("media_name")) { $entry.media_name = Get-MediaName $filename }

    $imagesMap[$filename] = $entry
  }
}

if (Test-Path $upscaledDir) {
  foreach ($upscaledDateDir in Get-ChildItem -Path $upscaledDir -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^\d{4}-\d{2}-\d{2}$" }) {
    foreach ($file in Get-ImageFiles -Root $upscaledDateDir.FullName) {
      $filename = $file.Name
      $entry = if ($imagesMap.Contains($filename)) { Convert-ToPlainObject $imagesMap[$filename] } else { [ordered]@{
          source = "ai_generated"
          final_name = $filename
          original_name = $filename
          source_path = Join-Path ("downloads\" + $upscaledDateDir.Name) $filename
          dimensions = $null
          long_side = $null
          assigned_scale = Get-AssignedScale -Filename $filename -ExistingValue $null
          metadata_sidecar = $null
          registered_at = Format-ProjectTimestamp -Date $file.LastWriteTime
          adobe_stock_status = "not_uploaded"
          trend_topic = $null
          series_slot = $null
          prompt_id = $null
          media_name = Get-MediaName $filename
        }
      }

      $upscaledDimensions = Get-ImageDimensions -Path $file.FullName
      $entry.upscaled = $true
      $entry.upscaled_path = Get-ProjectRelativePath $file.FullName
      $entry.upscaled_dimensions = $upscaledDimensions
      $entry.upscaled_at = Format-ProjectTimestamp -Date $file.LastWriteTime

      $imagesMap[$filename] = $entry
    }
  }
}

$latestDateDir = Get-ChildItem -Path $downloadsDir -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match "^\d{4}-\d{2}-\d{2}$" } |
  Sort-Object Name -Descending |
  Select-Object -First 1

if ($latestDateDir) {
  $latestImages = Get-ImageFiles -Root $latestDateDir.FullName | Sort-Object LastWriteTime, Name
  $existingDownloadedByPath = @{}

  foreach ($record in @($sessionState.downloaded_images)) {
    if ($record.saved_path) {
      $existingDownloadedByPath[$record.saved_path.ToLowerInvariant()] = Convert-ToPlainObject $record
    }
  }

  $reconciledDownloadedImages = @()
  foreach ($file in $latestImages) {
    $key = $file.FullName.ToLowerInvariant()
    $existingRecord = if ($existingDownloadedByPath.ContainsKey($key)) { $existingDownloadedByPath[$key] } else { $null }
    $reconciledDownloadedImages += ,(New-DownloadedImageRecord -File $file -Existing $existingRecord -SessionState $sessionState)
  }

  $sessionState.session_date = $latestDateDir.Name
  if (-not $sessionState.session_started_at) {
    $sessionState.session_started_at = $nowJson
  }
  $sessionState.downloaded_images = $reconciledDownloadedImages
  $sessionState.images_downloaded_count = $latestImages.Count
  $sessionState.downloads_completed = $latestImages.Count
  $sessionState.current_step = "STEP_RECONCILED_FROM_DISK"
  $sessionState.last_reconciled_at = $nowJson

  $allLatestUpscaled = $true
  foreach ($file in $latestImages) {
    if (-not ($imagesMap.Contains($file.Name) -and $imagesMap[$file.Name].upscaled)) {
      $allLatestUpscaled = $false
      break
    }
  }

  if ($latestImages.Count -gt 0) {
    if ($allLatestUpscaled) {
      $sessionState.current_stage = "metadata_optimizer"
      $sessionState.last_completed_stage = "image_upscaler"
    } else {
      $sessionState.current_stage = "image_upscaler"
      $sessionState.last_completed_stage = "image_creation"
    }
  }
}

$registry.last_updated = $nowJson
$registry.total_images = @($imagesMap.Keys).Count
$registry.images = Convert-ToPlainObject $imagesMap

Save-JsonFile -Path $registryPath -Data $registry
Save-JsonFile -Path $sessionStatePath -Data $sessionState

Write-Output "Runtime data reconcile complete."
