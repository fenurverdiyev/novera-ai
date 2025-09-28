param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$content = Get-Content -LiteralPath $path -Raw

if ($content -notmatch 'const\s+GEMINI_API_KEY') {
  # Insert GEMINI_API_KEY declaration near the top after imports
  $pattern = "import\\s*\\{\\s*detectLocaleForSearch\\s*\\}\\s*from\\s*'\\./searchService';"
  $content = [regex]::Replace($content, $pattern, "$0`r`n`r`nconst GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;")
}

if ($content -notmatch 'const\s+model\s*=') {
  # Insert model declaration after aiTranslate or after ai if aiTranslate not found
  if ($content -match 'const\s+aiTranslate[\s\S]*?;') {
    $content = $content -replace '(const\s+aiTranslate[\s\S]*?;)', "$1`r`nconst model = 'gemini-2.5-flash';"
  } elseif ($content -match 'const\s+ai\s*=') {
    $content = $content -replace '(const\s+ai[\s\S]*?;)', "$1`r`nconst model = 'gemini-2.5-flash';"
  }
}

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Repaired $path"
