param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_finalregex_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

# Read full text
$content = Get-Content -LiteralPath $path -Encoding UTF8 -Raw

# Remove inline BrowserView component (non-greedy up to the function closing);
# Use DOTALL so . matches newlines
$content = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    '(?s)\bconst\s+BrowserViewInline\b.*?\n\s*\};\s*',
    ''
)

# Remove local helpers: containsProperNoun .. refineVisualQuery(..) .. };
$content = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    '(?s)\bconst\s+containsProperNoun\b.*?\bconst\s+refineVisualQuery\s*=\s*\(.*?\n\s*\};\s*',
    ''
)

# Remove any leftover BROWSER_* const lines if present
$content = [System.Text.RegularExpressions.Regex]::Replace(
    $content,
    '(?m)^\s*const\s+BROWSER_(ENGINE_ID|API_KEY)\b.*\r?\n',
    ''
)

# Write back
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host ("Final regex clean done. Backup: " + $backup)
