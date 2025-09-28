param()
$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$content = Get-Content -LiteralPath $path -Raw

# Find aiTranslate declaration
$aiTranslatePattern = '(?ms)^\s*const\s+aiTranslate\s*=\s*GEMINI_TRANSLATE_API_KEY\s*\?\s*new\s+GoogleGenAI\(\{\s*apiKey:\s*GEMINI_TRANSLATE_API_KEY\s*\}\)\s*:\s*ai;\s*\r?\n'
$aiPattern = '(?ms)^\s*const\s+ai\s*=\s*GEMINI_API_KEY\s*\?\s*new\s+GoogleGenAI\(\{\s*apiKey:\s*GEMINI_API_KEY\s*\}\)\s*:\s*null;\s*\r?\n'

$aiTranslateMatch = [regex]::Match($content, $aiTranslatePattern)
$aiMatch = [regex]::Match($content, $aiPattern)

if ($aiTranslateMatch.Success -and $aiMatch.Success) {
  # If aiTranslate appears before ai, move it after ai
  if ($aiTranslateMatch.Index -lt $aiMatch.Index) {
    $aiTranslateDecl = $aiTranslateMatch.Value
    $content = $content.Remove($aiTranslateMatch.Index, $aiTranslateMatch.Length)
    # Re-find ai position after removal
    $aiMatch2 = [regex]::Match($content, $aiPattern)
    $insertPos = $aiMatch2.Index + $aiMatch2.Length
    $content = $content.Insert($insertPos, "`r`n$aiTranslateDecl")
    Set-Content -LiteralPath $path -Value $content -Encoding UTF8
    Write-Host "Moved aiTranslate after ai"
  } else {
    Write-Host "Order already correct"
  }
} else {
  Write-Host "Could not find patterns to reorder. Skipping."
}
