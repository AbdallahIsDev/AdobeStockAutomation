param(
  [int]$Start = 1,
  [int]$End = 10
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\adobe_stock_uia.ps1"

function Remove-Diacritics {
  param([string]$Text)
  $normalized = $Text.Normalize([Text.NormalizationForm]::FormD)
  $sb = New-Object System.Text.StringBuilder
  foreach ($ch in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$sb.Append($ch)
    }
  }
  $sb.ToString().Normalize([Text.NormalizationForm]::FormC)
}

function Convert-ToTitleCase {
  param([string]$Text)
  if (-not $Text) { return '' }
  $ti = [System.Globalization.CultureInfo]::GetCultureInfo('en-US').TextInfo
  $lower = $Text.ToLowerInvariant()
  return $ti.ToTitleCase($lower)
}

function Get-GenericTitlePatterns {
  @(
    'abstract architecture background',
    'background',
    'illustration',
    'image',
    'photo',
    'generative ai'
  )
}

function Test-WeakTitle {
  param([string]$Title)
  if (-not $Title) { return $true }
  $trimmed = $Title.Trim().ToLowerInvariant()
  if ($trimmed.Length -lt 16) { return $true }
  foreach ($pattern in Get-GenericTitlePatterns) {
    if ($trimmed -eq $pattern) { return $true }
  }
  return $false
}

function Clean-OriginalName {
  param([string]$OriginalName)

  if (-not $OriginalName) { return '' }

  $text = $OriginalName
  $text = $text -replace '\.[A-Za-z0-9]+$', ''
  $text = $text -replace '\(\d+\)', ' '
  $text = $text -replace '[_\-]+', ' '
  $text = $text -replace '\s+', ' '
  $text = Remove-Diacritics $text

  $splitters = @(
    ', in the style of',
    ' in the style of',
    ', style of',
    ', in style of',
    ', rendered in',
    ', trending on',
    ', unreal engine',
    ', octane render',
    ', ar '
  )

  foreach ($splitter in $splitters) {
    $idx = $text.ToLowerInvariant().IndexOf($splitter)
    if ($idx -gt 0) {
      $text = $text.Substring(0, $idx)
      break
    }
  }

  $prefixes = @(
    'medium shot ',
    'close up ',
    'close-up ',
    'top view ',
    'aerial view ',
    'wide shot ',
    'portrait of ',
    'photo of '
  )
  foreach ($prefix in $prefixes) {
    if ($text.ToLowerInvariant().StartsWith($prefix)) {
      $text = $text.Substring($prefix.Length)
      break
    }
  }

  $text = $text -replace '^\s*(a|an|the)\s+', ''
  $text = $text -replace '\s+', ' '
  $text = $text.Trim(' ', ',', '.', '-')
  return $text
}

function Shorten-Title {
  param(
    [string]$Title,
    [int]$MaxLength = 68
  )

  if ($Title.Length -le $MaxLength) {
    return $Title
  }

  $cut = $Title.Substring(0, $MaxLength)
  $lastSpace = $cut.LastIndexOf(' ')
  if ($lastSpace -gt 25) {
    return $cut.Substring(0, $lastSpace).Trim()
  }
  return $cut.Trim()
}

function Build-Title {
  param([pscustomobject]$Metadata)

  $clean = Clean-OriginalName $Metadata.OriginalName
  if ($clean) {
    return Shorten-Title (Convert-ToTitleCase $clean)
  }

  $terms = @($Metadata.KeywordSuggestions | Where-Object { $_ -and $_.Length -gt 2 })
  if (-not $terms) { return '' }

  $phrase = ($terms | Select-Object -First 6) -join ' '
  return Shorten-Title (Convert-ToTitleCase $phrase)
}

function Build-Keywords {
  param([pscustomobject]$Metadata)

  if ($Metadata.Keywords -and $Metadata.Keywords.Count -ge 20) {
    return [string[]]$Metadata.Keywords
  }

  $keywords = New-Object System.Collections.Generic.List[string]
  $title = Build-Title $Metadata

  if ($title) {
    $titlePhrase = $title.ToLowerInvariant()
    if ($titlePhrase.Length -le 40) {
      [void]$keywords.Add($titlePhrase)
    }
  }

  foreach ($kw in $Metadata.KeywordSuggestions) {
    if ($kw) {
      [void]$keywords.Add($kw.ToLowerInvariant())
    }
  }

  if ($Metadata.AIState -eq 'On' -and -not ($keywords -contains 'generative ai')) {
    [void]$keywords.Add('generative ai')
  }

  if ($Metadata.FileType -like 'Illustrations*' -or $Metadata.AIState -eq 'On') {
    if (-not ($keywords -contains 'illustration')) {
      [void]$keywords.Add('illustration')
    }
  }

  $clean = Clean-OriginalName $Metadata.OriginalName
  foreach ($token in ($clean.ToLowerInvariant() -split ' ')) {
    if ($token.Length -gt 3 -and $token -notmatch '^(with|next|this|that|from|dark|light|realist|detail|style|artist)$') {
      [void]$keywords.Add($token)
    }
  }

  $categoryToken = ($Metadata.Category -replace ' Category$', '').ToLowerInvariant()
  foreach ($extra in @('background', 'concept', $categoryToken)) {
    if ($extra) {
      [void]$keywords.Add($extra)
    }
  }

  $unique = New-Object System.Collections.Generic.List[string]
  foreach ($kw in $keywords) {
    $trimmed = ($kw -replace '\s+', ' ').Trim(' ', ',', '.')
    if ($trimmed -and -not ($unique -contains $trimmed)) {
      [void]$unique.Add($trimmed)
    }
  }

  if ($unique.Count -gt 30) {
    return [string[]]($unique | Select-Object -First 30)
  }

  $fallbacks = @('design', 'creative', 'stock image', 'commercial use', 'template')
  foreach ($fallback in $fallbacks) {
    if ($unique.Count -ge 20) { break }
    if (-not ($unique -contains $fallback)) {
      [void]$unique.Add($fallback)
    }
  }

  return [string[]]$unique
}

function Update-Asset {
  param([int]$Order)

  Select-PageThumbnail -Order $Order
  $metadata = Get-Metadata

  if ($metadata.AIState -eq 'On' -and $metadata.FileType -eq 'Photos File type') {
    Select-DropdownValue -CurrentButtonName 'Photos File type' -TargetOptionName 'Illustrations'
    $metadata = Get-Metadata
  }

  if (Test-WeakTitle $metadata.Title) {
    $title = Build-Title $metadata
    if ($title) {
      Set-EditValue -ElementName 'Content title' -Value $title
    }
  }

  $keywords = Build-Keywords $metadata
  if ($keywords.Count -ge 5) {
    Set-Keywords -Keywords $keywords
  }

  Save-Work

  $final = Get-Metadata
  [PSCustomObject]@{
    Order = $Order
    Title = $final.Title
    FileType = $final.FileType
    Category = $final.Category
    KeywordCount = if ($final.Keywords) { $final.Keywords.Count } elseif ($final.KeywordSuggestions) { $final.KeywordSuggestions.Count } else { 0 }
  }
}

$results = New-Object System.Collections.Generic.List[object]
for ($i = $Start; $i -le $End; $i++) {
  try {
    $result = Update-Asset -Order $i
    [void]$results.Add($result)
    Write-Output ("Processed {0}: {1}" -f $i, $result.Title)
  } catch {
    Write-Output ("Failed {0}: {1}" -f $i, $_.Exception.Message)
  }
}

$results | ConvertTo-Json -Depth 4
