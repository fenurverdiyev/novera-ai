import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon } from './LiveIcons';
import { Orb } from './Orb';
import { ActionButtons, LiveStatus } from './ActionButtons';
import { VoiceSelector } from './VoiceSelector';
import { CameraView } from './CameraView';
import { onPcmData, startMic, stopMic } from '../services/liveConversationService';

type LiveConversationViewProps = {
  onQuery?: (query: string, images?: string[]) => void;
  onBack?: () => void;
};

const LiveConversationView: React.FC<LiveConversationViewProps> = ({ onQuery, onBack }) => {
  const [status, setStatus] = useState<LiveStatus>('idle');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
  const [isSearchEnabled, setIsSearchEnabled] = useState(true);
  const lastFrameRef = useRef<string | null>(null);
  const [orbHiding, setOrbHiding] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voices = [
    { id: 'Zephyr',  name: 'Leyla',  gender: 'female', description: 'Zəkalı, zarafatcıl, parlaq və çevik danışıq. Məzəli, pozitiv ton.' },
    { id: 'Sulafat', name: 'Arzu',   gender: 'female', description: 'Səmimi və qayğıkeş; yumşaq, sakin səs. Rahatlıq və güvən yaradır, motivasiya və dəstək verir.' },
    { id: 'Fenrir',  name: 'Səlim',  gender: 'male',   description: 'Uşaqvari, enerjili və maraqlı; həyəcanlı emosiyalar, oyunsu üslub.' },
    { id: 'Gacrux',  name: 'Kamran', gender: 'male',   description: 'Qoca, müdrik və təmkinli; dərin, ciddi və sakit izahlar.' },
    { id: 'Charon',  name: 'İlkin',  gender: 'male',   description: 'Texniki və analitik; kod, riyaziyyat və analizdə dəqiq izah.' },
    { id: 'Puck',    name: 'Fərid',  gender: 'male',   description: 'Gənc, cool və dinamik; sosial media, oyun, əyləncə vibe.' },
  ] as const;

  useEffect(() => {
    const sub = (pcm: Float32Array) => {
      // Placeholder: could compute level meter here
    };
    onPcmData(sub);
    return () => onPcmData(null);
  }, []);


  const startRecognition = useCallback(() => {
    try {
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) { console.warn('SpeechRecognition not supported'); return; }
      const rec = new SR();
      rec.lang = 'az-AZ';
      rec.continuous = true;
      rec.interimResults = true;
      let finalText = '';
      rec.onresult = (e: any) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript;
        }
      };
      rec.onerror = () => { /* ignore */ };
      rec.onend = () => {
        const q = finalText.trim();
        if (q) {
          setStatus('processing');
          const imgs = lastFrameRef.current ? [lastFrameRef.current] : undefined;
          onQuery?.(q, imgs);
        }
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {}
  }, [onQuery]);

  const stopRecognition = useCallback(() => {
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
  }, []);

  const handleMicClick = useCallback(async () => {
    if (status === 'idle') {
      setStatus('connecting');
      try {
        await startMic({ onData: () => {} });
        setIsRecording(true);
        setStatus('listening');
        startRecognition();
      } catch {
        setStatus('idle');
        setIsRecording(false);
      }
      return;
    }
    // Session active: toggle regardless of camera state (pause/resume)
    try {
      if (isRecording) {
        await stopMic();
        setIsRecording(false);
        stopRecognition();
      } else {
        await startMic({ onData: () => {} });
        setIsRecording(true);
        if (status === 'processing') setStatus('listening');
        startRecognition();
      }
    } catch {}
  }, [status, isRecording, startRecognition, stopRecognition]);

  const handleCancel = useCallback(async () => {
    await stopMic();
    setIsRecording(false);
    setStatus('idle');
    setIsCameraOn(false);
    stopRecognition();
  }, [stopRecognition]);

  const handleCameraClick = useCallback(() => {
    if (status === 'idle') return; // enable after session starts
    setIsCameraOn(v => {
      const next = !v;
      if (next) {
        // Camera turning ON → fade out orb briefly for a nicer transition
        setOrbHiding(true);
        window.setTimeout(() => setOrbHiding(false), 350);
      }
      return next;
    });
  }, [status]);

  const handleCameraFlip = useCallback(() => {
    setFacingMode(m => (m === 'user' ? 'environment' : 'user'));
  }, []);

  const handleFrame = useCallback((blob: Blob | null) => {
    if (!blob) { lastFrameRef.current = null; return; }
    const reader = new FileReader();
    reader.onload = () => { lastFrameRef.current = reader.result as string; };
    reader.readAsDataURL(blob);
  }, []);
  return (
    <div className="nov-live-layer relative w-full h-full min-h-[calc(100vh-0px)] overflow-hidden">
      {/* Starry background remains from parent */}
      {/* Back button (hidden when voice selector is open) */}
      <div className={`absolute top-6 left-6 z-50 ${isVoiceMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'} transition-opacity`}>
        <button
          onClick={() => onBack?.()}
          className="px-3 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/90 flex items-center gap-2 backdrop-blur"
        >
          <ChevronLeftIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Geri</span>
        </button>
      </div>

      {isCameraOn && (
        <>
          {/* Top stack: camera + prompt */}
          <div className={`absolute inset-x-0 top-14 md:top-16 z-30 flex flex-col items-center transition-opacity duration-200 ${isVoiceMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <div className="rounded-[1.25rem] overflow-hidden border border-white/10 bg-black/30 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out"
                 style={{ width: 'clamp(320px, 60vw, 560px)', aspectRatio: '16 / 9' }}>
              <CameraView onFrame={handleFrame} facingMode={facingMode} />
            </div>
            <div className="mt-3 md:mt-4 px-6 py-3 rounded-xl border border-white/10 bg-white/10 backdrop-blur-md text-white/90 text-sm md:text-base shadow-xl max-w-[min(85vw,560px)] text-center whitespace-pre-wrap break-words leading-relaxed select-none relative">
              {status === 'idle' && 'Başlamaq üçün mikrofona toxunun'}
              {status === 'connecting' && 'Bağlanır...'}
              {status === 'listening' && 'Dinləyir...'}
              {status === 'processing' && 'Emal edilir...'}
              {status === 'speaking' && 'Səsləndirir...'}
              {/* Corner accents for visual parity with camera-off */}
              <div className="pointer-events-none">
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 border-t-2 border-l-2 rounded-tl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 border-t-2 border-r-2 rounded-tr-sm border-cyan-400/70"></div>
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-l-2 rounded-bl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-r-2 rounded-br-sm border-cyan-400/70"></div>
              </div>
            </div>
          </div>

          {/* Bottom: Action buttons */}
          <div className={`absolute inset-x-0 bottom-10 md:bottom-14 z-40 flex items-center justify-center pointer-events-auto transition-opacity duration-200 ${isVoiceMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
            <ActionButtons
              status={status}
              isCameraOn={true}
              isSearchEnabled={isSearchEnabled}
              selectedVoice={selectedVoice}
              isMuted={!isRecording && status !== 'idle'}
              isRecording={isRecording}
              onMicClick={handleMicClick}
              onCameraClick={handleCameraClick}
              onCameraFlip={handleCameraFlip}
              onCancelClick={handleCancel}
              onVoiceChange={setSelectedVoice}
              onToggleSearch={() => setIsSearchEnabled(v => !v)}
              onVoiceMenuOpenChange={setIsVoiceMenuOpen}
              voiceMenuOpen={isVoiceMenuOpen}
              disableInlineVoiceSelector={true}
            />
          </div>
        </>
      )}

      {/* Camera OFF: center Orb + Controls + Prompt (stacked) */}
      {(!isCameraOn || orbHiding) && !isVoiceMenuOpen && (
        <div className={`absolute inset-0 z-20 flex flex-col items-center justify-center transition-all duration-300 ease-out pointer-events-none ${orbHiding ? 'opacity-0 scale-110' : 'opacity-100 scale-100'} translate-y-6 md:translate-y-12`}>
          <div className="relative" style={{ width: 'clamp(180px, 24vw, 270px)', height: 'clamp(180px, 24vw, 270px)' }}>
            <Orb status={status} isCameraOn={false} />
          </div>
          {/* Prompt bubble below mic */}
          <div className="mt-5">
            <div className={`relative ${isVoiceMenuOpen ? 'opacity-0 pointer-events-none' : ''}`}>
              <div className="px-6 py-3 rounded-xl border border-white/10 bg-white/10 backdrop-blur-md text-white/90 text-sm md:text-base shadow-xl max-w-[min(85vw,560px)] text-center whitespace-pre-wrap break-words leading-relaxed">
                {status === 'idle' && 'Başlamaq üçün mikrofona toxunun'}
                {status === 'connecting' && 'Bağlanır...'}
                {status === 'listening' && 'Dinləyir...'}
                {status === 'processing' && 'Emal edilir...'}
                {status === 'speaking' && 'Səsləndirir...'}
              </div>
              {/* Corner accents */}
              <div className="pointer-events-none">
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 border-t-2 border-l-2 rounded-tl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 border-t-2 border-r-2 rounded-tr-sm border-cyan-400/70"></div>
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-l-2 rounded-bl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-r-2 rounded-br-sm border-cyan-400/70"></div>
              </div>
            </div>
          </div>
          {/* Buttons at the bottom of the stack */}
          <div className={`mt-1 transition-opacity duration-200 ${isVoiceMenuOpen ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'}`}>
            <ActionButtons
              status={status}
              isCameraOn={false}
              isSearchEnabled={isSearchEnabled}
              selectedVoice={selectedVoice}
              isMuted={!isRecording && status !== 'idle'}
              isRecording={isRecording}
              onMicClick={handleMicClick}
              onCameraClick={handleCameraClick}
              onCameraFlip={handleCameraFlip}
              onCancelClick={handleCancel}
              onVoiceChange={setSelectedVoice}
              onToggleSearch={() => setIsSearchEnabled(v => !v)}
              onVoiceMenuOpenChange={setIsVoiceMenuOpen}
              voiceMenuOpen={isVoiceMenuOpen}
              disableInlineVoiceSelector={true}
            />
          </div>
        </div>
      )}

      {/* Voice Selector inline overlay in live view */}
      {isVoiceMenuOpen && (
        <VoiceSelector
          isOpen={true}
          voices={voices as any}
          selectedVoice={selectedVoice}
          onVoiceChange={(v) => { setSelectedVoice(v); setIsVoiceMenuOpen(false); }}
          onClose={() => setIsVoiceMenuOpen(false)}
          usePortal={false}
        />
      )}

      {/* No separate bottom controls while camera is ON */}
    </div>
  );
};

export default LiveConversationView;
