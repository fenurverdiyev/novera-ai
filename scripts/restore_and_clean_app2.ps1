param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
$src = 'd:\NovEra\NovEra\App.tsx.bak_finaloverlay_20251005_222445'
if (-not (Test-Path -LiteralPath $src)) { throw "Backup not found: $src" }
if (-not (Test-Path -LiteralPath $app)) { throw "App.tsx not found: $app" }
$bak = $app + '.bak_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
Copy-Item -LiteralPath $src -Destination $app -Force

$c = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# Imports cleanup
$c = [regex]::Replace($c, '(?m)^\s*import\s*\{\s*VoiceOverlay\s*\}\s*from\s*\'[^\']*\';\s*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*import\s*\{\s*ttsBinary\s*\}\s*from\s*\'[^\']*\';\s*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*import\s*\{\s*chunkText\s*\}\s*from\s*\'[^\']*\';\s*\r?\n', '')

# handleSend signature and overlay close removal
$c = $c -replace 'const handleSend = async \(query: string, images\?: string\[\], isVocalQuery: boolean = false\) => \{', 'const handleSend = async (query: string, images?: string[]) => {'
$c = [regex]::Replace($c, '(?m)^\s*setIsVoiceOverlayOpen\(false\);\s*\r?\n', '')

# Remove isVocalQuery driven voice handling blocks
$c = [regex]::Replace($c, '(?ms)^\s*if\s*\(isVocalQuery\s*&&.*?^\s*\}\s*$', '', [System.Text.RegularExpressions.RegexOptions]::Multiline)
$c = [regex]::Replace($c, '(?m)^\s*if\s*\(isVocalQuery\)\s*setLiveVocalResponse\([^)]*\);\s*$', '')
$c = [regex]::Replace($c, '(?ms)^\s*//\s*Handle any remaining text in the accumulator.*?^\s*\}\s*$', '', [System.Text.RegularExpressions.RegexOptions]::Multiline)

# Remove live response state usage (defensive)
$c = $c -replace 'setLiveVocalResponse\([^\)]*\);', ''
$c = $c -replace 'liveVocalResponse', ''

# UI usage cleanup
$c = $c -replace '\s*onPlayAudio=\{handlePlayAudio\}\s*playingMessageId=\{playingMessageId\}', ''
$c = [regex]::Replace($c, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')

# Remove VoiceOverlay JSX and <audio> element
$c = [regex]::Replace($c, '(?m)^\s*<audio ref=\{audioRef\} crossOrigin=\"anonymous\" \/>\s*\r?\n', '')
$c = [regex]::Replace($c, '(?s)<VoiceOverlay\s+[\s\S]*?\/>\s*', '')

# Remove voice/tts functions and effects
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?createMediaElementSource[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?unlockAudio[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+processVocalStream\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+stopPlayback\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?const\s+audio\s*=\s*audioRef\.current;[\s\S]*?\},\s*\[processVocalStream\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+handlePlayAudio\s*=\s*\(messageId:[\s\S]*?\};\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '')

# Remove voice-related state/refs (safe best-effort)
$c = [regex]::Replace($c, '(?m)^\s*const\s*\[playingMessageId,\s*setPlayingMessageId\][^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*\[isVoiceOverlayOpen,\s*setIsVoiceOverlayOpen\][^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*audioRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*sentenceQueueRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*isProcessingSentencesRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*currentPlayingMessageIdRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*audioContextRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*analyserRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*audioSourceRef\s*=[^\n]*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*const\s*sentenceAudioCacheRef\s*=[^\n]*\r?\n', '')

[System.IO.File]::WriteAllText($app, $c, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx restored from backup and cleaned. Original saved to $bak"
