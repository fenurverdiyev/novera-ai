param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_patch2_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Replace-LineContains {
  param([string]$contains, [string]$newContent)
  for ($i=0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -like "*${contains}*") {
      $indent = ($lines[$i] -replace "^(\s*).*$", '$1')
      $lines[$i] = $indent + $newContent
    }
  }
}

# 1) Fix BrowserView template strings
Replace-LineContains 'const id = gcse-script-' 'const id = `gcse-script-${BROWSER_ENGINE_ID}`;'
Replace-LineContains 's.src = https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID}' 's.src = `https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID}`;'
Replace-LineContains 'const url = https://www.googleapis.com/customsearch/v1?key=${BROWSER_API_KEY}&cx=${BROWSER_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}' 'const url = `https://www.googleapis.com/customsearch/v1?key=${BROWSER_API_KEY}&cx=${BROWSER_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}`;'

# 2) Fix refineVisualQuery returns (if still present)
Replace-LineContains 'if (isVideo) return ${subject} videoları' 'if (isVideo) return `${subject} videoları`;'
Replace-LineContains 'if (isImage) return ${subject} şəkilləri hd' 'if (isImage) return `${subject} şəkilləri hd`;'

# 3) Fix root container className
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -like '*className={flex h-screen bg-transparent text-text-main transition-opacity duration-500*') {
    $indent = ($lines[$i] -replace "^(\s*).*$", '$1')
    $lines[$i] = $indent + '    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? ''opacity-100'' : ''opacity-0''}`}>'
  }
}

# 4) Remove inline BrowserView component block
$start = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const BrowserView: React.FC')) { $start = $i; break }
}
if ($start -ge 0) {
  $end = -1
  for ($j=$start; $j -lt $lines.Length; $j++) {
    if ($lines[$j].Trim() -eq '};') { $end = $j; break }
  }
  if ($end -gt $start) {
    $lines = $lines[0..($start-1)] + $lines[($end+1)..($lines.Length-1)]
  }
}

# 5) Remove local containsProperNoun/extractSubjectFromHistory/refineVisualQuery block
$start2 = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].TrimStart().StartsWith('const containsProperNoun')) { $start2 = $i; break }
}
if ($start2 -ge 0) {
  $end2 = -1
  for ($j=$start2; $j -lt $lines.Length; $j++) {
    if ($lines[$j].TrimStart().StartsWith('const getPreferredNewsLocale')) { $end2 = $j; break }
  }
  if ($end2 -gt $start2) {
    $lines = $lines[0..($start2-1)] + $lines[$end2..($lines.Length-1)]
  }
}

# 6) Fix broken searchService import block
$importStart = -1
for ($i=0; $i -lt $lines.Length; $i++) {
  if ($lines[$i].Trim() -eq 'import {') { $importStart = $i; break }
}
if ($importStart -ge 0) {
  $fromIdx = -1
  for ($j=$importStart; $j -lt [Math]::Min($lines.Length, $importStart+40); $j++) {
    if ($lines[$j].Trim() -eq "} from './services/searchService';") { $fromIdx = $j; break }
  }
  if ($fromIdx -gt $importStart) {
    # Remove the broken block
    $before = @()
    if ($importStart -gt 0) { $before = $lines[0..($importStart-1)] }
    $after = @()
    if ($fromIdx + 1 -le $lines.Length - 1) { $after = $lines[($fromIdx+1)..($lines.Length-1)] }
    $lines = $before + @("import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';") + $after
  }
}

# Write back
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Patched App.tsx. Backup: " + $backup)
