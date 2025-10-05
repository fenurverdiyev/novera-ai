param()
$ErrorActionPreference = 'Stop'
$sb = 'd:\NovEra\NovEra\components\SearchBar.tsx'
$bakGood = 'd:\NovEra\NovEra\components\SearchBar.tsx.bak_fixlivemig_20251005_203541'
if (-not (Test-Path -LiteralPath $sb)) { throw "SearchBar.tsx not found: $sb" }
if (-not (Test-Path -LiteralPath $bakGood)) { throw "Backup not found: $bakGood" }
$bakBroken = $sb + '.bak_broken_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $sb -Destination $bakBroken -Force
Copy-Item -LiteralPath $bakGood -Destination $sb -Force
# Clean live conversation UI
$s = Get-Content -LiteralPath $sb -Raw -Encoding UTF8
$s = $s -replace '\{ SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, LiveCircleIcon \}', '{ SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon }'
$s = $s -replace 'onVoiceClick:\s*\(\)\s*=>\s*void;', 'onVoiceClick?: () => void;'
$s = [regex]::Replace($s, '(?s)\r?\n\s*<button onClick=\{onVoiceClick\}.*?aria-label=\"Canlı danışıq\".*?\r?\n\s*</button>', '')
[System.IO.File]::WriteAllText($sb, $s, [System.Text.Encoding]::UTF8)
Write-Host "SearchBar.tsx restored and cleaned. Backup of broken file: $bakBroken"
