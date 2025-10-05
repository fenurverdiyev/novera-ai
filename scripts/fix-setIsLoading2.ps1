param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
$backup = $path + '.bak_setloading_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
# Replace any line that contains the special comment with a real call
$pattern = '^[^\r\n]*//\s*Always\s*close\s*overlay;[\s\S]*?\r?\n'
$replacement = "    setIsLoading(true);`r`n"
$content = [regex]::Replace($content, $pattern, $replacement, 'Multiline')

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Replaced setIsLoading comment with code. Backup: $backup"
