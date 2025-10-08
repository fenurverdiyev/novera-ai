import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, LiveCircleIcon } from './Icons';
import type { SearchMode } from '../types';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';

interface SearchBarProps {
  onSend: (query: string, images?: string[]) => void;
  isLoading: boolean;
  onVoiceClick?: () => void; // Opens live conversation overlay
  searchMode: SearchMode;
  onChangeMode: (mode: SearchMode) => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSend, isLoading, onVoiceClick, searchMode, onChangeMode }) => {
  const [query, setQuery] = useState('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any | null>(null);
  const sttBaseTextRef = useRef<string>('');
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const { hl, gl } = detectLocaleForSearch();
    debounceRef.current = window.setTimeout(async () => {
      const res = await suggestAutocomplete(q, { hl, gl });
      const items = res.slice(0, 8);
      setSuggestions(items);
      setActiveIndex(items.length ? 0 : -1);
    }, 220);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  const handleSend = () => {
    if (query.trim()) {
      onSend(query.trim());
      setQuery('');
      setSuggestions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }
    if (e.key === 'Enter' && !isLoading) {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
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
    if (e.key === 'Tab' && suggestions.length > 0 && activeIndex >= 0) {
      const sug = suggestions[activeIndex];
      setQuery(sug);
      // do not send on Tab, just fill
      setTimeout(() => setSuggestions([]), 0);
      return;
    }
    if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
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
        setShowUploadMenu(false);
        setSuggestions([]);
      };
      reader.readAsDataURL(file);
    }
  };

  const startListening = () => {
    const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Səsdən mətnə çevirmə bu brauzerdə dəstəklənmir.');
      return;
    }
    try {
      const rec: any = new SpeechRec();
      rec.lang = (navigator.language || 'az-AZ');
      rec.continuous = true;
      rec.interimResults = true;
      sttBaseTextRef.current = query.trim();

      rec.onresult = (ev: any) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) {
            sttBaseTextRef.current = (sttBaseTextRef.current + ' ' + txt).trim();
            setQuery(sttBaseTextRef.current);
          } else {
            interim += txt + ' ';
          }
        }
        if (interim) {
          setQuery((sttBaseTextRef.current + ' ' + interim).trim());
        }
      };
      rec.onerror = () => { setIsListening(false); };
      rec.onend = () => { setIsListening(false); recognitionRef.current = null; };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (e) {
      setIsListening(false);
    }
  };

  const stopListening = () => {
    try { recognitionRef.current?.stop(); } catch {}
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) stopListening(); else startListening();
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-3 sm:px-4">
      <div className="relative flex items-stretch bg-bg-slate rounded-2xl shadow-xl p-1.5 sm:p-2 border border-white/10">
        <div className="hidden sm:flex items-center gap-3 pr-3 border-r border-white/10">
          <div className="relative flex flex-col rounded-2xl overflow-hidden border border-white/15 bg-white/5 p-1 ring-1 ring-white/10">
            <button
              onClick={() => onChangeMode('base')}
              className={`relative px-3 py-2 text-xs text-left rounded-xl transition-colors ${
                searchMode === 'base' 
                  ? 'text-white bg-accent/10 ring-1 ring-accent/50 shadow-[0_0_10px_rgba(88,166,255,0.35)]' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Base
            </button>
            <button
              onClick={() => onChangeMode('universe')}
              className={`relative px-3 py-2 text-xs text-left rounded-xl transition-colors ${
                searchMode === 'universe' 
                  ? 'text-white bg-accent/10 ring-1 ring-accent/50 shadow-[0_0_10px_rgba(88,166,255,0.35)]' 
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              Universe
            </button>
          </div>
        </div>

        <div className="flex items-center flex-1 px-2 gap-2">
          <div className="relative">
            <button 
              onClick={() => setShowUploadMenu(!showUploadMenu)} 
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors" 
              aria-label="Şəkil yüklə"
            >
              <PlusIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            {showUploadMenu && (
              <div className="absolute left-0 bottom-full mb-2 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 py-2 min-w-[180px] z-20 overflow-hidden">
                {/* arrow */}
                <div className="absolute left-4 -bottom-1 w-3 h-3 rotate-45 bg-white/10 border-l border-t border-white/20"></div>
                <button
                  onClick={() => { galleryInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2"
                >
                  <span>📷</span>
                  <span>Kamera</span>
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2"
                >
                  <span>🖼️</span>
                  <span>Qalereya</span>
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors flex items-center gap-2"
                >
                  <span>📁</span>
                  <span>Fayl yüklə</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="NovEra-dan soruşun..."
              className={`w-full bg-transparent text-base md:text-lg text-white placeholder-gray-500 focus:outline-none px-3 ${isListening ? 'ring-1 ring-rose-400/60 rounded-lg' : ''}`}
              disabled={isLoading}
              onFocus={() => { if (suggestions.length > 0) {/* show stays */} }}
            />
            {suggestions.length > 0 && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-auto sm:max-h-64 max-h-56">
                {suggestions.map((sug, idx) => (
                  <button
                    key={sug}
                    onMouseDown={(e) => { e.preventDefault(); }}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => { setQuery(sug); onSend(sug); setSuggestions([]); setActiveIndex(-1); }}
                    className={`w-full text-left px-4 py-3 text-[13px] sm:text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                    title={sug}
                  >
                    {sug}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          <button
            onClick={toggleListening}
            className={`p-2 rounded-full transition-colors ${isListening ? 'text-rose-300 bg-rose-500/10 ring-2 ring-rose-400/60 animate-pulse' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
            aria-pressed={isListening}
            aria-label="Səsi mətinə çevir"
            title="Səsi mətinə çevir"
          >
            <MicrophoneIcon className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          {/* Live conversation trigger (hollow circle) */}
          <button
            onClick={() => onVoiceClick && onVoiceClick()}
            className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Canlı danışıq"
            title="Canlı danışıq"
          >
            <LiveCircleIcon className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          <button
            onClick={handleSend}
            disabled={isLoading || !query.trim()}
            className="p-2 rounded-full bg-accent text-white disabled:bg-gray-600 transition-colors flex items-center justify-center w-9 h-9 md:w-10 md:h-10"
          >
            {isLoading ? <LoadingSpinner className="w-5 h-5 md:w-6 md:h-6" /> : <SendIcon className="w-5 h-5 md:w-6 md:h-6" />}
          </button>
        </div>

        <input 
          ref={fileInputRef}
          type="file" 
          onChange={handleFileUpload}
          className="hidden" 
          accept="image/*"
        />
        <input 
          ref={galleryInputRef}
          type="file" 
          onChange={handleFileUpload}
          className="hidden" 
          accept="image/*"
          capture="environment"
        />
      </div>
    </div>
  );
};