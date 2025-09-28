param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$content = Get-Content -LiteralPath $path -Raw
if ($content -notmatch 'const\s+GEMINI_API_KEY\s*=') {
  # Insert after the searchService import
  $importLine = "import { detectLocaleForSearch } from './searchService';"
  if ($content.Contains($importLine)) {
    $content = $content.Replace($importLine, "$importLine`r`n`r`nconst GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;")
  } else {
    # Fallback: insert near top after first line
    $lines = $content -split "`r?`n"
    $lines = $lines[0..3] + @('const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;') + $lines[4..($lines.Length-1)]
    $content = ($lines -join "`r`n")
  }
  Set-Content -LiteralPath $path -Value $content -Encoding UTF8
  Write-Host "Inserted GEMINI_API_KEY"
} else {
  Write-Host "GEMINI_API_KEY already present"
}
