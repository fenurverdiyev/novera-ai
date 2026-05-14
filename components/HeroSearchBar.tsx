import React, { useState, useRef, useEffect } from 'react';

import { MicrophoneIcon, CameraIcon, SearchIcon, LoadingSpinner, PlusIcon, CloseIcon } from './Icons';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';

interface HeroSearchBarProps {
  onSend: (query: string, images?: string[]) => void;
  isLoading: boolean;
  onVoiceClick: () => void;
  placeholder?: string;
  onImageSelected?: (images: string[]) => void;
  enableEmptySubmit?: boolean;
  disableHistory?: boolean;
}

export const HeroSearchBar: React.FC<HeroSearchBarProps> = ({ onSend, isLoading, onVoiceClick, placeholder, onImageSelected, enableEmptySubmit, disableHistory }) => {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const sttBaseTextRef = useRef<string>('');
  const manualStopRef = useRef<boolean>(false);
  const [isListening, setIsListening] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);

  // Load history on mount
  useEffect(() => {
    if (disableHistory) { setHistory([]); return; }
    try {
      const raw = localStorage.getItem('novEra.search.history');
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setHistory(arr as string[]);
    } catch {}
  }, [disableHistory]);

  

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      // show history when focused and query short (only if allowed)
      if (isFocused && !disableHistory) {
        setSuggestions(history);
        setActiveIndex(history.length ? 0 : -1);
      } else {
        setSuggestions([]);
        setActiveIndex(-1);
      }
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
  }, [query, isFocused, history, disableHistory]);

  const handleSend = () => {
    const q = query.trim();
    if (!q && !enableEmptySubmit) return;
    onSend(q);
    // push to history (dedupe, cap 20) — disabled for incognito
    if (q && !disableHistory) {
      setHistory(prev => {
        const cleaned = q.slice(0, 200);
        let next = prev.filter(p => p.toLowerCase() !== cleaned.toLowerCase());
        next.unshift(cleaned);
        if (next.length > 20) next = next.slice(0, 20);
        try { localStorage.setItem('novEra.search.history', JSON.stringify(next)); } catch {}
        return next;
      });
    }
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
        // Do not auto-send; notify parent that an image is ready for search
        onImageSelected?.([base64Image]);
        setSuggestions([]);
        setShowUploadMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // STT inline mic
  const startListening = () => {
    const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) { alert('Səsdən mətnə çevirmə bu brauzerdə dəstəklənmir.'); return; }
    try {
      const rec: any = new SpeechRec();
      let sttLang = (navigator.language || 'en-US');
      try { const s = localStorage.getItem('nov-era-stt-lang'); if (s) sttLang = s; } catch {}
      rec.lang = sttLang;
      rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 3;
      sttBaseTextRef.current = query.trim();
      rec.onresult = (ev: any) => {
        let interim = '';
        const pickBest = (alts: any) => {
          try {
            let best: any = alts[0] || {};
            for (let j = 1; j < alts.length; j++) { if ((alts[j]?.confidence || 0) > (best?.confidence || 0)) best = alts[j]; }
            return (best?.transcript || '').toString();
          } catch { return (alts?.[0]?.transcript || '').toString(); }
        };
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const txt = pickBest(res);
          if (res.isFinal) { sttBaseTextRef.current = (sttBaseTextRef.current + ' ' + txt).trim(); setQuery(sttBaseTextRef.current); }
          else { interim += txt + ' '; }
        }
        if (interim) setQuery((sttBaseTextRef.current + ' ' + interim).trim());
      };
      rec.onerror = () => { setIsListening(false); if (!manualStopRef.current) { try { rec.stop(); } catch {}; try { rec.start(); setIsListening(true); } catch {} } };
      rec.onend = () => { setIsListening(false); if (!manualStopRef.current) { try { rec.start(); setIsListening(true); return; } catch {} } recognitionRef.current = null; };
      recognitionRef.current = rec; manualStopRef.current = false; rec.start(); setIsListening(true);
    } catch { setIsListening(false); }
  };
  const stopListening = () => { try { manualStopRef.current = true; recognitionRef.current?.stop(); } catch {} setIsListening(false); };
  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

  

  const ph = placeholder || 'Axtarış edin və ya yazmağa başlayın...';
  const canSearch = query.trim().length > 0 || !!enableEmptySubmit;
  const isHistoryMode = !disableHistory && isFocused && query.trim().length < 2;

  const removeFromHistory = (item: string) => {
    setHistory(prev => {
      const next = prev.filter(p => p.toLowerCase() !== item.toLowerCase());
      try { localStorage.setItem('novEra.search.history', JSON.stringify(next)); } catch {}
      return next;
    });
    setSuggestions(prev => prev.filter(p => p.toLowerCase() !== item.toLowerCase()));
    setActiveIndex(-1);
  };

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="relative group">
        {/* Left search button (acts like Enter). Active only if there is text */}
        <button
          onClick={handleSend}
          disabled={!canSearch}
          className={`absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-300 z-30 pointer-events-auto ${
            canSearch
              ? 'bg-accent/20 hover:bg-accent/40 text-accent shadow-md scale-100'
              : 'bg-transparent text-white/30 cursor-not-allowed scale-95'
          }`}
          aria-label="Axtar"
          title="Axtar"
          type="button"
        >
          <SearchIcon className="w-4 h-4 md:w-5 md:h-5" />
        </button>

        {/* Input */}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { setIsFocused(true); if (query.trim().length < 2) { setSuggestions(history); setActiveIndex(history.length ? 0 : -1); } }}
          onBlur={() => { setTimeout(() => { setIsFocused(false); setSuggestions([]); setActiveIndex(-1); }, 150); }}
          placeholder={ph}
          className={`w-full rounded-full h-14 md:h-[64px] pl-14 md:pl-16 pr-32 md:pr-[140px] bg-[#0f0f13]/85 backdrop-blur-3xl text-[16px] md:text-[18px] font-medium text-white placeholder-white/40 focus:outline-none border border-white/10 ring-1 ring-black/20 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] focus:border-accent/40 focus:ring-accent/50 transition-all duration-300`}
          disabled={isLoading}
          autoComplete="one-time-code"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
        />

        {/* Right action icons */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 md:gap-2">
          {query.trim().length > 0 && (
            <button
              onClick={() => { setQuery(''); setSuggestions([]); }}
              className="p-2 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Mətni sil"
              title="Mətni sil"
              type="button"
            >
              <CloseIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          )}

        {/* Local styles for thin scrollbar on suggestions */}
        <style>
          {`
            .thin-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.25) transparent; }
            .thin-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
            .thin-scroll::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.28); border-radius: 8px; }
            .thin-scroll::-webkit-scrollbar-track { background: transparent; }
          `}
        </style>
          <button
            onClick={toggleListening}
            className={`p-2 rounded-full transition-colors ${isListening ? 'text-rose-400 bg-rose-500/20 ring-2 ring-rose-400/50 animate-pulse' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            aria-pressed={isListening}
            aria-label="Səsi mətinə çevir"
            title="Səsi mətinə çevir"
          >
            {isLoading ? <LoadingSpinner className="w-4 h-4 md:w-5 md:h-5" /> : <MicrophoneIcon className="w-4 h-4 md:w-5 md:h-5" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUploadMenu(v => !v)}
              className="p-2 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Şəkil əlavə et"
              title="Şəkil əlavə et"
              type="button"
            >
              <PlusIcon className="w-4 h-4 md:w-5 md:h-5" />
            </button>
            {showUploadMenu && (
              <div className="absolute right-0 top-[calc(100%+1rem)] bg-[#16161a]/95 backdrop-blur-3xl rounded-[20px] shadow-2xl border border-white/10 p-1.5 min-w-[180px] z-[60] overflow-hidden animate-in fade-in zoom-in duration-200">
                <button onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                  <span>📷</span>
                  <span>Kamera</span>
                </button>
                <button onClick={() => { galleryInputRef.current?.click(); setShowUploadMenu(false); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                  <span>🖼️</span>
                  <span>Qalereya</span>
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }} className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2">
                  <span>📁</span>
                  <span>Fayl yüklə</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Suggestions / History popover */}
        {(isHistoryMode || suggestions.length > 0) && (
          <div className="absolute top-[calc(100%+0.75rem)] left-0 right-0 bg-[#0f0f13]/95 backdrop-blur-3xl rounded-[24px] border border-white/10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] ring-1 ring-white/5 z-50 overflow-hidden thin-scroll overscroll-contain pointer-events-auto">
            <div className="p-2 flex flex-col gap-0.5">
              {isHistoryMode && (
                <div className="flex items-center justify-between px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">
                  <span>Keçmiş axtarışlar</span>
                  {history.length > 0 && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onTouchStart={(e) => { e.preventDefault(); }}
                      onClick={() => { setHistory([]); setSuggestions([]); try { localStorage.setItem('novEra.search.history', JSON.stringify([])); } catch {} }}
                      className="px-2 py-1 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Hamısını sil
                    </button>
                  )}
                </div>
              )}
              {suggestions.map((sug, idx) => (
                <div
                  key={sug}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${idx === activeIndex ? 'bg-accent/20' : 'hover:bg-white/5'}`}
                >
                  <SearchIcon className="w-4 h-4 text-white/30" />
                  <button
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onTouchStart={(e) => { e.preventDefault(); }}
                    onClick={() => {
                      setQuery(sug);
                      onSend(sug);
                      setHistory(prev => {
                        const cleaned = sug.slice(0, 200);
                        let next = prev.filter(p => p.toLowerCase() !== cleaned.toLowerCase());
                        next.unshift(cleaned);
                        if (next.length > 20) next = next.slice(0, 20);
                        try { localStorage.setItem('novEra.search.history', JSON.stringify(next)); } catch {}
                        return next;
                      });
                      setSuggestions([]); setActiveIndex(-1);
                    }}
                    className={`flex-1 text-left text-[15px] font-medium truncate ${idx === activeIndex ? 'text-white' : 'text-white/80'}`}
                    title={sug}
                  >
                    {sug}
                  </button>
                  {isHistoryMode && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onTouchStart={(e) => { e.preventDefault(); }}
                      onClick={(e) => { e.stopPropagation(); removeFromHistory(sug); }}
                      className="ml-auto w-6 h-6 flex items-center justify-center rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                      title="Tarixçədən sil"
                      aria-label="Tarixçədən sil"
                    >
                      <CloseIcon className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {isHistoryMode && suggestions.length === 0 && (
                <div className="px-4 py-6 text-sm font-medium text-white/40 text-center">
                  Hələ keçmiş yoxdur. Axtarış edəndə burada görünəcək.
                </div>
              )}
            </div>
          </div>
        )}

        <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" capture="environment" />
        <input ref={galleryInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" capture={false} />
      </div>
    </div>
  );
};
