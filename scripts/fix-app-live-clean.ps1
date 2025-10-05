param()
$ErrorActionPreference = 'Stop'
$p = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $p)) { throw "Not found: $p" }
$bak = $p + '.bak_liveclean_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $p -Destination $bak -Force

$c = Get-Content -LiteralPath $p -Raw -Encoding UTF8

# 1) Fix audioContextRef declaration accidentally polluted with JSX
$c = [regex]::Replace($c, 'const\s+audioContextRef\s*=\s*useRef[\s\S]*?\(null\);', 'const audioContextRef = useRef<AudioContext | null>(null);', 'Singleline')

# 2) Remove any existing <VoiceOverlay ... /> blocks to avoid duplicates
$c = [regex]::Replace($c, '<VoiceOverlay[\s\S]*?/>', '', 'Singleline')

# 3) Replace the SearchBar block (first occurrence) with a clean version including onVoiceClick
$searchBarNew = @'
          <SearchBar 
            onSend={(q) => handleSend(q)} 
            isLoading={isLoading} 
            onVoiceClick={() => setIsVoiceOverlayOpen(true)} 
            searchMode={searchMode}
            onChangeMode={setSearchMode}
          />
'@
$c = [regex]::Replace($c, '<SearchBar[\s\S]*?/>', $searchBarNew, 1)

# 4) Insert one VoiceOverlay after the <audio ... /> element
$audioRegex = '<audio\s+ref=\{audioRef\}[\s\S]*?/>'
$overlay = @'
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen}
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}
        liveResponse={null}
        isResponding={isLoading}
      />
'@
$c = [regex]::Replace($c, $audioRegex, { param($m) $m.Value + "`r`n" + $overlay }, 1)

[System.IO.File]::WriteAllText($p, $c, [System.Text.Encoding]::UTF8)
Write-Host "App.tsx cleaned and overlay wired. Backup: $bak"
