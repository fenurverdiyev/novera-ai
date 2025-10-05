param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
$backup = $path + '.bak_fixfor_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
# Insert a missing closing brace before the accumulatedToolCalls section, if not already present
$content = [regex]::Replace($content, '(\r?\n\s*)if\s*\(accumulatedToolCalls', "`r`n}`$1if (accumulatedToolCalls")
[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Inserted missing '}' before accumulatedToolCalls. Backup: $backup"
