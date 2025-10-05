param(
  [string]$Path = 'd:\NovEra\NovEra\App.tsx'
)
$ErrorActionPreference = 'Stop'

if (!(Test-Path -LiteralPath $Path)) { Write-Host "File not found: $Path"; exit 1 }

$lines = Get-Content -LiteralPath $Path
$anchor = Select-String -LiteralPath $Path -Pattern '^\s*const\s+getPreferredNewsLocale' -List
if (-not $anchor) { Write-Host 'Anchor not found'; exit 0 }
$anchorLine = $anchor.LineNumber

$returns = Select-String -LiteralPath $Path -Pattern '^\s*return\s*\('
if (-not $returns) { Write-Host 'No return found'; exit 0 }
$returnLine = ($returns | Where-Object { $_.LineNumber -lt $anchorLine } | Select-Object -Last 1).LineNumber
if (-not $returnLine) { Write-Host 'No return before anchor'; exit 0 }

# Keep lines 1..($returnLine-1) and $anchorLine..end
$newLines = @()
if ($returnLine -gt 1) { $newLines += $lines[0..($returnLine-2)] }
$newLines += $lines[($anchorLine-1)..($lines.Length-1)]

[IO.File]::WriteAllLines($Path, $newLines, [Text.Encoding]::UTF8)
Write-Host ("Removed lines {0}..{1}" -f $returnLine, ($anchorLine-1))
