param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$backup = $path + '.bak2'
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw

# Ensure GEMINI_API_KEY exists
if ($content -notmatch 'const\s+GEMINI_API_KEY\s*=') {
  $content = $content -replace "(import\s*\{\s*detectLocaleForSearch\s*\}\s*from\s*'\./searchService';\s*)", "$1`r`nconst GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;`r`n"
}

# Ensure model exists
if ($content -notmatch 'const\s+model\s*=') {
  if ($content -match 'const\s+aiTranslate\s*=') {
    $content = $content -replace "(const\s+aiTranslate\s*=\s*[^;]+;)", "$1`r`nconst model = 'gemini-2.5-flash';"
  } elseif ($content -match 'const\s+ai\s*=') {
    $content = $content -replace "(const\s+ai\s*=\s*[^;]+;)", "$1`r`nconst model = 'gemini-2.5-flash';"
  } else {
    # Fallback: insert near top after api key
    $content = $content -replace "(const\s+GEMINI_API_KEY\s*=\s*[^;]+;)", "$1`r`nconst model = 'gemini-2.5-flash';"
  }
}

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Fixed $path. Second backup: $backup"
