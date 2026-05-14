import React, { useEffect, useRef, useState } from 'react';
import { MicrophoneIcon, CameraIcon, XIcon, CameraFlipIcon, SoundWaveIcon, GlobeIcon, BrowserIcon } from './Icons';
import { VoiceSelector } from './VoiceSelector';
import { Orb } from './Orb';

interface ActionButtonsProps {
  status: 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';
  isCameraOn: boolean;
  isSearchEnabled: boolean;
  selectedVoice: string;
  isMuted: boolean;
  isRecording?: boolean;
  onMicClick: () => void;
  onCameraClick: () => void;
  onCameraFlip: () => void;
  onCancelClick: () => void;
  onVoiceChange: (voice: string) => void;
  onToggleSearch: () => void;
  onOpenBrowser: () => void;
}

// Order: females first → Leyla, Arzu; then males
const voices: { id: string; name: string; gender: 'female' | 'male'; description: string }[] = [
  { id: 'Zephyr',  name: 'Leyla',  gender: 'female', description: 'Zəkalı, zarafatcıl, parlaq və çevik danışıq. Məzəli, pozitiv ton.' },
  { id: 'Sulafat', name: 'Arzu',   gender: 'female', description: 'Səmimi və qayğıkeş; yumşaq, sakit səs. Rahatlıq və güvən yaradır, motivasiya və dəstək verir.' },
  { id: 'Fenrir',  name: 'Səlim',  gender: 'male',   description: 'Uşaqvari, enerjili və maraqlı; həyəcanlı emosiyalar, oyunsu üslub.' },
  { id: 'Gacrux',  name: 'Kamran', gender: 'male',   description: 'Qoca, müdrik və təmkinli; dərin, ciddi və sakit izahlar.' },
  { id: 'Charon',  name: 'İlkin',  gender: 'male',   description: 'Texniki və analitik; kod, riyaziyyat və analizdə dəqiq izah.' },
  { id: 'Puck',    name: 'Fərid',  gender: 'male',   description: 'Gənc, cool və dinamik; sosial media, oyun, əyləncə vibe.' },
];

const ActionButton: React.FC<{ onClick: () => void; className?: string; children: React.ReactNode; disabled?: boolean, size?: 'normal' | 'large' }> = ({ onClick, className = '', children, disabled, size = 'normal' }) => {
    const sizeClasses = size === 'large' ? 'w-20 h-20' : 'w-14 h-14';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-full flex items-center justify-center transition-all duration-300 ease-in-out group focus:outline-none disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${sizeClasses} ${className}`}
    >
      <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors duration-300"></div>
      <div className="absolute inset-0 rounded-full border border-white/20 scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 ease-in-out"></div>
      <div className="relative z-10">{children}</div>
    </button>
  );
};

export const ActionButtons: React.FC<ActionButtonsProps> = ({ status, isCameraOn, isSearchEnabled, selectedVoice, isMuted, isRecording, onMicClick, onCameraClick, onCameraFlip, onCancelClick, onVoiceChange, onToggleSearch, onOpenBrowser }) => {
  const isSessionActive = status !== 'idle';
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const lastClickRef = useRef<number | null>(null);

  const handleMicPress = () => {
    const now = Date.now();
    const DOUBLE_CLICK_THRESHOLD = 300; // ms

    // If second click arrives quickly, treat as cancel regardless of current render state
    if (lastClickRef.current && (now - lastClickRef.current < DOUBLE_CLICK_THRESHOLD)) {
      onCancelClick();
      lastClickRef.current = null;
      return;
    }

    // Single-click: start session (if idle) or toggle mute (if active)
    onMicClick();
    lastClickRef.current = now;
  };

  useEffect(() => {
    const clearRef = window.setInterval(() => {
      // reset stale lastClick after 1s
      if (lastClickRef.current && Date.now() - lastClickRef.current > 1000) lastClickRef.current = null;
    }, 1000);
    return () => { window.clearInterval(clearRef); };
  }, []);
  const handleVoiceSelect = (voiceId: string) => {
    onVoiceChange(voiceId);
    setVoiceMenuOpen(false);
  }

  // Radial placement helper
  const R = 90;
  const pos = (deg: number, r: number = R): React.CSSProperties => ({
    position: 'absolute',
    left: `calc(50% + ${Math.cos((deg * Math.PI) / 180) * r}px)`,
    top: `calc(50% + ${Math.sin((deg * Math.PI) / 180) * r}px)`,
    transform: 'translate(-50%, -50%)',
  });

  return (
    <div className="relative w-52 h-52">
      <VoiceSelector 
        isOpen={voiceMenuOpen} 
        voices={voices} 
        selectedVoice={selectedVoice} 
        onVoiceChange={handleVoiceSelect}
        onClose={() => setVoiceMenuOpen(false)}
      />

      {/* Mic + Orb at center */}
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
        <Orb status={status} isCameraOn={isCameraOn} />
        <ActionButton onClick={handleMicPress} size="large" className={`${isRecording ? 'shadow-[0_0_20px] shadow-cyan-400/80' : ''}`}>
          <div className={`absolute inset-0 rounded-full transition-colors duration-300 ${isRecording ? 'bg-cyan-500/40 border-2 border-cyan-400' : 'bg-transparent'}`}></div>
          {isRecording && <div className="absolute inset-0 rounded-full bg-cyan-500/50 animate-ping"></div>}
          <MicrophoneIcon className="w-8 h-8 text-white" />
        </ActionButton>
      </div>

      {/* Cancel (top-left) */}
      {isSessionActive && (
        <div style={pos(-135, R + 6)}>
          <ActionButton onClick={onCancelClick}>
            <XIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
          </ActionButton>
        </div>
      )}

      {/* Voice selector (left) */}
      <div style={pos(180)}>
        <ActionButton onClick={() => setVoiceMenuOpen(p => !p)} disabled={isSessionActive}>
          <SoundWaveIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
        </ActionButton>
      </div>

      {/* Camera (right) */}
      <div style={pos(0)}>
        <ActionButton onClick={onCameraClick} disabled={!isSessionActive} className={`${isCameraOn ? 'shadow-[0_0_15px] shadow-cyan-400/70' : ''}`}>
          <div className={`absolute inset-0 rounded-full transition-colors duration-300 ${isCameraOn ? 'bg-cyan-500/40 border-2 border-cyan-400' : 'bg-transparent'}`}></div>
          <CameraIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
        </ActionButton>
      </div>

      {/* Camera flip directly under the Camera button (same X, 64px lower) */}
      {isCameraOn && (
        <div style={{ position: 'absolute', left: `calc(50% + ${R}px)`, top: `calc(50% + 64px)`, transform: 'translate(-50%, -50%)' }}>
          <ActionButton onClick={onCameraFlip}>
            <CameraFlipIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
          </ActionButton>
        </div>
      )}

      {/* Globe directly under the Voice button (same X, 64px lower) */}
      <div style={{ position: 'absolute', left: `calc(50% - ${R}px)`, top: `calc(50% + 64px)`, transform: 'translate(-50%, -50%)' }}>
        <ActionButton onClick={onToggleSearch} disabled={isSessionActive} className={`${isSearchEnabled ? 'shadow-[0_0_15px] shadow-purple-400/70' : ''}`}>
          <div className={`absolute inset-0 rounded-full transition-colors duration-300 ${isSearchEnabled ? 'bg-purple-500/40 border-2 border-purple-400' : 'bg-transparent'}`}></div>
          <GlobeIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
        </ActionButton>
      </div>

      {/* Browser (bottom) */}
      <div style={pos(90)}>
        <ActionButton onClick={onOpenBrowser}>
          <BrowserIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
        </ActionButton>
      </div>
    </div>
  );
};