param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$content = Get-Content -LiteralPath $path -Raw

if ($content -notmatch 'const\s+aiTranslate\s*=') {
  if ($content -match 'const\s+GEMINI_TRANSLATE_API_KEY[\s\S]*?;') {
    # Insert after GEMINI_TRANSLATE_API_KEY declaration
    $pattern = 'const\s+GEMINI_TRANSLATE_API_KEY\s*=.*?;'
    $content = [regex]::Replace($content, $pattern, { param($m) $m.Value + "`r`nconst aiTranslate = GEMINI_TRANSLATE_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_TRANSLATE_API_KEY }) : ai;" }, 1)
  } elseif ($content -match 'const\s+ai\s*=') {
    # Insert after ai
    $pattern2 = 'const\s+ai\s*=.*?;'
    $content = [regex]::Replace($content, $pattern2, { param($m) $m.Value + "`r`nconst aiTranslate = GEMINI_TRANSLATE_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_TRANSLATE_API_KEY }) : ai;" }, 1)
  }
  Set-Content -LiteralPath $path -Value $content -Encoding UTF8
  Write-Host "Inserted aiTranslate"
} else {
  Write-Host "aiTranslate already present"
}
