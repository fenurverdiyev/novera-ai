param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_fiximports_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Insert-After-Imports {
  param([string[]]$importLines)
  # find last import line index
  $lastImport = -1
  for ($i=0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^import ') { $lastImport = $i } else { if ($lastImport -ge 0) { break } }
  }
  if ($lastImport -ge 0 -and $importLines.Count -gt 0) {
    $before = @()
    if ($lastImport -ge 0) { $before = $lines[0..$lastImport] }
    $after = @()
    if ($lastImport + 1 -le $lines.Length - 1) { $after = $lines[($lastImport+1)..($lines.Length-1)] }
    $script:lines = $before + $importLines + $after
  }
}

# Determine missing imports
$needChunk = $true
$needIntents = $true
$needRefine = $true
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -like "*from './utils/text'*") { $needChunk = $false }
  if ($lines[$i] -like "*from './utils/intents'*") { $needIntents = $false }
  if ($lines[$i] -like "*from './utils/refineVisualQuery'*") { $needRefine = $false }
}

$toAdd = @()
if ($needChunk) { $toAdd += "import { chunkText } from './utils/text';" }
if ($needIntents) { $toAdd += "import { hasVisualIntent, hasPlaceIntent, hasNewsIntent, hasShoppingIntent, buildPlaceRecommendations, buildProductRecommendations, wantsProductRecommendations } from './utils/intents';" }
if ($needRefine) { $toAdd += "import { refineVisualQuery } from './utils/refineVisualQuery';" }

if ($toAdd.Count -gt 0) { Insert-After-Imports -importLines $toAdd }

# Remove inline BrowserViewInline component if present
$startBV = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const BrowserViewInline: React.FC')) { $startBV = $i; break }
}
if ($startBV -ge 0) {
  $endBV = -1
  for ($j=$startBV+1; $j -lt $lines.Length; $j++) { if ($lines[$j] -match '^\s*\};\s*$') { $endBV = $j; break } }
  if ($endBV -gt $startBV) {
    $before = @(); if ($startBV -gt 0) { $before = $lines[0..($startBV-1)] }
    $after = @(); if ($endBV + 1 -le $lines.Length - 1) { $after = $lines[($endBV+1)..($lines.Length-1)] }
    $lines = $before + $after
  }
}

# Remove local containsProperNoun/extractSubjectFromHistory/refineVisualQuery block if present
$startBlock = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const containsProperNoun')) { $startBlock = $i; break }
}
if ($startBlock -ge 0) {
  $endBlock = -1
  for ($j=$startBlock+1; $j -lt $lines.Length; $j++) {
    if ($lines[$j].TrimStart().StartsWith('const getPreferredNewsLocale')) { $endBlock = $j - 1; break }
  }
  if ($endBlock -lt 0) { $endBlock = $startBlock }
  if ($endBlock -ge $startBlock) {
    $before = @(); if ($startBlock -gt 0) { $before = $lines[0..($startBlock-1)] }
    $after = @(); if ($endBlock + 1 -le $lines.Length - 1) { $after = $lines[($endBlock+1)..($lines.Length-1)] }
    $lines = $before + $after
  }
}

# Fix root container className template string
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -like '*className={flex h-screen bg-transparent text-text-main transition-opacity duration-500*') {
    $indent = ($lines[$i] -replace '^(\s*).*$','$1')
    $lines[$i] = $indent + '<div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? ''opacity-100'' : ''opacity-0''}`}>'
    break
  }
}

# Save
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Fixed imports and cleaned blocks. Backup: " + $backup)
