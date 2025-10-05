param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
$backup = $path + '.bak_livesplit_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8

# Remove any onVoiceClick prop occurrences in JSX (line or inline)
$content = [regex]::Replace($content, '^[ \t]*onVoiceClick=\{[^\r\n]*\}[ \t]*\r?\n', '', 'Multiline')
$content = $content -replace ',\s*onVoiceClick=\{[^}]*\}\s*', ' '
$content = $content -replace 'onVoiceClick=\{[^}]*\}\s*', ' '

# Fix bad token continuesetIsLoading(true);
$content = $content -replace 'continuesetIsLoading\(\s*true\s*\);', 'setIsLoading(true);'

# Remove broken fragments for live overlay
$content = $content -replace 'if\s*\(\s*isVocalQuery\s*\)\s*\}', ''

# Also remove any leftover calls to setIsVoiceOverlayOpen / setLiveVocalResponse
$content = [regex]::Replace($content, '\s*setIsVoiceOverlayOpen\([^)]*\);\s*', '', 'Singleline')
$content = [regex]::Replace($content, '\s*setLiveVocalResponse\([^)]*\);\s*', '', 'Singleline')

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Finalized App.tsx live split. Backup: $backup"
