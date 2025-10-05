param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_hdr_inline_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

# Read lines
$lines = Get-Content -LiteralPath $path -Encoding UTF8

# 1) Fix broken import block for searchService
$lines = $lines | Where-Object { $_ -notmatch '^\s*import\s*\{\s*$' } # remove lonely 'import {'
$lines = $lines | Where-Object { $_ -notmatch '^\s*(searchImagesAndVideos|searchPlaces|searchNews|searchShopping|detectLocaleForSearch)\s*,?\s*$' } # remove split names
$lines = $lines | Where-Object { $_ -notmatch '^\s*\}\s*from\s*\'\./services/searchService\';\s*$' } # remove stray closing of split import

# Ensure correct searchService import exists
$correctImport = "import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';"
$hasCorrect = ($lines -join "`n") -match [Regex]::Escape($correctImport)
if (-not $hasCorrect) {
  $idx = ($lines | Select-String -SimpleMatch "import { refineVisualQuery } from './utils/refineVisualQuery';" | Select-Object -First 1).LineNumber
  if (-not $idx) {
    $idx = ($lines | Select-String -SimpleMatch "import { textToSpeech, AVAILABLE_VOICES } from './services/elevenLabsService';" | Select-Object -First 1).LineNumber
  }
  if ($idx) {
    $insertAt = [int]$idx
    $before = @(); if ($insertAt -gt 0) { $before = $lines[0..($insertAt-1)] }
    $after = @(); if ($insertAt -le $lines.Length-1) { $after = $lines[$insertAt..($lines.Length-1)] }
    $lines = $before + $correctImport + $after
  } else {
    # fallback: prepend near top after first line
    $lines = @($lines[0], $correctImport) + $lines[1..($lines.Length-1)]
  }
}

# 2) Remove inline BrowserView and API key constants if present
# Remove constants
$lines = $lines | Where-Object { $_ -notmatch '^\s*const\s+BROWSER_ENGINE_ID\b' -and $_ -notmatch '^\s*const\s+BROWSER_API_KEY\b' }

# Remove BrowserViewInline component block
$startB = ($lines | Select-String -Pattern '^\s*const\s+BrowserViewInline\b' | Select-Object -First 1).LineNumber
if ($startB) {
  $sIdx = [int]$startB - 1
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

# 3) Remove duplicate local refine helpers/functions
$startDup = ($lines | Select-String -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1).LineNumber
$startRefine = ($lines | Select-String -Pattern '^\s*const\s+refineVisualQuery\b' | Select-Object -First 1).LineNumber
if ($startRefine) {
  $sIdx2 = if ($startDup) { [int]$startDup - 1 } else { [int]$startRefine - 1 }
  $eIdx2 = -1
  for ($i=$startRefine-1; $i -lt $lines.Length; $i++) {
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
Write-Host ("Fixed imports and removed inline blocks. Backup: " + $backup)
