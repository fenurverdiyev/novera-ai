param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_purge_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Remove-Block {
  param(
    [string[]]$Content,
    [int]$StartIdx,
    [int]$EndIdx
  )
  if ($StartIdx -ge 0 -and $EndIdx -ge $StartIdx) {
    $before = @(); if ($StartIdx -gt 0) { $before = $Content[0..($StartIdx-1)] }
    $after = @(); if ($EndIdx + 1 -le $Content.Length-1) { $after = $Content[($EndIdx+1)..($Content.Length-1)] }
    return ,($before + $after)
  }
  return ,$Content
}

# 1) Remove from BROWSER_* consts through end of BrowserViewInline
$idxBrowserConst = (Select-String -InputObject $lines -Pattern '^\s*const\s+BROWSER_ENGINE_ID\b' | Select-Object -First 1).LineNumber
$idxInlineStart = (Select-String -InputObject $lines -Pattern '^\s*const\s+BrowserViewInline\b' | Select-Object -First 1).LineNumber
if ($idxInlineStart) {
  $start = if ($idxBrowserConst) { [int]$idxBrowserConst - 1 } else { [int]$idxInlineStart - 1 }
  $end = -1
  for ($i = [int]$idxInlineStart - 1; $i -lt $lines.Length; $i++) {
    if ($lines[$i] -match '^\s*\};\s*$') { $end = $i; break }
  }
  if ($end -ge 0) { $lines = Remove-Block -Content $lines -StartIdx $start -EndIdx $end }
}

# 2) Remove duplicate local refine helpers (containsProperNoun .. refineVisualQuery .. };
$idxContains = (Select-String -InputObject $lines -Pattern '^\s*const\s+containsProperNoun\b' | Select-Object -First 1).LineNumber
$idxRefine = (Select-String -InputObject $lines -Pattern '^\s*const\s+refineVisualQuery\s*=\s*\(' | Select-Object -First 1).LineNumber
if ($idxRefine) {
  $start2 = if ($idxContains) { [int]$idxContains - 1 } else { [int]$idxRefine - 1 }
  $end2 = -1
  for ($j = [int]$idxRefine - 1; $j -lt $lines.Length; $j++) {
    if ($lines[$j] -match '^\s*\};\s*$') { $end2 = $j; break }
  }
  if ($end2 -ge 0) { $lines = Remove-Block -Content $lines -StartIdx $start2 -EndIdx $end2 }
}

# Save back
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Purged inline leftovers. Backup: " + $backup)
