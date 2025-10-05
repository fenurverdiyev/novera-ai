param()
$ErrorActionPreference = 'Stop'
$p = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $p)) { throw "Not found: $p" }
$bak = $p + '.bak_applylive_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $p -Destination $bak -Force

$c = Get-Content -LiteralPath $p -Raw -Encoding UTF8

# 1) Ensure audioContextRef declaration is clean
$c = [regex]::Replace($c, 'const\s+audioContextRef\s*=\s*useRef[\s\S]*?\(null\);', 'const audioContextRef = useRef<AudioContext | null>(null);', 'Singleline')

# 2) Normalize literal backtick newlines inserted earlier
$c = $c -replace ' \`r\`n', "`r`n                            "
$c = $c -replace '\`r\`n', "`r`n"

# 3) Replace the SearchBar usage block with a clean one (first occurrence only)
$cleanSearchBar = @'
          <SearchBar 
            onSend={(q) => handleSend(q)} 
            isLoading={isLoading} 
            onVoiceClick={() => setIsVoiceOverlayOpen(true)} 
            searchMode={searchMode}
            onChangeMode={setSearchMode}
          />
'@
$c = [regex]::Replace($c, '<SearchBar[\s\S]*?/>', $cleanSearchBar, 1)

# 4) Remove any VoiceOverlay blocks to avoid duplicates
$c = [regex]::Replace($c, '<VoiceOverlay[\s\S]*?/>', '', 'Singleline')

# 5) Ensure audio element exists at the bottom; if not, insert audio + overlay before the last </div>
$audioLine = '<audio ref={audioRef} crossOrigin="anonymous" />'
$overlay = @'
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen}
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}
        liveResponse={null}
        isResponding={isLoading}
      />
'@
if ($c -notmatch [regex]::Escape($audioLine)) {
  $lastIdx = $c.LastIndexOf('</div>')
  if ($lastIdx -gt 0) {
    $before = $c.Substring(0, $lastIdx)
    $after  = $c.Substring($lastIdx)
    $c = $before + "  " + $audioLine + "`r`n" + $overlay + $after
  }
} else {
  # Insert overlay right after audio if audio exists
  $c = [regex]::Replace($c, [regex]::Escape($audioLine), $audioLine + "`r`n" + $overlay, 1)
}

[System.IO.File]::WriteAllText($p, $c, [System.Text.Encoding]::UTF8)
Write-Host "Applied live overlay. Backup: $bak"
