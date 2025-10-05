param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_fix_' + (Get-Date -Format 'yyyyMMdd_HHmmss')

Copy-Item -LiteralPath $path -Destination $backup -Force

# Read as raw text (UTF-8)
$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8

# 1) Fix inline BrowserView template strings (id/src/url)
# const id = gcse-script-${BROWSER_ENGINE_ID} ; -> backticked template
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'const\s+id\s*=\s*gcse-script-\$\{BROWSER_ENGINE_ID\}\s*;',
  'const id = `gcse-script-${BROWSER_ENGINE_ID}`;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# s.src = https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID} ; -> backticked
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  's\.src\s*=\s*https://cse\.google\.com/cse\.js\?cx=\$\{BROWSER_ENGINE_ID\}\s*;',
  's.src = `https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID}`;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# const url = https://www.googleapis.com/customsearch/v1?key=... -> backticked
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'const\s+url\s*=\s*https://www\.googleapis\.com/customsearch/v1\?key=\$\{BROWSER_API_KEY\}&cx=\$\{BROWSER_ENGINE_ID\}&q=\$\{encodeURIComponent\(query\)\}&start=\$\{start\}\s*;',
  'const url = `https://www.googleapis.com/customsearch/v1?key=${BROWSER_API_KEY}&cx=${BROWSER_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}`;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# 2) Fix refineVisualQuery returns (if present)
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'if\s*\(isVideo\)\s*return\s*\$\{subject\}\s*videoları\s*;',
  'if (isVideo) return `${subject} videoları`;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'if\s*\(isImage\)\s*return\s*\$\{subject\}\s*şəkilləri\s*hd\s*;',
  'if (isImage) return `${subject} şəkilləri hd`;',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# 3) Root container className -> backticked template string
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'className=\{flex h-screen bg-transparent text-text-main transition-opacity duration-500 \$\{isAppReady \? ''opacity-100'' : ''opacity-0''\} \}',
  'className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? ''opacity-100'' : ''opacity-0''}`}',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# 4) Rename inline BrowserView to avoid name clash (if still present)
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  'const\s+BrowserView\s*:\s*React\.FC',
  'const BrowserViewInline: React.FC',
  [System.Text.RegularExpressions.RegexOptions]::Singleline
)

# 5) Remove local containsProperNoun/extractSubjectFromHistory/refineVisualQuery block
$content = [System.Text.RegularExpressions.Regex]::Replace(
  $content,
  '^[\t ]*const\s+containsProperNoun[\s\S]*?^(\s*const\s+getPreferredNewsLocale\b)',
  '$1',
  [System.Text.RegularExpressions.RegexOptions]::Singleline -bor [System.Text.RegularExpressions.RegexOptions]::Multiline
)

# Write back
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host ('Applied remnants fix. Backup: ' + $backup)
