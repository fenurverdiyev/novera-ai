param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
$src = 'd:\NovEra\NovEra\App.tsx.bak_finaloverlay_20251005_222445'
if (-not (Test-Path -LiteralPath $src)) { throw "Backup not found: $src" }
if (-not (Test-Path -LiteralPath $app)) { throw "App.tsx not found: $app" }
$bak = $app + '.bak_before_copy_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
Copy-Item -LiteralPath $src -Destination $app -Force

$c = Get-Content -LiteralPath $app -Raw -Encoding UTF8
# Remove VoiceOverlay import
$c = [regex]::Replace($c, '(?m)^\s*import\s*\{\s*VoiceOverlay\s*\}\s*from\s*\'[^\']*\';\s*\r?\n', '')
# Remove onPlayAudio/playingMessageId usage
$c = $c -replace '\s*onPlayAudio=\{handlePlayAudio\}\s*playingMessageId=\{playingMessageId\}', ''
# Remove analyserNode prop
$c = [regex]::Replace($c, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')
# Remove onVoiceClick prop
$c = [regex]::Replace($c, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')
# Remove <audio> element
$c = [regex]::Replace($c, '(?m)^\s*<audio ref=\{audioRef\} crossOrigin=\"anonymous\" \/>\s*\r?\n', '')
# Remove VoiceOverlay JSX block
$lines = $c -split "\r?\n"
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if (-not $skip -and $line -match '<VoiceOverlay') { $skip = $true; continue }
  if ($skip) { if ($line -match '/>') { $skip = $false }; continue }
  $out.Add($line) | Out-Null
}
$c2 = ($out -join "`r`n")
[System.IO.File]::WriteAllText($app, $c2, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx restored from backup and UI pruned. Previous saved to $bak"
