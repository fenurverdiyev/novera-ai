param()
$ErrorActionPreference = 'Stop'

$app = 'd:\NovEra\NovEra\App.tsx'
$tsc = 'd:\NovEra\NovEra\tsconfig.json'
if (-not (Test-Path -LiteralPath $app)) { throw "Not found: $app" }
if (-not (Test-Path -LiteralPath $tsc)) { throw "Not found: $tsc" }

# Backups
$ab = $app + '.bak_live2_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $app -Destination $ab -Force
$tb = $tsc + '.bak_live2_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $tsc -Destination $tb -Force

# ---- Patch App.tsx ----
$content = Get-Content -LiteralPath $app -Raw -Encoding UTF8

# 1) Import VoiceOverlay
if ($content -notmatch "import\s*\{\s*VoiceOverlay\s*\}\s*from\s*'\.\/components\/VoiceOverlay'") {
  $anchor = "import { Logo } from './components/Logo';"
  if ($content.Contains($anchor)) {
    $content = $content.Replace($anchor, $anchor + "`r`nimport { VoiceOverlay } from './components/VoiceOverlay';")
  } else {
    $content = $content -replace "(import[\s\S]*?;)(\r?\n)(?!import)", "$1`r`nimport { VoiceOverlay } from './components/VoiceOverlay';`r`n"
  }
}

# 2) Add isVoiceOverlayOpen state after playingMessageId state
$stateAnchor = 'const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);'
if ($content.Contains($stateAnchor) -and ($content -notmatch '\[isVoiceOverlayOpen,\s*setIsVoiceOverlayOpen\]')) {
  $content = $content.Replace($stateAnchor, $stateAnchor + "`r`nconst [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);")
}

# 3) Add handleCloseVoiceOverlay before renderView
if ($content -notmatch 'const\s+handleCloseVoiceOverlay\s*=\s*\(\)\s*=>') {
  $renderAnchor = 'const renderView = () => {'
  if ($content.Contains($renderAnchor)) {
    $content = $content.Replace($renderAnchor, "const handleCloseVoiceOverlay = () => { setIsVoiceOverlayOpen(false); };`r`n`r`n" + $renderAnchor)
  }
}

# 4) Add onVoiceClick prop in SearchBar usage
if ($content -match '<SearchBar[\s\S]*?onSend=' -and $content -notmatch 'onVoiceClick=\{') {
  # Insert after isLoading prop
  $content = [regex]::Replace($content, '(?<prefix><SearchBar[\s\S]*?isLoading=\{[^}]*\}\s*)', '${prefix}            onVoiceClick={() => setIsVoiceOverlayOpen(true)} `r`n', 1)
}

# 5) Inject VoiceOverlay component after audio element
$overlay = @'
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen}
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => { setIsVoiceOverlayOpen(false); handleSend(q, i); }}
        liveResponse={null}
        isResponding={isLoading}
      />
'@

if ($content -notmatch '<VoiceOverlay[\s\S]*?isOpen=') {
  $content = [regex]::Replace($content, '(<audio[^>]*>\s*)', "${1}" + $overlay, 1)
}

[System.IO.File]::WriteAllText($app, $content, [System.Text.Encoding]::UTF8)

# ---- Patch tsconfig.json ----
$j = Get-Content -LiteralPath $tsc -Raw -Encoding UTF8
$j2 = $j -replace '\s*"components/VoiceOverlay\.tsx"\s*,?', ''
$j2 = $j2 -replace ',\s*\]', ']'
[System.IO.File]::WriteAllText($tsc, $j2, [System.Text.Encoding]::UTF8)

Write-Host "Live overlay enabled. Backups:`n $ab`n $tb"
