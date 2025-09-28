param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$content = Get-Content -LiteralPath $path -Raw

# Extract aiTranslate declaration (tolerant regex)
$aiTranslateRegex = [regex]'(?ms)^\s*const\s+aiTranslate\s*=\s*GEMINI_TRANSLATE_API_KEY\s*\?\s*new\s+GoogleGenAI\(\{\s*apiKey:\s*GEMINI_TRANSLATE_API_KEY\s*\}\)\s*:\s*ai;\s*\r?\n'
$aiRegex = [regex]'(?ms)^\s*const\s+ai\s*=\s*GEMINI_API_KEY\s*\?\s*new\s+GoogleGenAI\(\{\s*apiKey:\s*GEMINI_API_KEY\s*\}\)\s*:\s*null;\s*\r?\n'

$aiTranslateMatch = $aiTranslateRegex.Match($content)
$aiMatch = $aiRegex.Match($content)

if ($aiTranslateMatch.Success -and $aiMatch.Success) {
  # Remove all aiTranslate declarations
  $contentNoAiTranslate = $aiTranslateRegex.Replace($content, '')
  # Find ai again in updated content
  $aiMatch2 = $aiRegex.Match($contentNoAiTranslate)
  if ($aiMatch2.Success) {
    $insertPos = $aiMatch2.Index + $aiMatch2.Length
    $newContent = $contentNoAiTranslate.Substring(0, $insertPos) + "`r`n" + $aiTranslateMatch.Value + $contentNoAiTranslate.Substring($insertPos)
    Set-Content -LiteralPath $path -Value $newContent -Encoding UTF8
    Write-Host "Reordered aiTranslate after ai"
  } else {
    Write-Host "Could not find ai after removing aiTranslate"
  }
} else {
  Write-Host "Patterns not found; no changes applied"
}
