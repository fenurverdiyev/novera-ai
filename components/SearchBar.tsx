import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, MenuIcon, LiveCircleIcon } from './Icons';
import { Logo } from './Logo';
import type { SearchMode } from '../types';

interface SearchBarProps {
  onSend: (query: string, images?: string[]) => void;
  isLoading: boolean;
  onVoiceClick: () => void; // Opens live conversation overlay
  searchMode: SearchMode;
  onChangeMode: (mode: SearchMode) => void;
  onClearHistory: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({ onSend, isLoading, onVoiceClick, searchMode, onChangeMode, onClearHistory }) => {
  const [query, setQuery] = useState('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showMainMenu, setShowMainMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const sttBaseTextRef = useRef<string>('');

  useEffect(() => {
    try {
      setAccountEmail(localStorage.getItem('nov-era-auth'));
      setAvatar(localStorage.getItem('nov-era-avatar'));
    } catch {}
  }, []);

  const handleSend = () => {
    if (query.trim()) {
      onSend(query.trim());
      setQuery('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSend();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        const analysisQuery = query.trim() || "Bu şəkli analiz et.";
        onSend(analysisQuery, [base64Image]);
        setQuery('');
        setShowUploadMenu(false);
      };
      reader.readAsDataURL(file);
    }
  };

  // Inline Speech-to-Text (dictation) toggle
  const startListening = () => {
    const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Səsdən mətnə çevirmə bu brauzerdə dəstəklənmir.');
      return;
    }
    try {
      const rec: SpeechRecognition = new SpeechRec();
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
    <div className="w-full max-w-4xl mx-auto px-4">
      <div className="relative flex items-stretch bg-bg-slate rounded-2xl shadow-xl p-2 border border-white/10">
        {/* Left controls: Hamburger menu + Logo + vertical mode toggle */}
        <div className="flex items-center gap-3 pr-3 border-r border-white/10">
          <div className="relative">
            <button
              onClick={() => setShowMainMenu(v => !v)}
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Menyu"
            >
              <MenuIcon className="w-6 h-6" />
            </button>

            {showMainMenu && (
              <div className="absolute left-0 mt-2 w-64 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-hidden">
                <div className="p-2">
                  <button
                    onClick={() => { onClearHistory(); setShowMainMenu(false); }}
                    className="w-full text-left px-4 py-3 text-sm rounded-xl text-white/90 hover:bg-white/15 transition-colors"
                  >
                    🧹 Keçmişi təmizlə
                  </button>
                </div>
                <div className="h-px bg-white/10" />
                <div className="p-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center">
                    {avatar ? (
                      <img src={avatar} alt="Profil" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">👤</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs text-white/60">Hesab</div>
                    <div className="text-sm text-white/90 truncate">{accountEmail || 'Qonaq'}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <Logo className="hidden sm:block text-xl" />

          {/* Vertical mode toggle */}
          <div className="hidden sm:flex flex-col bg-bg-onyx/60 rounded-xl overflow-hidden border border-white/10">
            <button
              onClick={() => onChangeMode('base')}
              className={`px-3 py-1 text-xs text-left ${searchMode === 'base' ? 'bg-accent text-white' : 'text-text-sub hover:text-text-main'}`}
            >
              Base
            </button>
            <button
              onClick={() => onChangeMode('universe')}
              className={`px-3 py-1 text-xs text-left ${searchMode === 'universe' ? 'bg-accent text-white' : 'text-text-sub hover:text-text-main'}`}
            >
              Universe
            </button>
          </div>
        </div>

        {/* Middle: + menu and text input */}
        <div className="flex items-center flex-1 px-2">
          <div className="relative">
            <button 
              onClick={() => setShowUploadMenu(!showUploadMenu)} 
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors" 
              aria-label="Şəkil yüklə"
            >
              <PlusIcon className="w-6 h-6" />
            </button>
            
            {showUploadMenu && (
              <div className="absolute left-0 mt-2 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 py-2 min-w-[160px] z-20 overflow-hidden">
                <button
                  onClick={() => { galleryInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors"
                >
                  📷 Qalereya
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                  className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 transition-colors"
                >
                  📁 Fayl yüklə
                </button>
              </div>
            )}
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="NovEra-dan soruşun..."
            className={`flex-grow bg-transparent text-lg text-white placeholder-gray-500 focus:outline-none px-3 ${isListening ? 'ring-1 ring-rose-400/60 rounded-lg' : ''}`}
            disabled={isLoading}
          />
        </div>

        {/* Right controls: STT mic + live circle + send */}
        <div className="flex items-center gap-2 pl-3 border-l border-white/10">
          {/* Inline STT mic */}
          <button
            onClick={toggleListening}
            className={`p-2 rounded-full transition-colors ${isListening ? 'text-rose-300 bg-rose-500/10 ring-2 ring-rose-400/60 animate-pulse' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
            aria-pressed={isListening}
            aria-label="Səsi mətinə çevir"
            title="Səsi mətinə çevir"
          >
            <MicrophoneIcon className="w-6 h-6" />
          </button>

          {/* Live conversation (overlay) - hollow circle */}
          <button onClick={onVoiceClick} className="p-2 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition-colors" aria-label="Canlı danışıq">
            <LiveCircleIcon className="w-6 h-6" />
          </button>

          <button
            onClick={handleSend}
            disabled={isLoading || !query.trim()}
            className="p-2 rounded-full bg-accent text-white disabled:bg-gray-600 transition-colors flex items-center justify-center w-10 h-10"
          >
            {isLoading ? <LoadingSpinner className="w-6 h-6" /> : <SendIcon className="w-6 h-6" />}
          </button>
        </div>

        {/* Hidden file inputs */}
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