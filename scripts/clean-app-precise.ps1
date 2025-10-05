param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_cleanprec_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Remove-Span {
  param([ref]$Arr, [int]$S, [int]$E)
  if ($S -lt 0 -or $E -lt $S) { return }
  $before=@(); if ($S -gt 0) { $before=$Arr.Value[0..($S-1)] }
  $after=@(); if ($E + 1 -le $Arr.Value.Length-1) { $after=$Arr.Value[($E+1)..($Arr.Value.Length-1)] }
  $Arr.Value = $before + $after
}

# 1) Remove BrowserViewInline .. up to before containsProperNoun
$idxBV = (Select-String -InputObject $lines -Pattern '^\s*const\s+BrowserViewInline\b' | Select-Object -First 1).LineNumber
$idxContains = (Select-String -InputObject $lines -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1).LineNumber
if ($idxBV -and $idxContains -and ($idxContains -gt $idxBV)) {
  $s = [int]$idxBV - 1
  $e = [int]$idxContains - 2
  Remove-Span -Arr ([ref]$lines) -S $s -E $e
}

# 2) Remove helpers: containsProperNoun .. refineVisualQuery .. closing '};'
$idxContains2 = (Select-String -InputObject $lines -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1).LineNumber
$idxRefine = (Select-String -InputObject $lines -Pattern '^\s*const\s+refineVisualQuery\s*=\s*\(' | Select-Object -First 1).LineNumber
if ($idxRefine) {
  $start = if ($idxContains2) { [int]$idxContains2 - 1 } else { [int]$idxRefine - 1 }
  $end = -1
  for ($i=[int]$idxRefine - 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\};\s*$') { $end = $i; break }
  }
  if ($end -ge $start) {
    Remove-Span -Arr ([ref]$lines) -S $start -E $end
  }
}

[System.IO.File]::WriteAllLines($path,$lines,[System.Text.Encoding]::UTF8)
Write-Host ("Precise clean done. Backup: " + $backup)
