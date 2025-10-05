param()
$ErrorActionPreference = 'Stop'

$app = 'd:\NovEra\NovEra\App.tsx'
$tsc = 'd:\NovEra\NovEra\tsconfig.json'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
if (-not (Test-Path -LiteralPath $tsc)) { throw "Not found: $tsc" }

# Backups
$ab = $app + '.bak_live_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $ab -Force
$tb = $tsc + '.bak_live_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $tsc -Destination $tb -Force

# ---- Patch App.tsx ----
$content = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) Import VoiceOverlay
if ($content -notmatch "import\s*\{\s*VoiceOverlay\s*\}\s*from\s*'\.\/components\/VoiceOverlay'") {
  $insertAfter = "import { Logo } from './components/Logo';"
  if ($content -match [Regex]::Escape($insertAfter)) {
    $content = $content -replace [Regex]::Escape($insertAfter), ($insertAfter + "`r`nimport { VoiceOverlay } from './components/VoiceOverlay';")
  } else {
    # Fallback: put after last import
    $content = $content -replace "(import[\s\S]*?;\s*)$", "$1`r`nimport { VoiceOverlay } from './components/VoiceOverlay';`r`n"
  }
}

# 2) Add isVoiceOverlayOpen state
if ($content -notmatch "\[isVoiceOverlayOpen,\s*setIsVoiceOverlayOpen\]") {
  $anchor = "const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);"
  if ($content -match [Regex]::Escape($anchor)) {
    $content = $content -replace [Regex]::Escape($anchor), ($anchor + "`r`nconst [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);")
  } else {
    # Fallback: insert after settings block end
    $content = $content -replace "(const\s+addMessage[\s\S]*?\}\);)", "$1`r`nconst [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);"
  }
}

# 3) Add handleCloseVoiceOverlay handler if missing
if ($content -notmatch "const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>") {
  $anchor2 = "const renderView = () => {"
  if ($content -match [Regex]::Escape($anchor2)) {
    $content = $content -replace [Regex]::Escape($anchor2), ("const handleCloseVoiceOverlay = () => { setIsVoiceOverlayOpen(false); };`r`n`r`n" + $anchor2)
  }
}

# 4) Add onVoiceClick prop back to SearchBar
if ($content -match "<SearchBar[\s\S]*?onSend=") {
  # Insert onVoiceClick before searchMode if missing
  if ($content -notmatch "onVoiceClick=\{") {
    $content = $content -replace "(\b<SearchBar[\s\S]*?isLoading=\{[^}]*\}\s*)", "$1`r`n                            onVoiceClick={() => setIsVoiceOverlayOpen(true)} "
  }
}

# 5) Render VoiceOverlay near bottom (before closing wrapper)
if ($content -notmatch "<VoiceOverlay[\s\S]*?isOpen=") {
  $marker = "<audio ref={audioRef} crossOrigin=\"anonymous\" />"
  if ($content -match [Regex]::Escape($marker)) {
    $overlay = @"
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen}
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}
        liveResponse={null}
        isResponding={isLoading}
      />
"@
    $content = $content -replace [Regex]::Escape($marker), ($marker + "`r`n" + $overlay)
  }
}

[System.IO.File]::WriteAllText($app, $content, [System.Text.Encoding]::UTF8)

# ---- Patch tsconfig.json ----
$j = Get-Content -LiteralPath $tsc -Raw -Encoding UTF8
# Remove VoiceOverlay from exclude if present
$j2 = $j -replace "\s*\"components\/VoiceOverlay\.tsx\"\s*,?", ""
# Clean up trailing commas in exclude arrays
$j2 = $j2 -replace ",\s*\]", "]"
[System.IO.File]::WriteAllText($tsc, $j2, [System.Text.Encoding]::UTF8)

Write-Host "Live overlay enabled. Backups:`n $ab`n $tb"
