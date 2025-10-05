param()
$ErrorActionPreference = 'Stop'
$p = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $p)) { throw "Not found: $p" }
$bak = $p + '.bak_repairlive_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $p -Destination $bak -Force

$c = Get-Content -LiteralPath $p -Raw -Encoding UTF8

# 1) Fix audioContextRef declaration accidentally polluted with JSX
$c = [regex]::Replace($c, 'const\s+audioContextRef\s*=\s*useRef[\s\S]*?\(null\);', 'const audioContextRef = useRef<AudioContext | null>(null);', 'Singleline')

# 2) Normalize stray literal `r`n sequences inserted earlier
$c = $c -replace ' `r`n', "`r`n                            "
$c = $c -replace '`r`n', "`r`n"  # ensure no backticks remain

# 3) Replace the SearchBar block with a clean version (first occurrence only)
$sb = @'
          <SearchBar 
            onSend={(q) => handleSend(q)} 
            isLoading={isLoading} 
            onVoiceClick={() => setIsVoiceOverlayOpen(true)} 
            searchMode={searchMode}
            onChangeMode={setSearchMode}
          />
'@
$c = [regex]::Replace($c, '<SearchBar[\s\S]*?/>', $sb, 1)

# 4) Ensure a single VoiceOverlay is rendered after the <audio> element; remove any others above
# Remove inline VoiceOverlay components not in the footer area
$c = [regex]::Replace($c, '^[\s\S]*?(const\s+audioSourceRef[\s\S]*)', '$1')  # keep from audioSourceRef onwards (audio overlay before bottom handled by step 1)

# Re-insert footer VoiceOverlay cleanly after the audio element
$c = [regex]::Replace($c, '(<audio[^>]*>\s*)', "${1}      <VoiceOverlay `r`n        isOpen={isVoiceOverlayOpen}`r`n        onClose={handleCloseVoiceOverlay}`r`n        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}`r`n        liveResponse={null}`r`n        isResponding={isLoading}`r`n      />`r`n", 1)

[System.IO.File]::WriteAllText($p, $c, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx repaired. Backup: $bak"
