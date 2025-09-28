param()
$ErrorActionPreference = 'Stop'

$path = 'd:\NovEra\NovEra\components\SearchBar.tsx'
$backup = $path + '.bak'
Copy-Item -LiteralPath $path -Destination $backup -Force

$content = Get-Content -LiteralPath $path -Raw

# 1) Add secondary import for SearchIcon, CameraIcon if not present
if ($content -notmatch "SearchIcon" -or $content -notmatch "CameraIcon") {
  $content = $content -replace "(import\\s+type\\s+\{\\s*SearchMode\\s*\}\\s+from\\s+'\\.\\.\\/types';)", "import { SearchIcon, CameraIcon } from './Icons';`r`n$1"
}

# 2) Extend interface with variant and placeholder
if ($content -match "interface\\s+SearchBarProps\\s*\{[\\s\\S]*?onChangeMode:.*?;[\\s\\S]*?\}") {
  $content = [regex]::Replace($content, "(interface\\s+SearchBarProps\\s*\{[\\s\\S]*?onChangeMode:\s*\(mode:\s*SearchMode\)\s*=>\s*void;)", "$1`r`n  variant?: 'default' | 'hero';`r`n  placeholder?: string;", 1)
}

# 3) Update component signature to accept variant and placeholder with default
$content = [regex]::Replace($content, "export\\s+const\\s+SearchBar:\s*React\\.FC<SearchBarProps>\\s*=\\s*\(\{\s*onSend,\s*isLoading,\s*onVoiceClick,\s*searchMode,\s*onChangeMode\s*\}\)\s*=>\s*\{", "export const SearchBar: React.FC<SearchBarProps> = ({ onSend, isLoading, onVoiceClick, searchMode, onChangeMode, variant = 'default', placeholder }) => {", 1)

# 4) Insert HERO variant block before default return
$hero = @'

  // --- HERO VARIANT (landing search) ---
  if (variant === 'hero') {
    const heroPlaceholder = placeholder || 'Axtarış edin və ya yazmağa başlayın...';
    const handleHeroKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !isLoading) {
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          const sug = suggestions[activeIndex];
          setQuery(sug);
          onSend(sug);
          setSuggestions([]);
          setActiveIndex(-1);
        } else {
          handleSend();
        }
      } else if (e.key === 'Escape') {
        setSuggestions([]);
        setActiveIndex(-1);
      }
    };

    return (
      <div className="w-full max-w-3xl mx-auto px-4">
        <div className="relative">
          <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
            <div className="p-1.5 rounded-full bg-white/5 border border-white/15 shadow-[0_0_16px_rgba(245,158,11,0.35)]">
              <SearchIcon className="w-4 h-4 md:w-5 md:h-5 text-amber-300" />
            </div>
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleHeroKeyDown}
            placeholder={heroPlaceholder}
            className={`w-full rounded-full h-14 md:h-16 pl-12 pr-28 bg-black/30 text-white text-lg md:text-xl placeholder-white/60 focus:outline-none border border-white/20 ring-1 ring-white/10 backdrop-blur`}
            disabled={isLoading}
          />

          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => onVoiceClick()}
              className="p-2 rounded-full text-white/90 bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Səs ilə danış"
              title="Səs ilə danış"
            >
              <MicrophoneIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-full text-white/90 bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Şəkil yüklə"
              title="Şəkil yüklə"
            >
              <CameraIcon className="w-5 h-5" />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="absolute top-[calc(100%+0.5rem)] left-0 w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-auto max-h-64">
              {suggestions.map((sug, idx) => (
                <button
                  key={sug}
                  onMouseDown={(e) => { e.preventDefault(); }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => { setQuery(sug); onSend(sug); setSuggestions([]); setActiveIndex(-1); }}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                  title={sug}
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />
        </div>
      </div>
    );
  }
'@

# Insert hero variant: find the point before the final return(
$content = [regex]::Replace($content, "(const\\s+toggleListening\\s*=\\s*\(\)\\s*=>\\s*\{[\\s\\S]*?\};\s*)(\r?\n\s*return\s*\()", "$1$hero`r`n  return (", 1)

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "Patched SearchBar hero variant. Backup: $backup"
