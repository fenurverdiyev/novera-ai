param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_final_' + (Get-Date -Format 'yyyyMMdd_HHmmss')

Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
$orig = $content

# 1) Normalize searchService import (collapse broken multi-line into one)
$patternImport = '(?ms)^import\s*\{[\s\S]*?\}\s*from\s*[\'\"]\./services/searchService[\'\"];\s*'
$replacementImport = "import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';`r`n"
$content = [regex]::Replace($content, $patternImport, $replacementImport, [System.Text.RegularExpressions.RegexOptions]::Multiline -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 2) Remove inline BrowserView component block completely
$patternBrowserView = '(?ms)^[\t ]*const\s+BrowserView\s*:\s*React\.FC\s*=\s*\(\)\s*=>\s*\{[\s\S]*?^\s*\};\s*'
$content = [regex]::Replace($content, $patternBrowserView, '', [System.Text.RegularExpressions.RegexOptions]::Multiline -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 3) Remove local containsProperNoun/extractSubjectFromHistory/refineVisualQuery block
$patternRefineBlock = '(?ms)^[\t ]*const\s+containsProperNoun\b[\s\S]*?^(\s*const\s+getPreferredNewsLocale\b)'
$content = [regex]::Replace($content, $patternRefineBlock, '${1}', [System.Text.RegularExpressions.RegexOptions]::Multiline -bor [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 4) Fix root container className template
$patternRoot = 'className=\{flex h-screen bg-transparent text-text-main transition-opacity duration-500 \$\{isAppReady \? '\''opacity-100'\'' : '\''opacity-0'\''\} \}'
$replacementRoot = 'className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? ''opacity-100'' : ''opacity-0''}`}'
$content = [regex]::Replace($content, $patternRoot, $replacementRoot)

# 5) Ensure proper import for BrowserView (keep if not present)
if ($content -notmatch "from './components/BrowserView'") {
  $content = $content -replace "(import\\s+\\{\\s*MessageDisplay[\\s\\S]*?;\\r?\\n)", "$1import { BrowserView } from './components/BrowserView';`r`n"
}

if ($content -ne $orig) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "Final fixes applied. Backup: $backup"
} else {
  Write-Host "No changes applied in finalize step. Backup: $backup"
}
