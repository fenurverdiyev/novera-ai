param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
$bak = $app + '.bak_ui_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
$s = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) Remove MessageDisplay audio props (simple substring removal)
$s = $s -replace [regex]::Escape(' onPlayAudio={handlePlayAudio} playingMessageId={playingMessageId}'), ''

# 2) Remove SearchBar onVoiceClick line
$s = [regex]::Replace($s, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')

# 3) Remove ActiveAnimation analyserNode prop line
$s = [regex]::Replace($s, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')

# 4) Remove <audio ref={audioRef} ... /> line
$s = [regex]::Replace($s, '(?m)^\s*<audio\s+ref=\{audioRef\}[^\r\n]*\r?\n', '')

# 5) Remove <VoiceOverlay ... /> block (from opening to closing '/>')
$lines = $s -split "\r?\n"
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if (-not $skip -and $line -match '^\s*<VoiceOverlay\b') { $skip = $true; continue }
  if ($skip) { if ($line -match '/>\s*$') { $skip = $false }; continue }
  $out.Add($line) | Out-Null
}
$s = ($out -join "`r`n")

# 6) Remove handleCloseVoiceOverlay function block
$s = [regex]::Replace($s, 'const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)

[System.IO.File]::WriteAllText($app, $s, [System.Text.Encoding]::UTF8)
Write-Host "UI-only voice/overlay elements removed. Backup: $bak"
