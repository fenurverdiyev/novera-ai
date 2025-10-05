param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
$backup = $path + '.bak_patchfix_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8

# Remove the onVoiceClick prop line in JSX
$content = [regex]::Replace($content, '^[ \t]*onVoiceClick=\{[^\r\n]*\}[ \t]*\r?\n', '', 'Multiline')

# Fix stray token "continuesetIsLoading(true);" -> setIsLoading(true);
$content = $content -replace 'continuesetIsLoading\(\s*true\s*\);', 'setIsLoading(true);'

# Remove broken fragment "if (isVocalQuery)}"
$content = $content -replace 'if \(isVocalQuery\)\}', ''

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Patched App.tsx. Backup: $backup"
