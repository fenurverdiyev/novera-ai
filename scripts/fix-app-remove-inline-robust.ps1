param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_inline_robust_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$lines = Get-Content -LiteralPath $path -Encoding UTF8

function Normalize([string]$s){ return ($s -replace "\u00A0"," ") }

function FindLineIndex([string[]]$arr, [string]$needle){
  for($i=0;$i -lt $arr.Length;$i++){
    if (Normalize($arr[$i]).IndexOf($needle, [System.StringComparison]::Ordinal) -ge 0){ return $i }
  }
  return -1
}

function FindClosingBraceLine([string[]]$arr, [int]$start){
  for($i=$start; $i -lt $arr.Length; $i++){
    $t = Normalize($arr[$i]).Trim()
    if ($t -eq '};'){ return $i }
  }
  return -1
}

function RemoveRange([ref]$arr, [int]$s, [int]$e){
  if ($s -lt 0 -or $e -lt $s){ return }
  $before=@(); if ($s -gt 0){ $before=$arr.Value[0..($s-1)] }
  $after=@(); if ($e+1 -le $arr.Value.Length-1){ $after=$arr.Value[($e+1)..($arr.Value.Length-1)] }
  $arr.Value = $before + $after
}

# 1) Remove BrowserViewInline block
$startBV = FindLineIndex $lines 'const BrowserViewInline'
if ($startBV -ge 0){
  $endBV = FindClosingBraceLine $lines ($startBV+1)
  if ($endBV -ge 0){ RemoveRange ([ref]$lines) $startBV $endBV }
}

# 2) Remove local helpers from containsProperNoun to refineVisualQuery closing
$startContain = FindLineIndex $lines 'const containsProperNoun'
$startRefine = FindLineIndex $lines 'const refineVisualQuery'
if ($startRefine -ge 0){
  $start2 = if ($startContain -ge 0){ $startContain } else { $startRefine }
  $end2 = FindClosingBraceLine $lines ($startRefine+1)
  if ($end2 -ge 0){ RemoveRange ([ref]$lines) $start2 $end2 }
}

[System.IO.File]::WriteAllLines($path, $lines, [System.Text.Encoding]::UTF8)
Write-Host ("Robust removal done. Backup: " + $backup)
