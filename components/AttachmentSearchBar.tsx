import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, LiveCircleIcon } from './Icons';
import type { SearchMode } from '../types';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';
import { getTranslation, Language } from '../utils/translations';

interface SearchBarProps {
  onSend: (query: string, images?: string[]) => void;
  isLoading: boolean;
  onVoiceClick?: () => void; // Opens live conversation overlay
  searchMode: SearchMode;
  onChangeMode: (mode: SearchMode) => void;
  disableSuggestions?: boolean;
  language: Language;
  isCentered?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
  onSend, 
  isLoading, 
  onVoiceClick, 
  searchMode, 
  onChangeMode,
  disableSuggestions = false,
  language,
  isCentered = false
}) => {
  const t = (key: any) => getTranslation(language, key);
  const [query, setQuery] = useState('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);


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
    if (q.length < 2 || disableSuggestions) {
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
    const q = query.trim();
    if (!q && attachedImages.length === 0) return;
    onSend(q, attachedImages.length ? attachedImages : undefined);
    setQuery('');
    setAttachedImages([]);
    setSuggestions([]);
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
        // Do not auto-send; add to attachments and let user press Send
        setAttachedImages(prev => [...prev, base64Image]);
        setShowUploadMenu(false);
        setSuggestions([]);
      };
      reader.readAsDataURL(file);
      try { (event.target as HTMLInputElement).value = ''; } catch { }
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
    try { recognitionRef.current?.stop(); } catch { }
    setIsListening(false);
  };

  const toggleListening = () => {
    if (isListening) stopListening(); else startListening();
  };



  return (
    <div className={`w-full transition-all duration-700 ${isCentered ? 'max-w-4xl mx-auto px-2 md:px-4' : 'max-w-4xl mx-auto px-2 md:px-6 mb-2 md:mb-4 animate-fade-in'}`}>
      <div className={`relative flex flex-col md:flex-row items-stretch md:items-center glass-card rounded-[2rem] md:rounded-[2.5rem] p-1.5 md:p-3 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 focus-within:border-cyan-400/30 focus-within:shadow-[0_0_40px_rgba(34,211,238,0.15)] focus-within:scale-[1.01] ${isCentered ? 'py-2 md:py-5' : ''}`}>
        <div className="flex md:flex items-center gap-1 md:gap-1.5 px-2 md:px-3 mb-1.5 md:mb-0 md:border-r border-white/10 overflow-x-auto no-scrollbar py-1">
          {(['base', 'universe', 'canvas'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={`px-3 md:px-4 py-1.5 md:py-2 text-[9px] md:text-[11px] font-bold uppercase tracking-widest rounded-xl md:rounded-2xl transition-all whitespace-nowrap ${
                searchMode === mode 
                  ? 'bg-cyan-500 text-slate-900 shadow-[0_0_15px_rgba(34,211,238,0.4)]' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t(mode)}
            </button>
          ))}
        </div>

        <div className="flex items-center flex-1 px-1 md:px-2 gap-1 md:gap-2">
          <div className="relative">
            <button
              onClick={() => setShowUploadMenu(!showUploadMenu)}
              className="p-2 md:p-3 rounded-xl md:rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
              aria-label={t('uploadImage')}
            >
              <PlusIcon className="w-6 h-6" />
            </button>
            {showUploadMenu && (
              <div className="absolute left-0 bottom-full mb-4 bg-[#0a0b14]/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 py-3 min-w-[220px] z-50 animate-fade-in overflow-hidden">
                <button
                  onClick={() => { galleryInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-5 py-4 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
                >
                  <span className="text-xl">📸</span>
                  <span>{t('camera')}</span>
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-5 py-4 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
                >
                  <span className="text-xl">🖼️</span>
                  <span>{t('gallery')}</span>
                </button>
                <div className="h-px bg-white/5 mx-5 my-1" />
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-5 py-4 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
                >
                  <span className="text-xl">📁</span>
                  <span>{t('file')}</span>
                </button>
              </div>
            )}
          </div>

          <div className="relative flex-1">
            {attachedImages.length > 0 && (
              <div className="mb-2 flex items-center gap-2 overflow-x-auto">
                {attachedImages.map((src, idx) => (
                  <div key={idx} className="relative w-11 h-11 rounded-md overflow-hidden border border-white/20 shadow">
                    <img src={src} alt="əlavə" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setAttachedImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs leading-5 text-center border border-white/30"
                      title="Sil"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('ask')}
              className={`w-full bg-transparent text-[15px] md:text-lg text-white placeholder-slate-500 focus:outline-none px-2 md:px-4 py-2 md:py-3 ${isListening ? 'ring-2 ring-rose-500/40 rounded-2xl animate-pulse' : ''}`}
              disabled={isLoading}
              onFocus={() => { if (suggestions.length > 0) {/* show stays */ } }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-form-type="other"
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

        <div className="flex items-center gap-1.5 px-2">
          <button
            onClick={toggleListening}
            className={`p-2 md:p-3 rounded-xl md:rounded-2xl transition-all active:scale-90 ${
              isListening 
                ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.5)]' 
                : 'text-slate-400 hover:text-rose-400 hover:bg-white/5'
            }`}
            title={t('stt')}
          >
            <MicrophoneIcon className="w-5 h-5 md:w-6 md:h-6" />
          </button>

          {onVoiceClick && (
            <button
              onClick={onVoiceClick}
              className="p-3 rounded-2xl text-slate-400 hover:text-cyan-400 hover:bg-white/5 transition-all active:scale-90"
              title={t('live')}
            >
              <LiveCircleIcon className="w-5 h-5 md:w-6 md:h-6" />
            </button>
          )}

          <button
            onClick={() => handleSend()}
            disabled={isLoading || (!query.trim() && attachedImages.length === 0)}
            className={`p-2 md:p-3 rounded-xl md:rounded-2xl transition-all active:scale-90 ${
              (!query.trim() && attachedImages.length === 0) || isLoading
                ? 'text-slate-600'
                : 'bg-white text-slate-900 shadow-xl hover:bg-cyan-400'
            }`}
          >
            {isLoading ? <LoadingSpinner className="w-5 h-5" /> : <SendIcon className="w-5 h-5 md:w-6 md:h-6" />}
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
