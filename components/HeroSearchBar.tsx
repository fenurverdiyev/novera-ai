import React, { useState, useRef, useEffect } from 'react';

import { MicrophoneIcon, CameraIcon, SearchIcon, LoadingSpinner, PlusIcon, CloseIcon } from './Icons';
import { CameraCapture } from './CameraCapture';
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
  const [isFocused, setIsFocused] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const recognitionRef = useRef<any | null>(null);
  const sttBaseTextRef = useRef<string>('');
  const [isListening, setIsListening] = useState(false);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Load history on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('novEra.search.history');
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setHistory(arr as string[]);
    } catch {}
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      // show history when focused and query short
      if (isFocused) {
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
  }, [query, isFocused, history]);

  const handleSend = () => {
    const q = query.trim();
    if (!q) return;
    onSend(q);
    // push to history (dedupe, cap 20)
    setHistory(prev => {
      const cleaned = q.slice(0, 200);
      let next = prev.filter(p => p.toLowerCase() !== cleaned.toLowerCase());
      next.unshift(cleaned);
      if (next.length > 20) next = next.slice(0, 20);
      try { localStorage.setItem('novEra.search.history', JSON.stringify(next)); } catch {}
      return next;
    });
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
      rec.lang = (navigator.language || 'az-AZ');
      rec.continuous = true; rec.interimResults = true;
      sttBaseTextRef.current = query.trim();
      rec.onresult = (ev: any) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i]; const txt = res[0]?.transcript || '';
          if (res.isFinal) { sttBaseTextRef.current = (sttBaseTextRef.current + ' ' + txt).trim(); setQuery(sttBaseTextRef.current); }
          else { interim += txt + ' '; }
        }
        if (interim) setQuery((sttBaseTextRef.current + ' ' + interim).trim());
      };
      rec.onerror = () => { setIsListening(false); };
      rec.onend = () => { setIsListening(false); recognitionRef.current = null; };
      recognitionRef.current = rec; rec.start(); setIsListening(true);
    } catch { setIsListening(false); }
  };
  const stopListening = () => { try { recognitionRef.current?.stop(); } catch {} setIsListening(false); };
  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

  const ph = placeholder || 'Axtarış edin və ya yazmağa başlayın...';
  const canSearch = query.trim().length > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="relative">
        {/* Left search button (acts like Enter). Active only if there is text */}
        <button
          onClick={handleSend}
          disabled={!canSearch}
          className={`absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all border z-30 pointer-events-auto ${
            canSearch
              ? 'bg-accent/40 hover:bg-accent/50 border-accent/60 text-white shadow-md'
              : 'bg-white/5 border-white/15 text-white/40 cursor-not-allowed'
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
          className={`w-full rounded-full h-14 md:h-16 pl-12 pr-28 bg-black/30 text-white text-lg md:text-xl placeholder-white/70 focus:outline-none border border-white/20 ring-1 ring-white/10 backdrop-blur`}
          disabled={isLoading}
        />

        {/* Right action icons */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query.trim().length > 0 && (
            <button
              onClick={() => { setQuery(''); setSuggestions([]); }}
              className="p-2 rounded-full text-white/80 bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Mətni sil"
              title="Mətni sil"
              type="button"
            >
              <CloseIcon className="w-5 h-5" />
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
            className={`p-2 rounded-full ${isListening ? 'text-rose-300 bg-rose-500/10 ring-2 ring-rose-400/60 animate-pulse' : 'text-white/90 bg-white/10 hover:bg-white/15'} border border-white/20`}
            aria-pressed={isListening}
            aria-label="Səsi mətinə çevir"
            title="Səsi mətinə çevir"
          >
            {isLoading ? <LoadingSpinner className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => { setIsCameraOpen(true); setHasCaptured(false); setLocalError(null); }}
            className="p-2 rounded-full text-white/90 bg-white/10 hover:bg-white/15 border border-white/20"
            aria-label="Kamera ilə çək"
            title="Kamera ilə çək"
          >
            <CameraIcon className="w-5 h-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu(v => !v)}
              className="p-2 rounded-full text-white/90 bg-white/10 hover:bg-white/15 border border-white/20"
              aria-label="Şəkil əlavə et"
              title="Şəkil əlavə et"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
            {showUploadMenu && (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 py-2 min-w-[180px] z-20 overflow-hidden">
                <div className="absolute right-4 -top-1 w-3 h-3 rotate-45 bg-white/10 border-t border-l border-white/20" />
                <button onClick={() => { setIsCameraOpen(true); setHasCaptured(false); setLocalError(null); setShowUploadMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2">
                  <span>📷</span>
                  <span>Kamera</span>
                </button>
                <button onClick={() => { galleryInputRef.current?.click(); setShowUploadMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2">
                  <span>🖼️</span>
                  <span>Qalereya</span>
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2">
                  <span>📁</span>
                  <span>Fayl yüklə</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="absolute top-[calc(100%+0.5rem)] left-0 w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-auto max-h-64 thin-scroll">
            {isFocused && query.trim().length < 2 && (
              <div className="px-4 py-2 text-xs text-white/60 border-b border-white/10">Keçmiş axtarışlar</div>
            )}
            {suggestions.map((sug, idx) => (
              <button
                key={sug}
                onMouseDown={(e) => { e.preventDefault(); }}
                onMouseEnter={() => setActiveIndex(idx)}
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
                className={`w-full text-left px-4 py-3 text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                title={sug}
              >
                {sug}
              </button>
            ))}
          </div>
        )}

        {/* Hidden inputs for uploads */}
        <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />
        <input ref={galleryInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" capture={false} />
      </div>

      {/* Camera overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsCameraOpen(false)} />
          <div className="relative z-50 w-[92vw] max-w-[680px] h-[60vh] bg-bg-slate/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/80 text-sm">Kamera</div>
              <button onClick={() => setIsCameraOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/80">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            {localError && (
              <div className="mb-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded p-2">{localError}</div>
            )}
            <div className="flex-1 relative rounded-lg overflow-hidden">
              <CameraCapture
                isActive={true}
                captureInterval={1200}
                onError={(msg) => setLocalError(msg)}
                onImageCaptured={(img) => {
                  if (hasCaptured) return;
                  setHasCaptured(true);
                  setIsCameraOpen(false);
                  const analysisQuery = (query.trim() || 'Bu şəkli analiz et.');
                  onSend(analysisQuery, [img.dataUrl]);
                  setQuery('');
                }}
              />
            </div>
            <div className="pt-3 text-center text-xs text-white/70">Şəkil avtomatik çəkilib axtarışa göndəriləcək</div>
          </div>
        </div>
      )}
    </div>
  );
};
