param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_rmjsx_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

# Find a line that looks like "value={q}" (a leftover input in BrowserView JSX)
$idxValObj = Select-String -Path $path -Pattern 'value=\{q\}' | Select-Object -First 1
if (-not $idxValObj) {
  Write-Host "No stray BrowserView JSX detected. Backup: $backup"
  exit 0
}
$idxVal = [int]$idxValObj.LineNumber - 1

# Find start of that JSX block: nearest line above containing 'return ('
$start = -1
for ($i=$idxVal; $i -ge 0; $i--) {
  if ($lines[$i] -match '\breturn\s*\(') { $start = $i; break }
}
# Find end of the block: nearest line below that is exactly '  };' or '};'
$end = -1
for ($j=$idxVal; $j -lt $lines.Length; $j++) {
  if ($lines[$j] -match '^\s*\};\s*$') { $end = $j; break }
}

if ($start -ge 0 -and $end -ge $start) {
  $before = @(); if ($start -gt 0) { $before = $lines[0..($start-1)] }
  $after = @(); if ($end + 1 -le $lines.Length - 1) { $after = $lines[($end+1)..($lines.Length-1)] }
  $newLines = $before + $after
  [System.IO.File]::WriteAllLines($path, $newLines, [System.Text.Encoding]::UTF8)
  Write-Host ("Removed stray BrowserView JSX block. Backup: " + $backup)
} else {
  Write-Host "Could not determine start/end of stray JSX block. Backup: $backup"
}
