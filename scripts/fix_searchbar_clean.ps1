param()
$ErrorActionPreference = 'Stop'
$sb = 'd:\NovEra\NovEra\components\SearchBar.tsx'
$bakGood = 'd:\NovEra\NovEra\components\SearchBar.tsx.bak_fixlivemig_20251005_203541'
if (-not (Test-Path -LiteralPath $sb)) { throw "SearchBar.tsx not found: $sb" }
if (-not (Test-Path -LiteralPath $bakGood)) { throw "Backup not found: $bakGood" }
$bakBroken = $sb + '.bak_broken_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $sb -Destination $bakBroken -Force
# Restore from known-good backup
Copy-Item -LiteralPath $bakGood -Destination $sb -Force

# Read restored content
$lines = Get-Content -LiteralPath $sb -Encoding UTF8
$out = New-Object System.Collections.Generic.List[string]
$skip = $false
foreach ($line in $lines) {
  if (-not $skip -and $line -match '<button\s+onClick=\{onVoiceClick\}') {
    $skip = $true
    continue
  }
  if ($skip) {
    if ($line -match '</button>') {
      $skip = $false
    }
    continue
  }
  # Remove LiveCircleIcon import token if present
  $line = $line -replace '\{ SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, LiveCircleIcon \}', '{ SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon }'
  # Make onVoiceClick optional
  $line = $line -replace 'onVoiceClick:\s*\(\)\s*=>\s*void;', 'onVoiceClick?: () => void;'
  # Fix SpeechRecognition typings to any
  $line = $line -replace 'useRef<SpeechRecognition\s*\|\s*null>', 'useRef<any | null>'
  $line = $line -replace 'const\s+rec:\s*SpeechRecognition\s*=\s*new\s+SpeechRec\(\);', 'const rec: any = new SpeechRec();'
  $out.Add($line) | Out-Null
}
[System.IO.File]::WriteAllText($sb, ($out -join "`r`n"), [System.Text.Encoding]::UTF8)
Write-Host "SearchBar.tsx restored cleanly and live conversation UI removed. Backup of previous file: $bakBroken"
