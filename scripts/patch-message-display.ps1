param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\components\MessageDisplay.tsx'
$text = Get-Content -LiteralPath $path -Raw

# 1) Replace Stepper with animated ellipsis on current step
$patternStepper = '(?s)const\s+Stepper:\s*React\.FC<\{\s*step\?:\s*1\s*\|\s*2\s*\|\s*3\s*\}>\s*=\s*\(\{\s*step\s*\}\)\s*=>\s*\{[\s\S]*?return\s*\([\s\S]*?\);\s*\r?\n\s*\};'
$replacementStepper = @"
const Stepper: React.FC<{ step?: 1 | 2 | 3 }> = ({ step }) => {
  const steps = [
    { id: 1 as const, label: 'Analiz edirəm' },
    { id: 2 as const, label: 'Axtarıram' },
    { id: 3 as const, label: 'Cavab verirəm' },
  ];
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        {steps.map((s, idx) => {
          const active = step ? s.id <= step : false;
          const isCurrent = step === s.id;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`px-3 py-1 rounded-full text-xs border ${active ? 'bg-accent/20 text-accent border-accent/30' : 'bg-white/5 text-white/70 border-white/10'}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${active ? 'bg-accent animate-pulse' : 'bg-white/30'}`}></span>
                <span className="align-middle">{s.label}</span>
                {isCurrent && (
                  <span className="inline-flex items-center ml-1 align-middle">
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse"></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse ml-0.5" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse ml-0.5" style={{ animationDelay: '300ms' }}></span>
                  </span>
                )}
              </div>
              {idx < steps.length - 1 && <div className={`w-6 h-px ${active ? 'bg-accent/50' : 'bg-white/10'}`}></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
"@

if ($text -match $patternStepper) {
  $text = [regex]::Replace($text, $patternStepper, $replacementStepper)
} else {
  Write-Warning 'Stepper block not found; leaving as-is.'
}

# 2) Add shimmer skeleton after the message text block for model messages while loading
$patternContentBlock = '(?s)(<div className="max-w-none text-text-main leading-relaxed text-\[15px\] md:text-base">[\s\S]*?</div>)'
$skeleton = @"
{!isUser && message.isLoading && (
  <div className="mt-3 space-y-2">
    <div className="h-4 bg-white/10 rounded animate-pulse"></div>
    <div className="h-4 bg-white/10 rounded w-5/6 animate-pulse"></div>
    <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse"></div>
  </div>
)}
"@

if ($text -match $patternContentBlock) {
  $text = [regex]::Replace($text, $patternContentBlock, "$1`r`n$skeleton")
} else {
  Write-Warning 'Content block not found; shimmer skeleton not inserted.'
}

Set-Content -LiteralPath $path -Value $text -Encoding UTF8
Write-Host 'MessageDisplay.tsx patched.'
