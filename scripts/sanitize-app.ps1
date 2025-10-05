param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_sanitize_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

# Read lines
$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Remove-Region {
  param([int]$startIndex, [int]$endIndex)
  if ($startIndex -ge 0 -and $endIndex -ge $startIndex -and $endIndex -lt $lines.Length) {
    $before = @()
    if ($startIndex -gt 0) { $before = $lines[0..($startIndex-1)] }
    $after = @()
    if ($endIndex + 1 -le $lines.Length - 1) { $after = $lines[($endIndex+1)..($lines.Length-1)] }
    $script:lines = $before + $after
  }
}

# 1) Repair broken multi-line import for services/searchService
$importStart = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].Trim() -eq 'import {') { $importStart = $i; break }
}
if ($importStart -ge 0) {
  $fromIdx = -1
  for ($j=$importStart; $j -lt [Math]::Min($lines.Length, $importStart+60); $j++) {
    if ($lines[$j].Trim() -eq "} from './services/searchService';") { $fromIdx = $j; break }
  }
  if ($fromIdx -gt $importStart) {
    Remove-Region -startIndex $importStart -endIndex $fromIdx
    # Insert correct single-line import at $importStart position
    $before = @()
    if ($importStart -gt 0) { $before = $lines[0..($importStart-1)] }
    $after = @()
    if ($importStart -le $lines.Length - 1) { $after = $lines[$importStart..($lines.Length-1)] }
    $fixed = "import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';"
    $script:lines = $before + @($fixed) + $after
  }
}

# 2) Remove inline BrowserView component (from its declaration to the closing '  };' at same indent)
$bvStart = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const BrowserView: React.FC')) { $bvStart = $i; break }
}
if ($bvStart -ge 0) {
  $bvEnd = -1
  for ($j=$bvStart+1; $j -lt $lines.Length; $j++) {
    # close of component is a line that is exactly '  };' or '};' with only spaces
    if ($lines[$j] -match '^\s*\};\s*$') { $bvEnd = $j; break }
  }
  if ($bvEnd -gt $bvStart) {
    Remove-Region -startIndex $bvStart -endIndex $bvEnd
  }
}

# 3) Remove local containsProperNoun/extractSubjectFromHistory/refineVisualQuery block
$blockStart = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const containsProperNoun')) { $blockStart = $i; break }
}
if ($blockStart -ge 0) {
  $blockEnd = -1
  for ($j=$blockStart+1; $j -lt $lines.Length; $j++) {
    if ($lines[$j].TrimStart().StartsWith('const getPreferredNewsLocale')) { $blockEnd = $j-1; break }
  }
  if ($blockEnd -lt 0) { $blockEnd = $blockStart } # fallback
  if ($blockEnd -ge $blockStart) { Remove-Region -startIndex $blockStart -endIndex $blockEnd }
}

# 4) Fix root container className line
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -like '*className={flex h-screen bg-transparent text-text-main transition-opacity duration-500*') {
    $indent = ($lines[$i] -replace '^(\s*).*$','$1')
    $lines[$i] = $indent + '<div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? ''opacity-100'' : ''opacity-0''}`}>'
    break
  }
}

# 5) Ensure BrowserView import exists (we kept the external component)
$hasBVImport = $false
for ($i=0; $i -lt $lines.Length; $i++) { if ($lines[$i] -like "*from './components/BrowserView'*") { $hasBVImport = $true; break } }
if (-not $hasBVImport) {
  # Insert after first import block
  $insertAt = 0
  for ($i=0; $i -lt $lines.Length; $i++) { if ($lines[$i] -like 'import *') { $insertAt = $i } else { if ($insertAt -gt 0) { break } } }
  $before = @()
  if ($insertAt -ge 0) { $before = $lines[0..$insertAt] }
  $after = @()
  if ($insertAt + 1 -le $lines.Length-1) { $after = $lines[($insertAt+1)..($lines.Length-1)] }
  $script:lines = $before + @("import { BrowserView } from './components/BrowserView';") + $after
}

# Write back
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Sanitized App.tsx. Backup: " + $backup)
