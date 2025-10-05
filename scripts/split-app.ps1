param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_split_' + (Get-Date -Format 'yyyyMMdd_HHmmss')

Copy-Item -LiteralPath $path -Destination $backup -Force

# Read file
$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8

$original = $content

function Remove-BlockBetween {
  param(
    [string]$Text,
    [string]$StartMarker,
    [string]$EndMarker,
    [switch]$IncludeEndMarker
  )
  $start = $Text.IndexOf($StartMarker)
  if ($start -lt 0) { return $Text }
  $end = $Text.IndexOf($EndMarker, $start)
  if ($end -lt 0) { return $Text }
  if ($IncludeEndMarker) { $end += $EndMarker.Length }
  return $Text.Remove($start, $end - $start)
}

# 1) Remove chunkText local definition
$content = [regex]::Replace($content, 'const\s+chunkText\s*=\s*\(text:\s*string\)\s*:\s*string\[\]\s*=>\s*{[\s\S]*?};\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 2) Remove has* intent helpers and build/wants block (everything up to App component)
$content = Remove-BlockBetween -Text $content -StartMarker "const hasVisualIntent = (q: string): boolean => {" -EndMarker "const App: React.FC = () => {"

# 3) Remove inline BrowserView component (keep following functions)
$content = Remove-BlockBetween -Text $content -StartMarker "  const BrowserView: React.FC = () => {" -EndMarker "  const containsProperNoun = (text: string): boolean => {"

# 4) Remove containsProperNoun/extractSubjectFromHistory/refineVisualQuery block
$content = Remove-BlockBetween -Text $content -StartMarker "  const containsProperNoun = (text: string): boolean => {" -EndMarker "  const getPreferredNewsLocale = useCallback((): { hl: string; gl: string } => {"

# 5) Ensure imports exist
$importsToAdd = @()
if ($content -notmatch "from './components/BrowserView'") {
  $importsToAdd += "import { BrowserView } from './components/BrowserView';"
}
if ($content -notmatch "from './utils/text'") {
  $importsToAdd += "import { chunkText } from './utils/text';"
}
if ($content -notmatch "from './utils/intents'") {
  $importsToAdd += "import { hasVisualIntent, hasPlaceIntent, hasNewsIntent, hasShoppingIntent, buildPlaceRecommendations, buildProductRecommendations, wantsProductRecommendations } from './utils/intents';"
}
if ($content -notmatch "from './utils/refineVisualQuery'") {
  $importsToAdd += "import { refineVisualQuery } from './utils/refineVisualQuery';"
}

if ($importsToAdd.Count -gt 0) {
  $lines = $content -split "\r?\n"
  $importEnd = -1
  for ($i=0; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^import ') { $importEnd = $i } else { if ($importEnd -ge 0) { break } }
  }
  if ($importEnd -ge 0) {
    $before = $lines[0..$importEnd]
    $after = $lines[($importEnd+1)..($lines.Length-1)]
    $content = ($before + $importsToAdd + $after) -join [Environment]::NewLine
  } else {
    $content = ($importsToAdd + '' + $lines) -join [Environment]::NewLine
  }
}

if ($content -ne $original) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "Split/refactor applied. Backup: $backup"
} else {
  Write-Host "No changes applied. Backup: $backup"
}
