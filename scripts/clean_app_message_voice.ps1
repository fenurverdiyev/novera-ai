param()
$ErrorActionPreference = 'Stop'

# Paths
$app = 'd:\NovEra\NovEra\App.tsx'
$msg = 'd:\NovEra\NovEra\components\MessageDisplay.tsx'

if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
if (-not (Test-Path -LiteralPath $msg)) { throw "Not found: $msg" }

# --- Clean App.tsx ---
$bakApp = $app + '.bak_voice_cleanup_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $bakApp -Force
$c = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) handleSend signature and remove overlay close
$c = $c -replace 'const handleSend = async \(query: string, images\?: string\[\], isVocalQuery: boolean = false\) => \{', 'const handleSend = async (query: string, images?: string[]) => {'
$c = [regex]::Replace($c, '(?m)^\s*setIsVoiceOverlayOpen\(false\);\s*\r?\n', '')

# 2) remove isVocalQuery related blocks and live vocal updates
$c = [regex]::Replace($c, '(?ms)^\s*if\s*\(isVocalQuery\s*&&.*?^\s*\}\s*$', '', [System.Text.RegularExpressions.RegexOptions]::Multiline)
$c = [regex]::Replace($c, '(?m)^\s*if\s*\(isVocalQuery\)\s*setLiveVocalResponse\([^)]*\);\s*$', '')
$c = [regex]::Replace($c, '(?ms)^\s*//\s*Handle any remaining text in the accumulator.*?^\s*\}\s*$', '', [System.Text.RegularExpressions.RegexOptions]::Multiline)

# 3) UI prop removals
$c = $c -replace '\s*onPlayAudio=\{handlePlayAudio\}\s*playingMessageId=\{playingMessageId\}', ''
$c = [regex]::Replace($c, '(?m)^\s*onVoiceClick=\{\(\)\s*=>\s*setIsVoiceOverlayOpen\(true\)\}\s*\r?\n', '')
$c = [regex]::Replace($c, '(?m)^\s*analyserNode=\{analyserRef\.current\}\s*\r?\n', '')

# 4) Remove audio/overlay elements and functions/effects
$c = [regex]::Replace($c, '(?m)^\s*<audio ref=\{audioRef\} crossOrigin=\"anonymous\" \/>\s*\r?\n', '')
$c = [regex]::Replace($c, '(?s)<VoiceOverlay\s+[\s\S]*?\/>\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '')
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?createMediaElementSource[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?unlockAudio[\s\S]*?\},\s*\[\s*\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+processVocalStream\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+stopPlayback\s*=\s*useCallback\([\s\S]*?\);\s*', '')
$c = [regex]::Replace($c, '(?s)useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?const\s+audio\s*=\s*audioRef\.current;[\s\S]*?\},\s*\[processVocalStream\]\s*\);\s*', '')
$c = [regex]::Replace($c, '(?s)const\s+handlePlayAudio\s*=\s*\(messageId:[\s\S]*?\};\s*', '')

[System.IO.File]::WriteAllText($app, $c, [System.Text.Encoding]::UTF8)

# --- Clean MessageDisplay.tsx ---
$bakMsg = $msg + '.bak_voice_cleanup_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $msg -Destination $bakMsg -Force
$m = Get-Content -LiteralPath $msg -Raw -Encoding UTF8

# Keep PlayIcon (used in VideoPreview). Remove PauseIcon only.
$m = $m -replace '\{ BotIcon, UserIcon, PlayIcon, PauseIcon \}', '{ BotIcon, UserIcon, PlayIcon }'
# Remove props
$m = [regex]::Replace($m, '(?m)^\s*onPlayAudio:\s*\(messageId:\s*string,\s*text:\s*string\)\s*=>\s*void;\s*$', '')
$m = [regex]::Replace($m, '(?m)^\s*playingMessageId:\s*string\s*\|\s*null;\s*$', '')
# Component signature
$m = $m -replace '\(\{ message, onRelatedQuery, onPlayAudio, playingMessageId \}\)', '({ message, onRelatedQuery })'
# Remove isPlaying and handlePlayClick
$m = [regex]::Replace($m, '(?m)^\s*const\s+isPlaying\s*=\s*message\.id\s*===\s*playingMessageId;\s*$', '')
$m = [regex]::Replace($m, '(?s)const\s+handlePlayClick\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\};\s*', '')
# Remove TTS controls block
$m = [regex]::Replace($m, '(?s)\{\s*!isUser\s*&&\s*!message\.isLoading\s*&&\s*message\.text\s*&&\s*\([\s\S]*?\)\s*\}\s*', '')

[System.IO.File]::WriteAllText($msg, $m, [System.Text.Encoding]::UTF8)

Write-Host "App.tsx and MessageDisplay.tsx cleaned. Backups created:`n$app -> $bakApp`n$msg -> $bakMsg"
