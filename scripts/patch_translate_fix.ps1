$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\components\Translate.tsx'
$text = Get-Content -Raw -Path $path

# 1) Add useMemo import if missing
if ($text -notmatch 'useMemo') {
  $text = [regex]::Replace($text, 'import React,\s*\{\s*useState\s*\}\s*from\s+''react'';', "import React, { useMemo, useState } from 'react';")
}

# 2) Insert hasTranslateKey after error state
if ($text -notmatch 'const hasTranslateKey') {
  $stateAnchor = "const [error, setError] = useState<string | null>(null);"
  if ($text.Contains($stateAnchor)) {
    $insertion = @'
    // .env.local-dan tərcümə üçün açarın olub-olmadığını yoxla
    const hasTranslateKey = useMemo(() => {
        try {
            const env: any = (import.meta as any).env || {};
            return Boolean(env.VITE_GEMINI_TRANSLATE_API_KEY || env.VITE_GEMINI_API_KEY);
        } catch {
            return false;
        }
    }, []);
'@
    $text = $text.Replace($stateAnchor, $stateAnchor + "`r`n" + $insertion)
  }
}

# 3) Replace handleTranslate function body to use preserveHtml and key check
$funcPattern = [regex]'const\s+handleTranslate\s*=\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\};'
$replacement = @'
const handleTranslate = async () => {
    if (!inputText.trim()) return;
    if (!hasTranslateKey) {
        setError('Tərcümə üçün Gemini API açarı tapılmadı. .env.local faylında VITE_GEMINI_TRANSLATE_API_KEY və ya VITE_GEMINI_API_KEY yazın və serveri yenidən başladın.');
        setTranslatedText('');
        return;
    }
    setLoading(true);
    setError(null);
    try {
        const looksLikeHtml = /<[^>]+>/.test(inputText);
        const result = await translateText(inputText, targetLang, { preserveHtml: looksLikeHtml });
        setTranslatedText(result);
    } catch (e: any) {
        setError(e.message || "Tərcümə uğursuz oldu.");
        setTranslatedText('');
    } finally {
        setLoading(false);
    }
};
'@
$text = $funcPattern.Replace($text, $replacement)

# 4) Insert warning banner after container start
if ($text -notmatch 'Açar tələb olunur') {
  $container = '<div className="max-w-4xl mx-auto">'
  if ($text.Contains($container)) {
    $banner = @'
                {!hasTranslateKey && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-200 text-sm flex items-start gap-2">
                        <AlertTriangleIcon className="w-5 h-5 mt-0.5" />
                        <div>
                            <strong className="block">Açar tələb olunur</strong>
                            Tərcümə funksiyası üçün .env.local faylında VITE_GEMINI_TRANSLATE_API_KEY və ya VITE_GEMINI_API_KEY dəyərlərini qeyd edin və dev serveri yenidən başladın.
                        </div>
                    </div>
                )}
'@
    $text = $text.Replace($container, $container + "`r`n" + $banner)
  }
}

[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host 'Translate.tsx patched (fixed).'
