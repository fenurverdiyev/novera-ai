param()
$ErrorActionPreference = 'Stop'
$app = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
$bak = $app + '.bak_logic_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bak -Force
$s = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) handleSend signature and overlay close line
$s = $s -replace [regex]::Escape('const handleSend = async (query: string, images?: string[], isVocalQuery: boolean = false) => {'), 'const handleSend = async (query: string, images?: string[]) => {'
$s = [regex]::Replace($s, '(?m)^\s*//\s*Always close overlay;.*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*setIsVoiceOverlayOpen\(\s*false\s*\);\s*\r?\n', '')

# 2) Remove sentence accumulator and regex
$s = [regex]::Replace($s, '(?m)^\s*let\s+sentenceAccumulator\s*=.*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceEndRegex\s*=.*\r?\n', '')

# 3) Remove isVocalQuery related blocks
$s = [regex]::Replace($s, 'if\s*\(\s*isVocalQuery\s*&&\s*settings\.voiceEnabled\s*\)\s*\{[\s\S]*?\}', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, '(?m)^\s*if\s*\(\s*isVocalQuery\s*\)\s*setLiveVocalResponse\([^\r\n]*\);\s*\r?\n', '')
$s = [regex]::Replace($s, 'if\s*\(\s*isVocalQuery\s*&&\s*settings\.voiceEnabled\s*&&\s*sentenceAccumulator\.trim\(\)\s*\)\s*\{[\s\S]*?\}', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 4) Remove sentenceAccumulator updates inside streaming loop
$s = [regex]::Replace($s, '(?m)^\s*sentenceAccumulator\s*\+=\s*chunk\.text;\s*\r?\n', '')

# 5) Remove audio/TTS functions and effects (exact blocks)
$s = [regex]::Replace($s, 'useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?createMediaElementSource[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, 'useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?window\.addEventListener\([\s\S]*?\},\s*\[\s*\]\s*\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, 'useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?audio\.addEventListener\([\s\S]*?\},\s*\[\s*processVocalStream\s*\]\s*\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, 'const\s+processVocalStream\s*=\s*useCallback\([\s\S]*?\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, 'const\s+stopPlayback\s*=\s*useCallback\([\s\S]*?\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)
$s = [regex]::Replace($s, 'const\s+handlePlayAudio\s*=\s*\(messageId:[\s\S]*?\);\s*', '', [System.Text.RegularExpressions.RegexOptions]::Singleline)

# 6) Remove any now-dead TTS error mapping lines
$s = [regex]::Replace($s, '(?m)^\s*setMessages\(prev\s*=>\s*prev\.map\(m\s*=>\s*m\.id\s*===\s*currentPlayingMessageIdRef\.current\s*\?\s*\{\s*\.\.\.m,\s*ttsError:[^\r\n]*\}\s*:\s*m\)\);\s*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*setMessages\(prev\s*=>\s*prev\.map\(m\s*=>\s*m\.id\s*===\s*messageId\s*\?\s*\{\s*\.\.\.m,\s*ttsError:[^\r\n]*\}\s*:\s*m\)\);\s*\r?\n', '')

# 7) Remove any remaining dangling refs/state declarations if present (best-effort)
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceQueueRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+isProcessingSentencesRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+currentPlayingMessageIdRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioContextRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+analyserRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+audioSourceRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s+sentenceAudioCacheRef\s*=[^\r\n]*\r?\n', '')
$s = [regex]::Replace($s, '(?m)^\s*const\s*\[\s*playingMessageId\s*,\s*setPlayingMessageId\s*\][^\r\n]*\r?\n', '')

[System.IO.File]::WriteAllText($app, $s, [System.Text.Encoding]::UTF8)
Write-Host "Voice/TTS logic removed. Backup: $bak"
