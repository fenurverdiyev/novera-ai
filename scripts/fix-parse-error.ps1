param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_fixparse_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

# Read file lines
$lines = Get-Content -LiteralPath $path -Encoding UTF8

# Find the stray BrowserView JSX block by 'value={q}' marker
$idxQObj = Select-String -Path $path -Pattern 'value=\{q\}' -SimpleMatch | Select-Object -First 1
if ($idxQObj) {
  $idxQ = [int]$idxQObj.LineNumber - 1
  # Find start of the block (nearest 'return (' above idxQ)
  $start = -1
  for ($i = $idxQ; $i -ge 0; $i--) {
    if ($lines[$i] -match '\breturn\s*\(') { $start = $i; break }
  }
  # Find end of the block (nearest '};' below idxQ)
  $end = -1
  for ($j = $idxQ; $j -lt $lines.Length; $j++) {
    if ($lines[$j] -match '^\s*\};\s*$') { $end = $j; break }
  }
  if ($start -ge 0 -and $end -ge $start) {
    $before = @(); if ($start -gt 0) { $before = $lines[0..($start-1)] }
    $after = @(); if ($end + 1 -le $lines.Length - 1) { $after = $lines[($end+1)..($lines.Length-1)] }
    $lines = $before + $after
  }
}

# Remove leftover constants if any
$lines = $lines | Where-Object { $_ -notmatch '^\s*const\s+BROWSER_ENGINE_ID\b' -and $_ -notmatch '^\s*const\s+BROWSER_API_KEY\b' }

# Save back
[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Fixed parse error and removed stray JSX block. Backup: " + $backup)
