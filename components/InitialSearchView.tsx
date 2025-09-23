import React, { useState } from 'react';
import { Logo } from './Logo';
import { SearchIcon, MicrophoneIcon, CameraIcon } from './Icons';

interface InitialSearchViewProps {
  onSend: (query: string) => void;
  onVoiceClick: () => void;
  // Kamera klikləmə funksiyası üçün yer (gələcəkdə istifadə edilə bilər)
  onCameraClick?: () => void; 
}

export const InitialSearchView: React.FC<InitialSearchViewProps> = ({ onSend, onVoiceClick, onCameraClick }) => {
  const [query, setQuery] = useState('');

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && query.trim()) {
      onSend(query.trim());
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="mb-8">
        <Logo isLarge={true} />
        <p className="text-lg text-text-sub mt-2">Yeni dövr burada başlayır.</p>
      </div>
      
      {/* Şəkildəki kimi yeni axtarış xanası */}
      <div className="w-full max-w-2xl mb-6 relative flex items-center">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60">
            <SearchIcon className="w-6 h-6" />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-black/30 rounded-full py-4 pl-12 pr-24 text-white text-lg focus:outline-none focus:ring-2 focus:ring-accent/80 border border-white/20 shadow-lg"
          placeholder="Axtarış edin və ya yazmağa başlayın..."
        />
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4 text-white/70">
            <MicrophoneIcon onClick={onVoiceClick} className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
            <CameraIcon onClick={onCameraClick} className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
        </div>
      </div>

      <h1 className="text-2xl font-semibold text-text-main">Bu gün sizə necə kömək edə bilərəm?</h1>
    </div>
  );
};
