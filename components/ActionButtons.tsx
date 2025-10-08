import React, { useEffect, useRef, useState } from 'react';
import { MicrophoneIcon, CameraIcon, XIcon, CameraFlipIcon, SoundWaveIcon, GlobeIcon } from './LiveIcons';
import { VoiceSelector } from './VoiceSelector';
import { Orb } from './Orb';

export type LiveStatus = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

interface ActionButtonsProps {
  status: LiveStatus;
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
  onVoiceMenuOpenChange?: (open: boolean) => void;
  voiceMenuOpen?: boolean; // controlled open state from parent (optional)
  disableInlineVoiceSelector?: boolean; // when true, do not render internal selector
}

// Order: females first → Leyla, Arzu; then males
const voices = [
  { id: 'Zephyr',  name: 'Leyla',  gender: 'female', description: 'Zəkalı, zarafatcıl, parlaq və çevik danışıq. Məzəli, pozitiv ton.' },
  { id: 'Sulafat', name: 'Arzu',   gender: 'female', description: 'Səmimi və qayğıkeş; yumşaq, sakin səs. Rahatlıq və güvən yaradır, motivasiya və dəstək verir.' },
  { id: 'Fenrir',  name: 'Səlim',  gender: 'male',   description: 'Uşaqvari, enerjili və maraqlı; həyəcanlı emosiyalar, oyunsu üslub.' },
  { id: 'Gacrux',  name: 'Kamran', gender: 'male',   description: 'Qoca, müdrik və təmkinli; dərin, ciddi və sakit izahlar.' },
  { id: 'Charon',  name: 'İlkin',  gender: 'male',   description: 'Texniki və analitik; kod, riyaziyyat və analizdə dəqiq izah.' },
  { id: 'Puck',    name: 'Fərid',  gender: 'male',   description: 'Gənc, cool və dinamik; sosial media, oyun, əyləncə vibe.' },
] as const;

type ButtonProps = { onClick: () => void; className?: string; children: React.ReactNode; disabled?: boolean; size?: 'normal' | 'large' };
const ActionButton: React.FC<ButtonProps> = ({ onClick, className = '', children, disabled, size = 'normal' }) => {
  const sizeClasses = size === 'large' ? 'w-20 h-20' : 'w-14 h-14';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-full flex items-center justify-center transition-all duration-300 ease-in-out group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${sizeClasses} ${className}`}
    >
      <div className="absolute inset-0 rounded-full bg-white/5 border border-white/10 group-hover:bg-white/10 transition-colors duration-300"></div>
      <div className="absolute inset-0 rounded-full border border-white/20 scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 ease-in-out"></div>
      <div className="relative z-10">{children}</div>
    </button>
  );
};

export const ActionButtons: React.FC<ActionButtonsProps> = ({ status, isCameraOn, isSearchEnabled, selectedVoice, isMuted, isRecording, onMicClick, onCameraClick, onCameraFlip, onCancelClick, onVoiceChange, onToggleSearch, onVoiceMenuOpenChange, voiceMenuOpen: voiceMenuOpenProp, disableInlineVoiceSelector }) => {
  const isSessionActive = status !== 'idle';
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const lastClickRef = useRef<number | null>(null);

  const handleMicPress = () => {
    const now = Date.now();
    const DOUBLE_CLICK_THRESHOLD = 300;
    if (lastClickRef.current && now - lastClickRef.current < DOUBLE_CLICK_THRESHOLD) {
      lastClickRef.current = null;
      onCancelClick();
      return;
    }
    lastClickRef.current = now;
    onMicClick();
  };

  useEffect(() => {
    const t = window.setInterval(() => {
      if (lastClickRef.current && Date.now() - lastClickRef.current > 1000) lastClickRef.current = null;
    }, 800);
    return () => window.clearInterval(t);
  }, []);

  // Sync internal state with external control (if provided)
  useEffect(() => {
    if (typeof voiceMenuOpenProp === 'boolean' && voiceMenuOpenProp !== voiceMenuOpen) {
      setVoiceMenuOpen(voiceMenuOpenProp);
    }
  }, [voiceMenuOpenProp]);

  const handleVoiceSelect = (voiceId: string) => {
    onVoiceChange(voiceId);
    setVoiceMenuOpen(false);
    onVoiceMenuOpenChange?.(false);
  };

  // Radial placement helper
  const R = 84;
  const pos = (deg: number, r: number = R): React.CSSProperties => ({
    position: 'absolute',
    left: `calc(50% + ${Math.cos((deg * Math.PI) / 180) * r}px)`,
    top: `calc(50% + ${Math.sin((deg * Math.PI) / 180) * r}px)`,
    transform: 'translate(-50%, -50%)',
  });

  return (
    <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80">
      {!disableInlineVoiceSelector && (
        <VoiceSelector 
          isOpen={voiceMenuOpen} 
          voices={voices as any}
          selectedVoice={selectedVoice} 
          onVoiceChange={handleVoiceSelect}
          onClose={() => { setVoiceMenuOpen(false); onVoiceMenuOpenChange?.(false); }}
          usePortal={true}
        />
      )}

      {/* Radial controls wrapper (hidden while voice menu open) */}
      <div className={`${voiceMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity duration-200`}>
        {/* Mic + Orb at center */}
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
          {!isCameraOn && <Orb status={status} isCameraOn={false} />}
          {(() => {
            const ring = isRecording
              ? 'bg-red-500/60 border-2 border-red-400 ring-4 ring-red-300/40 shadow-[0_0_28px] shadow-red-400/90 animate-pulse'
              : (isSessionActive ? 'bg-yellow-400/50 border-2 border-yellow-300 ring-4 ring-yellow-200/40 shadow-[0_0_22px] shadow-yellow-300/80' : '');
            return (
              <ActionButton onClick={handleMicPress} size="large" className="">
                <div className={`absolute inset-0 rounded-full transition-all duration-300 ${ring || 'bg-transparent'}`}></div>
                {isRecording && <div className="absolute inset-0 rounded-full bg-red-400/40 animate-ping"></div>}
                <MicrophoneIcon className="w-8 h-8 text-white" />
              </ActionButton>
            );
          })()}
        </div>

        {/* Voice selector (left) */}
        <div style={pos(180)}>
          <ActionButton onClick={() => { setVoiceMenuOpen(p => { const next = !p; onVoiceMenuOpenChange?.(next); return next; }); }} disabled={isSessionActive}>
            <SoundWaveIcon className="w-6 h-6 text-gray-300 group-hover:text-white" />
          </ActionButton>
        </div>

        {/* Camera (right) */}
        <div style={pos(0)}>
          <ActionButton onClick={onCameraClick} disabled={!isSessionActive} className={`${isCameraOn ? 'shadow-[0_0_18px] shadow-red-400/80' : ''}`}>
            <div className={`absolute inset-0 rounded-full transition-all duration-300 ${isCameraOn ? 'bg-red-500/60 border-2 border-red-400 ring-4 ring-red-300/40 animate-pulse' : 'bg-transparent'}`}></div>
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
      </div>

    </div>
  );
};
