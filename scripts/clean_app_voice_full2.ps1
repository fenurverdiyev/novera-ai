param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
$bak = $app + '.bak_voice_strip2_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
$s = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# Remove sentence accumulator and regex
$s = [regex]::Replace($s, '(?m)^\s*let\s+sentenceAccumulator\s*=.*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceEndRegex\s*=.*\r?\n', '')
# Remove any "if (false && settings.voiceEnabled) { ... }" blocks (two occurrences possible)
$s = [regex]::Replace($s, 'if\s*\(\s*false\s*&&\s*settings\.voiceEnabled\s*\)\s*\{[\s\S]*?\}', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
# Remove sentenceAccumulator usage in loop
$s = [regex]::Replace($s, '(?m)^\s*sentenceAccumulator\s*\+=\s*chunk\.text;\s*\r?\n', '')
# Remove the trailing accumulator flush block, keep the closing brace of the loop
$s = [regex]::Replace($s, '(?s)//\s*Handle any remaining text in the accumulator[\s\S]*?\}\s*\r?\n', "}\r\n")
# Remove handleCloseVoiceOverlay (no overlay in this app)
$s = [regex]::Replace($s, '(?m)^\s*const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{\s*setIsVoiceOverlayOpen\(false\);\s*\};\s*\r?\n', '')

# Remove audio/TTS effects and functions
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?createMediaElementSource[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?window\.addEventListener\([\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+processVocalStream\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+stopPlayback\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?audio\.addEventListener\([\s\S]*?\},\s*\[\s*processVocalStream\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+handlePlayAudio\s*=\s*\(messageId:[\s\S]*?\);\s*', '')

[System.IO.File]::WriteAllText($app, $s, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx voice/TTS/overlay code removed (phase 2). Backup: $bak"
