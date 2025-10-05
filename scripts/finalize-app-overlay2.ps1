param()
$ErrorActionPreference = 'Stop'
$p = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $p)) { throw "Not found: $p" }
$bak = $p + '.bak_finaloverlay_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $p -Destination $bak -Force

$c = Get-Content -LiteralPath $p -Raw -Encoding UTF8

# 0) Ensure audioContextRef declaration is clean
$c = [regex]::Replace($c, 'const\s+audioContextRef\s*=\s*useRef[\s\S]*?\(null\);', 'const audioContextRef = useRef<AudioContext | null>(null);', 'Singleline')

# 1) Normalize literal backticks newlines artifacts
$c = $c -replace ' \`r\`n', "`r`n                            "
$c = $c -replace '\`r\`n', "`r`n"

# 2) Replace SearchBar usage with clean block (first occurrence)
$searchBarClean = @'
          <SearchBar 
            onSend={(q) => handleSend(q)} 
            isLoading={isLoading} 
            onVoiceClick={() => setIsVoiceOverlayOpen(true)} 
            searchMode={searchMode}
            onChangeMode={setSearchMode}
          />
'@
$c = [regex]::Replace($c, '<SearchBar[\s\S]*?/>', $searchBarClean, 1)

# 3) Remove any existing VoiceOverlay and audio tags to avoid duplicates
$c = [regex]::Replace($c, '<VoiceOverlay[\s\S]*?/>', '', 'Singleline')
$c = [regex]::Replace($c, '<audio\s+ref=\{audioRef\}[\s\S]*?/>', '', 'Singleline')

# 4) Insert audio + overlay before the final closing wrapper </div>
$audio = '<audio ref={audioRef} crossOrigin="anonymous" />'
$overlay = @'
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen}
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}
        liveResponse={null}
        isResponding={isLoading}
      />
'@
$lastClose = $c.LastIndexOf('</div>')
if ($lastClose -gt 0) {
  $before = $c.Substring(0, $lastClose)
  $after  = $c.Substring($lastClose)
  $c = $before + "  " + $audio + "`r`n" + $overlay + $after
}

[System.IO.File]::WriteAllText($p, $c, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx finalized. Backup: $bak"
