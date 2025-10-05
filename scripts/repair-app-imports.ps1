param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_repair_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

# 1) Remove stray 'import {' line
$lines = $lines | Where-Object { $_ -notmatch '^\s*import\s*\{\s*$' }

# 2) Remove split searchService import name lines and the stray closing
$lines = $lines | Where-Object { $_ -notmatch '^\s*(searchImagesAndVideos|searchPlaces|searchNews|searchShopping|detectLocaleForSearch)\s*,?\s*$' }
$lines = $lines | Where-Object { $_ -notmatch "^\s*\}\s*from\s*'\./services/searchService';\s*$" }

# 3) Ensure the correct consolidated searchService import exists
$correctImport = "import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';"
$joined = ($lines -join "`n")
if (-not ($joined -match [Regex]::Escape($correctImport))) {
  $idxRef = (Select-String -InputObject $lines -SimpleMatch "import { refineVisualQuery } from './utils/refineVisualQuery';" | Select-Object -First 1).LineNumber
  if (-not $idxRef) {
    $idxRef = (Select-String -InputObject $lines -SimpleMatch "import { textToSpeech, AVAILABLE_VOICES } from './services/elevenLabsService';" | Select-Object -First 1).LineNumber
  }
  if ($idxRef) {
    $insertAt = [int]$idxRef
    $before = @(); if ($insertAt -gt 0) { $before = $lines[0..($insertAt-1)] }
    $after = @(); if ($insertAt -le $lines.Length-1) { $after = $lines[$insertAt..($lines.Length-1)] }
    $lines = $before + $correctImport + $after
  } else {
    $lines = @($lines[0], $correctImport) + $lines[1..($lines.Length-1)]
  }
}

# 4) Remove Browser API constants if present
$lines = $lines | Where-Object { $_ -notmatch '^\s*const\s+BROWSER_ENGINE_ID\b' -and $_ -notmatch '^\s*const\s+BROWSER_API_KEY\b' }

# 5) Remove inline BrowserViewInline component if present
$startBObj = Select-String -InputObject $lines -Pattern '^\s*const\s+BrowserViewInline\b' | Select-Object -First 1
if ($startBObj) {
  $sIdx = [int]$startBObj.LineNumber - 1
  $eIdx = -1
  for ($i=$sIdx; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\};\s*$') { $eIdx = $i; break }
  }
  if ($eIdx -ge $sIdx) {
    $before = @(); if ($sIdx -gt 0) { $before = $lines[0..($sIdx-1)] }
    $after = @(); if ($eIdx + 1 -le $lines.Length-1) { $after = $lines[($eIdx+1)..($lines.Length-1)] }
    $lines = $before + $after
  }
}

# 6) Remove duplicate local refine helpers (containsProperNoun/extractSubjectFromHistory/refineVisualQuery)
$startDupObj = Select-String -InputObject $lines -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1
$startRefObj = Select-String -InputObject $lines -Pattern '^\s*const\s+refineVisualQuery\b' | Select-Object -First 1
if ($startRefObj) {
  $sIdx2 = if ($startDupObj) { [int]$startDupObj.LineNumber - 1 } else { [int]$startRefObj.LineNumber - 1 }
  $eIdx2 = -1
  for ($i=$startRefObj.LineNumber-1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\};\s*$') { $eIdx2 = $i; break }
  }
  if ($eIdx2 -ge $sIdx2) {
    $before = @(); if ($sIdx2 -gt 0) { $before = $lines[0..($sIdx2-1)] }
    $after = @(); if ($eIdx2 + 1 -le $lines.Length-1) { $after = $lines[($eIdx2+1)..($lines.Length-1)] }
    $lines = $before + $after
  }
}

# Save back
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("App.tsx repaired. Backup: " + $backup)
