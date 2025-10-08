param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
$bak = $app + '.bak_striplive_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
$s = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) handleSend signature and overlay close
$s = $s -replace [regex]::Escape('const handleSend = async (query: string, images?: string[], isVocalQuery: boolean = false) => {'), 'const handleSend = async (query: string, images?: string[]) => {'
$s = [regex]::Replace($s, '(?m)^\s*setIsVoiceOverlayOpen\(false\);\s*\r?\n', '')

# 2) Remove isVocalQuery voice logic blocks and sentence acc
$s = [regex]::Replace($s, '(?m)^\s*let\s+sentenceAccumulator\s*=.*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceEndRegex\s*=.*\r?\n', '')
$s = [regex]::Replace($s, '(?s)if\s*\(\s*isVocalQuery\s*&&\s*settings\.voiceEnabled\s*\)\s*\{[\s\S]*?\}', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, '(?m)^\s*if\s*\(\s*isVocalQuery\s*\)\s*setLiveVocalResponse\([^)]*\);\s*\r?\n', '')
$s = [regex]::Replace($s, '(?s)//\s*Handle any remaining text in the accumulator[\s\S]*?\r?\n\s*\}\s*\r?\n', "\r\n}\r\n")

# 3) UI prop removals
$s = $s -replace [regex]::Escape(' onPlayAudio={handlePlayAudio} playingMessageId={playingMessageId}'), ''
$s = [regex]::Replace($s, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')

# 4) Remove audio element and VoiceOverlay JSX block
$s = [regex]::Replace($s, '(?m)^\s*<audio\s+ref=\{audioRef\}[^\r\n]*\r?\n', '')
# Remove <VoiceOverlay ... /> block
$lines = $s -split "\r?\n"
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if (-not $skip -and $line -match '^\s*<VoiceOverlay\b') { $skip = $true; continue }
  if ($skip) { if ($line -match '/>\s*$') { $skip = $false }; continue }
  $out.Add($line) | Out-Null
}
$s = ($out -join "`r`n")

# 5) Remove handleCloseVoiceOverlay function
$s = [regex]::Replace($s, '(?s)const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '')

# 6) Remove audio/TTS hooks and functions
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?createMediaElementSource[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?window\.addEventListener\([\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+processVocalStream\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+stopPlayback\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$s = [regex]::Replace($s, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?audio\.addEventListener\([\s\S]*?\},\s*\[\s*processVocalStream\s*\]\s*\);\s*', '')
$s = [regex]::Replace($s, '(?s)const\s+handlePlayAudio\s*=\s*\(messageId:[\s\S]*?\);\s*', '')

# 7) Remove top-level voice refs/state (best-effort)
$s = [regex]::Replace($s, '(?m)^\s*const\s*\[\s*playingMessageId\s*,\s*setPlayingMessageId\s*\][^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s*\[\s*isVoiceOverlayOpen\s*,\s*setIsVoiceOverlayOpen\s*\][^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceQueueRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+isProcessingSentencesRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+currentPlayingMessageIdRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioContextRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+analyserRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioSourceRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceAudioCacheRef\s*=[^\r\n]*\r?\n', '')

[System.IO.File]::WriteAllText($app, $s, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx stripped of live/TTS/overlay. Backup: $bak"
