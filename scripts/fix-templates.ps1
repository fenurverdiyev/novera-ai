param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\App.tsx'
$backup = $path + '.bak_' + (Get-Date -Format 'yyyyMMdd_HHmmss')

Write-Host "Backing up $path to $backup"
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw -Encoding UTF8
$original = $content

# 1) document.body.className template
$search1 = @'
document.body.className = theme-${settings.theme} font-sans ;
'@
$replace1 = @'
document.body.className = `theme-${settings.theme} font-sans`;
'@
if ($content.Contains($search1)) { $content = $content.Replace($search1, $replace1) }

# 2) BrowserView: gcse id
$search2 = @'
      const id = gcse-script-${BROWSER_ENGINE_ID} ;
'@
$replace2 = @'
      const id = `gcse-script-${BROWSER_ENGINE_ID}`;
'@
if ($content.Contains($search2)) { $content = $content.Replace($search2, $replace2) }

# 3) BrowserView: gcse src
$search3 = @'
        s.src = https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID} ;
'@
$replace3 = @'
        s.src = `https://cse.google.com/cse.js?cx=${BROWSER_ENGINE_ID}`;
'@
if ($content.Contains($search3)) { $content = $content.Replace($search3, $replace3) }

# 4) BrowserView: CSE url
$search4 = @'
        const url = https://www.googleapis.com/customsearch/v1?key=${BROWSER_API_KEY}&cx=${BROWSER_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start} ;
'@
$replace4 = @'
        const url = `https://www.googleapis.com/customsearch/v1?key=${BROWSER_API_KEY}&cx=${BROWSER_ENGINE_ID}&q=${encodeURIComponent(query)}&start=${start}`;
'@
if ($content.Contains($search4)) { $content = $content.Replace($search4, $replace4) }

# 5) refineVisualQuery return lines
$search5 = @'
    if (isVideo) return ${subject} videoları ;
'@
$replace5 = @'
    if (isVideo) return `${subject} videoları`;
'@
if ($content.Contains($search5)) { $content = $content.Replace($search5, $replace5) }

$search6 = @'
    if (isImage) return ${subject} şəkilləri hd ;
'@
$replace6 = @'
    if (isImage) return `${subject} şəkilləri hd`;
'@
if ($content.Contains($search6)) { $content = $content.Replace($search6, $replace6) }

# 6) Root container className
$search7 = @'
    <div className={flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'} }>
'@
$replace7 = @'
    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
'@
if ($content.Contains($search7)) { $content = $content.Replace($search7, $replace7) }

# 7) buildPlaceRecommendations bullets
$search8 = @'
  const bullets = top.map(p => • ${p.title}${p.rating ?   — ⭐ ${p.rating.toFixed(1)} : ''}${p.address ?   • ${p.address} : ''} ).join('\n');
'@
$replace8 = @'
  const bullets = top
    .map(p => `• ${p.title}${p.rating ? ` — ⭐ ${p.rating.toFixed(1)}` : ''}${p.address ? ` • ${p.address}` : ''}`)
    .join('\n');
'@
if ($content.Contains($search8)) { $content = $content.Replace($search8, $replace8) }

$search9 = @'
  return \n\nTövsiyələr (məkanlar):\n${bullets} ;
'@
$replace9 = @'
  return `\n\nTövsiyələr (məkanlar):\n${bullets}`;
'@
if ($content.Contains($search9)) { $content = $content.Replace($search9, $replace9) }

# 8) buildProductRecommendations bullets
$search10 = @'
  const bullets = top.map(p => • ${p.title}${p.price ?   — ${p.price} : ''}${p.source ?   • ${p.source} : ''}${p.rating ?   • ⭐ ${p.rating.toFixed(1)} : ''} ).join('\n');
'@
$replace10 = @'
  const bullets = top
    .map(p => `• ${p.title}${p.price ? ` — ${p.price}` : ''}${p.source ? ` • ${p.source}` : ''}${p.rating ? ` • ⭐ ${p.rating.toFixed(1)}` : ''}`)
    .join('\n');
'@
if ($content.Contains($search10)) { $content = $content.Replace($search10, $replace10) }

$search11 = @'
  return \n\nTövsiyələr (məhsullar):\n${bullets} ;
'@
$replace11 = @'
  return `\n\nTövsiyələr (məhsullar):\n${bullets}`;
'@
if ($content.Contains($search11)) { $content = $content.Replace($search11, $replace11) }

if ($content -ne $original) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
  Write-Host "Applied template fixes. Backup: $backup"
} else {
  Write-Host "No changes were applied (patterns not found). Backup: $backup"
}
