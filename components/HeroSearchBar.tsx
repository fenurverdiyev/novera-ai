import React, { useState, useRef, useEffect } from 'react';
import { MicrophoneIcon, CameraIcon, SearchIcon, LoadingSpinner } from './Icons';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';

interface HeroSearchBarProps {
  onSend: (query: string, images?: string[]) => void;
  isLoading: boolean;
  onVoiceClick: () => void;
  placeholder?: string;
}

export const HeroSearchBar: React.FC<HeroSearchBarProps> = ({ onSend, isLoading, onVoiceClick, placeholder }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const { hl, gl } = detectLocaleForSearch();
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await suggestAutocomplete(q, { hl, gl });
        const items = (res || []).slice(0, 8);
        setSuggestions(items);
        setActiveIndex(items.length ? 0 : -1);
      } catch {
        setSuggestions([]);
      }
    }, 220);

    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSend = () => {
    const q = query.trim();
    if (!q) return;
    onSend(q);
    setQuery('');
    setSuggestions([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      return;
    }
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        const analysisQuery = query.trim() || 'Bu şəkli analiz et.';
        onSend(analysisQuery, [base64Image]);
        setQuery('');
        setSuggestions([]);
      };
      reader.readAsDataURL(file);
    }
  };

  const ph = placeholder || 'Axtarış edin və ya yazmağa başlayın...';

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="relative">
        {/* Left search icon with warm glow */}
        <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          <div className="p-1.5 rounded-full bg-white/5 border border-white/15 shadow-[0_0_18px_rgba(245,158,11,0.45)]">
            <SearchIcon className="w-4 h-4 md:w-5 md:h-5 text-amber-300" />
          </div>
        </div>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={ph}
          className={`w-full rounded-full h-14 md:h-16 pl-12 pr-28 bg-black/30 text-white text-lg md:text-xl placeholder-white/70 focus:outline-none border border-white/20 ring-1 ring-white/10 backdrop-blur`}
          disabled={isLoading}
        />

        {/* Right action icons */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          <button
            onClick={() => onVoiceClick()}
            className="p-2 rounded-full text-white/90 bg-white/10 hover:bg-white/15 border border-white/20"
            aria-label="Səs ilə danış"
            title="Səs ilə danış"
          >
            {isLoading ? (
              <LoadingSpinner className="w-5 h-5" />
            ) : (
              <MicrophoneIcon className="w-5 h-5" />
            )}
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

        {/* Suggestions */}
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

        {/* Hidden input for uploads */}
        <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />
      </div>
    </div>
  );
};
