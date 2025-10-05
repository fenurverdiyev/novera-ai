param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\App.tsx'
if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
$backup = $path + '.bak_normsend_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
# 1) Remove isVocalQuery parameter from handleSend signature
$content = [regex]::Replace(
  $content,
  'const\s+handleSend\s*=\s*async\s*\(\s*query:\s*string\s*,\s*images\?:\s*string\[\]\s*,\s*isVocalQuery:\s*boolean\s*=\s*false\s*\)\s*=>',
  'const handleSend = async (query: string, images?: string[]) =>'
)
# 2) Replace lingering comment with an actual setIsLoading(true);
$content = [regex]::Replace(
  $content,
  '^[ \t]*//\s*Always\s*close\s*overlay;\s*background\s*TTS\s*will.*\r?\n',
  "    setIsLoading(true);`r`n",
  'Multiline'
)

[System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
Write-Host "Normalized handleSend. Backup: $backup"
