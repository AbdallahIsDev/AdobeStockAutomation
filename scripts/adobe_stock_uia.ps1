$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class Win32AdobeStock {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@

function Get-ChromeHandle {
  $script:adobeHandle = [IntPtr]::Zero
  [Win32AdobeStock]::EnumWindows({
      param($h, $l)
      if ([Win32AdobeStock]::IsWindowVisible($h)) {
        $len = [Win32AdobeStock]::GetWindowTextLength($h)
        if ($len -gt 0) {
          $sb = New-Object System.Text.StringBuilder ($len + 1)
          [void][Win32AdobeStock]::GetWindowText($h, $sb, $sb.Capacity)
          if ($sb.ToString().StartsWith('Contributors Uploaded Files - Google Chrome')) {
            $script:adobeHandle = $h
            return $false
          }
        }
      }
      return $true
    }, [IntPtr]::Zero) | Out-Null

  if ($script:adobeHandle -eq [IntPtr]::Zero) {
    throw 'Adobe Stock Chrome window not found.'
  }

  [void][Win32AdobeStock]::SetForegroundWindow($script:adobeHandle)
  return $script:adobeHandle
}

function Get-Root {
  $handle = Get-ChromeHandle
  return [System.Windows.Automation.AutomationElement]::FromHandle($handle)
}

function Get-AllElements {
  (Get-Root).FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
}

function Find-Element {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [string]$ControlType
  )

  $all = Get-AllElements
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    if ($el.Current.Name -eq $Name -and (-not $ControlType -or $el.Current.ControlType.ProgrammaticName -eq $ControlType)) {
      return $el
    }
  }

  throw "Element not found: $Name"
}

function Get-KeywordChips {
  $all = Get-AllElements
  $keywords = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    $name = $el.Current.Name
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $name -like '* Remove keyword') {
      [void]$keywords.Add(($name -replace ' Remove keyword$', ''))
    }
  }
  return $keywords
}

function Get-Metadata {
  $title = Find-Element -Name 'Content title' -ControlType 'ControlType.Edit'
  $fileType = Find-Element -Name ((Get-AllElements | ForEach-Object { $_ }) | Where-Object { $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $_.Current.Name -like '* File type' } | Select-Object -First 1).Current.Name -ControlType 'ControlType.Button'
  $category = ((Get-AllElements | ForEach-Object { $_ }) | Where-Object { $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $_.Current.Name -like '* Category' } | Select-Object -First 1)
  $language = ((Get-AllElements | ForEach-Object { $_ }) | Where-Object { $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $_.Current.Name -like '* I''m writing title & keywords in' } | Select-Object -First 1)
  $ai = Find-Element -Name 'Created using generative AI tools' -ControlType 'ControlType.CheckBox'
  $people = Find-Element -Name 'People and Property are fictional' -ControlType 'ControlType.CheckBox'

  [PSCustomObject]@{
    Title = $title.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value
    FileType = $fileType.Current.Name
    Category = if ($category) { $category.Current.Name } else { '' }
    Language = if ($language) { $language.Current.Name } else { '' }
    AIState = $ai.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState.ToString()
    PeopleState = $people.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern).Current.ToggleState.ToString()
    Keywords = [string[]](Get-KeywordChips)
    KeywordSuggestions = [string[]](Get-KeywordSuggestions)
    OriginalName = Get-OriginalName
  }
}

function Set-EditValue {
  param(
    [Parameter(Mandatory = $true)][string]$ElementName,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $element = Find-Element -Name $ElementName -ControlType 'ControlType.Edit'
  $pattern = $element.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
  $pattern.SetValue($Value)
}

function Set-CheckboxState {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][bool]$Checked
  )

  $element = Find-Element -Name $Name -ControlType 'ControlType.CheckBox'
  $pattern = $element.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  $current = $pattern.Current.ToggleState -eq [System.Windows.Automation.ToggleState]::On
  if ($current -ne $Checked) {
    $pattern.Toggle()
    Start-Sleep -Milliseconds 200
  }
}

function Select-DropdownValue {
  param(
    [Parameter(Mandatory = $true)][string]$CurrentButtonName,
    [Parameter(Mandatory = $true)][string]$TargetOptionName
  )

  $button = Find-Element -Name $CurrentButtonName -ControlType 'ControlType.Button'
  $expand = $button.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)
  $expand.Expand()
  Start-Sleep -Milliseconds 300

  $option = Find-Element -Name $TargetOptionName -ControlType 'ControlType.ListItem'
  if ($option.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$null)) {
    $sel = $option.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $sel.Select()
  } else {
    $invoke = $option.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
  }

  Start-Sleep -Milliseconds 300
}

function Clear-Keywords {
  $erase = Find-Element -Name 'Erase all keywords' -ControlType 'ControlType.Button'
  $invoke = $erase.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
  Start-Sleep -Milliseconds 300
}

function Set-Keywords {
  param([Parameter(Mandatory = $true)][string[]]$Keywords)

  $value = ($Keywords -join ', ')
  Set-EditValue -ElementName 'Paste Keywords...' -Value $value
  Start-Sleep -Milliseconds 400
}

function Get-KeywordSuggestions {
  $all = Get-AllElements
  $keywords = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    $name = $el.Current.Name
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.Button' -and $name -like '* Add keyword') {
      $left = $el.Current.BoundingRectangle.Left
      if ($left -gt 1000) {
        [void]$keywords.Add(($name -replace ' Add keyword$', '').Trim())
      }
    }
  }
  return $keywords | Select-Object -Unique
}

function Get-OriginalName {
  $all = Get-AllElements
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    $name = $el.Current.Name
    if ($name -like 'Original name(s):*') {
      return ($name -replace '^Original name\(s\):\s*', '')
    }
  }
  return ''
}

function Save-Work {
  $button = Find-Element -Name 'Save work' -ControlType 'ControlType.Button'
  $invoke = $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
  Start-Sleep -Milliseconds 1200
}

function Get-VisibleThumbnails {
  $all = Get-AllElements
  $items = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.ListItem' -and $el.Current.Name -eq 'thumbnail') {
      $rect = $el.Current.BoundingRectangle
      if ($rect.Width -gt 0 -and $rect.Height -gt 0) {
        [void]$items.Add([PSCustomObject]@{
            Index = $i
            Left = [math]::Round($rect.Left)
            Top = [math]::Round($rect.Top)
            Width = [math]::Round($rect.Width)
            Height = [math]::Round($rect.Height)
            Element = $el
          })
      }
    }
  }

  $items | Sort-Object Top, Left
}

function Select-VisibleThumbnail {
  param([Parameter(Mandatory = $true)][int]$Order)

  $thumb = Get-VisibleThumbnails | Select-Object -Skip ($Order - 1) -First 1
  if (-not $thumb) {
    throw "Visible thumbnail $Order not found."
  }

  $el = $thumb.Element
  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$null)) {
    $sel = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $sel.Select()
  } else {
    $invoke = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
  }

  Start-Sleep -Milliseconds 800
}

function Get-PageThumbnails {
  $all = Get-AllElements
  $items = New-Object System.Collections.Generic.List[object]
  for ($i = 0; $i -lt $all.Count; $i++) {
    $el = $all.Item($i)
    if ($el.Current.ControlType.ProgrammaticName -eq 'ControlType.ListItem' -and $el.Current.Name -eq 'thumbnail') {
      $rect = $el.Current.BoundingRectangle
      [void]$items.Add([PSCustomObject]@{
          Index = $i
          Left = [math]::Round($rect.Left)
          Top = [math]::Round($rect.Top)
          Width = [math]::Round($rect.Width)
          Height = [math]::Round($rect.Height)
          Element = $el
        })
    }
  }

  $items | Sort-Object Top, Left
}

function Select-PageThumbnail {
  param([Parameter(Mandatory = $true)][int]$Order)

  $thumb = Get-PageThumbnails | Select-Object -Skip ($Order - 1) -First 1
  if (-not $thumb) {
    throw "Page thumbnail $Order not found."
  }

  $el = $thumb.Element
  if ($el.TryGetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern, [ref]$null)) {
    $scroll = $el.GetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern)
    $scroll.ScrollIntoView()
    Start-Sleep -Milliseconds 250
  }

  if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$null)) {
    $sel = $el.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $sel.Select()
  } else {
    $invoke = $el.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
    $invoke.Invoke()
  }

  Start-Sleep -Milliseconds 1000
}

function Go-ToPage {
  param([Parameter(Mandatory = $true)][int]$PageNumber)

  $link = Find-Element -Name $PageNumber.ToString() -ControlType 'ControlType.Hyperlink'
  $invoke = $link.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $invoke.Invoke()
  Start-Sleep -Milliseconds 1500
}
