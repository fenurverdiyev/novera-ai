param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\services\geminiService.ts'
$backup = $path + '.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw

# 1) Replace the searchService import to only keep detectLocaleForSearch
$content = $content -replace "import\s*\{\s*searchWeb\s+as\s+serperSearchWeb,\s*SerperResponse,\s*detectLocaleForSearch\s*\}\s*from\s*'\./searchService';", "import { detectLocaleForSearch } from './searchService';"

# 2) Add GEMINI_TRANSLATE_API_KEY after GEMINI_API_KEY
if ($content -notmatch 'GEMINI_TRANSLATE_API_KEY') {
  $content = $content -replace "(const\s+GEMINI_API_KEY\s*=\s*import\.meta\.env\.VITE_GEMINI_API_KEY;)", "$1`r`nconst GEMINI_TRANSLATE_API_KEY = import.meta.env.VITE_GEMINI_TRANSLATE_API_KEY;"
}

# 3) Add aiTranslate after model variable
if ($content -notmatch 'const\s+aiTranslate\s*=') {
  $content = $content -replace "(const\s+model\s*=\s*'gemini-1\.5-flash-latest';)", "$1`r`n`r`nconst aiTranslate = GEMINI_TRANSLATE_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_TRANSLATE_API_KEY }) : ai;"
}

# 4) Insert googleSearchTool before mapMessagesToContent
if ($content -notmatch 'const\s+googleSearchTool') {
  $content = $content -replace "(\r?\n\s*const\s+mapMessagesToContent\s*=)", "`r`n`r`n// Built-in Google Search Grounding tool`r`nconst googleSearchTool: Tool = { googleSearch: {} as any };`r`n`r`nconst mapMessagesToContent ="
}

# 5) In streaming config, include googleSearchTool
$content = $content -replace "tools:\s*assistantTools,", "tools: [googleSearchTool, ...assistantTools],"

# 6) translateText: use aiTranslate
$content = [regex]::Replace($content, "export\s+async\s+function\s+translateText([\s\S]*?)if\s*\(!ai\)", { param($m) $m.Groups[0].Value -replace "if\s*\(!ai\)", "if (!aiTranslate)" })
$content = [regex]::Replace($content, "export\s+async\s+function\s+translateText[\s\S]*?await\s+ai(\.models\.generateContent\()", { param($m) $m.Value -replace "await\s+ai(\.models\.generateContent\()", "await aiTranslate`$1" })

# 7) Replace the whole answerWithGroundedSearch function with Google Search tool grounding
$newAnswer = @'
export async function answerWithGroundedSearch(query: string, opts?: { num?: number; gl?: string; hl?: string }, memory?: string) {
  const memoryBlock = memory && memory.trim() ? `\n\nQISA YADDAŞ (kontekstə kömək üçün):\n${memory.slice(-1500)}` : '';
  const systemInstruction = `Sən NovEra adlı köməkçisən və bütün cavablarını Azərbaycan dilində ver.\n\n` +
    `Cavab verərkən Google Axtarış alətindən (grounding) istifadə et, iddiaları ən son mənbələrlə dəstəklə və [1], [2]... kimi istinadlar ver.\n` +
    `Mənbələrdən sitat gətirərkən qısa və dəqiq ol.` + memoryBlock;

  if (!ai) {
    return { text: 'AI açarı yoxdur. Zəhmət olmasa VITE_GEMINI_API_KEY təyin edin.', sources: [] as Source[] };
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: query }] }],
    config: {
      tools: [googleSearchTool],
      systemInstruction,
    },
  });

  const text = response.text?.trim() || '';
  const groundingChunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: Source[] = groundingChunks
    .map((g: any) => g?.web)
    .filter((w: any) => w && w.uri)
    .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
    .slice(0, 8)
    .map((w: any, i: number) => ({ uri: w.uri, title: w.title || new URL(w.uri).hostname, index: i + 1 }));

  return { text, sources };
}
'@

$pattern = "export\s+async\s+function\s+answerWithGroundedSearch\([\s\S]*$"
if ($content -match $pattern) {
  $content = [regex]::Replace($content, $pattern, $newAnswer)
}

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Patched $path. Backup: $backup"
