param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_surgical_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Remove-Range {
  param([string[]]$Arr,[int]$Start,[int]$End)
  if ($Start -lt 0 -or $End -lt $Start) { return ,$Arr }
  $before=@(); if ($Start -gt 0) { $before=$Arr[0..($Start-1)] }
  $after=@(); if ($End + 1 -le $Arr.Length-1) { $after=$Arr[($End+1)..($Arr.Length-1)] }
  return ,($before + $after)
}

# 1) Remove BrowserViewInline block by cutting from its start up to the next helper block start
$idxInline = (Select-String -InputObject $lines -Pattern '^\s*const\s+BrowserViewInline\b' | Select-Object -First 1).LineNumber
if ($idxInline) {
  $idxInline = [int]$idxInline - 1
  $nextStarts = @()
  foreach ($p in @('^\s*const\s+containsProperNoun\b','^\s*const\s+extractSubjectFromHistory\b','^\s*const\s+refineVisualQuery\s*=\s*\(')) {
    $m = Select-String -InputObject $lines -Pattern $p | Where-Object { $_.LineNumber -gt ($idxInline+1) } | Select-Object -First 1
    if ($m) { $nextStarts += ([int]$m.LineNumber - 1) }
  }
  if ($nextStarts.Count -gt 0) {
    $endCut = ($nextStarts | Measure-Object -Minimum).Minimum - 1
  } else {
    # fallback: cut until first line that is just '};'
    $endCut = -1
    for ($i=$idxInline; $i -lt $lines.Length; $i++) {
      if ($lines[$i] -match '^\s*\};\s*$') { $endCut = $i; break }
    }
  }
  if ($endCut -ge $idxInline) {
    $lines = Remove-Range -Arr $lines -Start $idxInline -End $endCut
  }
}

# 2) Remove local helpers: containsProperNoun .. refineVisualQuery .. closing '};'
$idxContains = (Select-String -InputObject $lines -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1).LineNumber
$idxRefine = (Select-String -InputObject $lines -Pattern '^\s*const\s+refineVisualQuery\s*=\s*\(' | Select-Object -First 1).LineNumber
if ($idxRefine) {
  $start2 = if ($idxContains) { [int]$idxContains - 1 } else { [int]$idxRefine - 1 }
  $end2 = -1
  for ($j=[int]$idxRefine - 1; $j -lt $lines.Length; $j++) {
    if ($lines[$j] -match '^\s*\};\s*$') { $end2 = $j; break }
  }
  if ($end2 -ge $start2) {
    $lines = Remove-Range -Arr $lines -Start $start2 -End $end2
  }
}

# 3) Remove Browser API constants if any (defensive)
$lines = $lines | Where-Object { $_ -notmatch '^\s*const\s+BROWSER_ENGINE_ID\b' -and $_ -notmatch '^\s*const\s+BROWSER_API_KEY\b' }

[System.IO.File]::WriteAllLines($path,$lines,[System.Text.Encoding]::UTF8)
Write-Host ("Surgical clean done. Backup: " + $backup)
