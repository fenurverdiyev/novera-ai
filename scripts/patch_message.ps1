$ErrorActionPreference = 'Stop'
$path = 'd:\NovEra\NovEra\components\MessageDisplay.tsx'
$text = Get-Content -Raw -Path $path

# 1) Step 3 label: add ellipsis
$text = [regex]::Replace($text, "\{ id:\s*3,\s*label:\s*'Cavab Verirəm'\s*\}", "{ id: 3, label: 'Cavab Verirəm...' }")

# 2) Replace single loading dot with simple skeleton
$old = '{message.isLoading && !message.text && <div className="w-3 h-3 bg-accent animate-pulse rounded-full mt-2"></div>}'
$replacement = @"
{message.isLoading && !message.text && (
  <div className="mt-2 space-y-2">
    <div className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full bg-accent/80 animate-pulse"></span>
      <span className="w-2 h-2 rounded-full bg-accent/60 animate-pulse"></span>
      <span className="w-2 h-2 rounded-full bg-accent/40 animate-pulse"></span>
    </div>
    <div className="h-3 w-3/5 bg-white/10 rounded"></div>
    <div className="h-3 w-2/5 bg-white/5 rounded"></div>
  </div>
)}
"@
$text = $text.Replace($old, $replacement)

[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
Write-Host 'MessageDisplay.tsx patched.'
