param()
$ErrorActionPreference = 'Stop'
$p = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $p)) { throw "Not found: $p" }
$bak = $p + '.bak_fixnl_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $p -Destination $bak -Force

$c = Get-Content -LiteralPath $p -Raw -Encoding UTF8
# Replace literal backtick sequences with real CRLF and indent
$c = $c -replace ' \`r\`n', "`r`n                            "
$c = $c -replace '\`r\`n', "`r`n"

# Trim accidental extra spaces before closing tags
$c = $c -replace '\s+/>', ' />'

[System.IO.File]::WriteAllText($p, $c, [System.Text.Encoding]::UTF8)
Write-Host "Replaced literal `r`n artifacts. Backup: $bak"}
