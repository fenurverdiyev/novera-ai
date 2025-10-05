param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
$src = 'd:\NovEra\NovEra\App.tsx.bak_finaloverlay_20251005_222445'
if (-not (Test-Path -LiteralPath $src)) { throw "Backup not found: $src" }
if (-not (Test-Path -LiteralPath $app)) { throw "App.tsx not found: $app" }
$bak = $app + '.bak_before_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
Copy-Item -LiteralPath $src -Destination $app -Force

# Apply minimal adjustments to align with updated components
$c = Get-Content -LiteralPath $app -Raw -Encoding UTF8
# Remove onPlayAudio/playingMessageId in MessageDisplay usage
$c = $c -replace '\s*onPlayAudio=\{handlePlayAudio\}\s*playingMessageId=\{playingMessageId\}', ''
# Remove analyserNode prop from ActiveAnimation
$c = [regex]::Replace($c, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')
# Remove onVoiceClick prop from SearchBar
$c = [regex]::Replace($c, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')
[System.IO.File]::WriteAllText($app, $c, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx restored from backup and minimally adjusted. Previous version saved to $bak"
