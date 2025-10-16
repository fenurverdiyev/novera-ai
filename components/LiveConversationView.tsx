import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon } from './LiveIcons';
import { Orb } from './Orb';
import { ActionButtons, LiveStatus } from './ActionButtons';
import { VoiceSelector } from './VoiceSelector';
import { CameraView } from './CameraView';
import { onPcmData, startMic, stopMic, getSampleRate } from '../services/liveConversationService';
import { connectGeminiLive, bufferPcmFrame, disconnectGeminiLive, onGeminiLiveAudio, sendAudioStreamEnd } from '../services/geminiLiveService';

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
  const silenceTimerRef = useRef<number | null>(null);
  const noResultTimerRef = useRef<number | null>(null);
  const lastResultAtRef = useRef<number>(0);
  const useGeminiLiveRef = useRef<boolean>(false);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const silenceSinceRef = useRef<number | null>(null);
  const sentEndForThisTurnRef = useRef<boolean>(false);
  const langCandidatesRef = useRef<string[]>(['az-AZ', 'tr-TR', 'en-US']);
  const langIndexRef = useRef<number>(0);
  const fallbackAttemptsRef = useRef<number>(0);
  const shouldBeListeningRef = useRef<boolean>(false);
  const [liveText, setLiveText] = useState('');
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
      if (useGeminiLiveRef.current) {
        try { bufferPcmFrame(pcm, getSampleRate()); } catch {}
        // Simple silence detection to auto-end turn
        try {
          let sum = 0;
          for (let i = 0; i < pcm.length; i++) { const s = pcm[i]; sum += s * s; }
          const rms = Math.sqrt(sum / (pcm.length || 1));
          const now = Date.now();
          const speaking = rms > 0.02; // threshold
          if (speaking) {
            silenceSinceRef.current = null;
            sentEndForThisTurnRef.current = false;
          } else {
            if (silenceSinceRef.current == null) {
              silenceSinceRef.current = now;
            } else if (!sentEndForThisTurnRef.current && (now - silenceSinceRef.current) > 1200) {
              // End of user speech detected -> mark end of stream to prompt model response
              try { sendAudioStreamEnd(); } catch {}
              setStatus('processing');
              sentEndForThisTurnRef.current = true;
            }
          }
        } catch {}
      }
    };
    onPcmData(sub);
    return () => onPcmData(null);
  }, []);


  const switchLangAndRestart = useCallback(() => {
    // Try next language in the list to improve recognition
    langIndexRef.current = (langIndexRef.current + 1) % langCandidatesRef.current.length;
    fallbackAttemptsRef.current += 1;
    if (fallbackAttemptsRef.current > 3) return; // avoid endless loops
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
    startRecognition();
  }, []);

  const startRecognition = useCallback(() => {
    // Skip browser SpeechRecognition when Gemini Live is active
    if (useGeminiLiveRef.current) return;
    try {
      const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) {
        console.warn('SpeechRecognition not supported');
        try { stopMic(); } catch {}
        shouldBeListeningRef.current = false;
        setIsRecording(false);
        setStatus('idle');
        setLiveText('Səs tanıma dəstəklənmir. Chrome/Edge istifadə edin və ya Live backend-i aktiv edin.');
        return;
      }
      // If a previous instance exists, stop it first
      try { recognitionRef.current?.stop?.(); } catch {}
      const rec = new SR();
      // Prefer az-AZ; fallback to tr-TR, en-US
      const initialLang = langCandidatesRef.current[langIndexRef.current] || 'tr-TR';
      rec.lang = initialLang;
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      shouldBeListeningRef.current = true;
      let finalText = '';
      rec.onstart = () => {
        // When the recognizer actually starts
        setStatus((s) => (s === 'connecting' ? 'listening' : s));
        lastResultAtRef.current = Date.now();
        if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
        // If no results for 3.5s, try next language
        noResultTimerRef.current = window.setTimeout(() => {
          if (!shouldBeListeningRef.current) return;
          const elapsed = Date.now() - lastResultAtRef.current;
          if (elapsed >= 3500) {
            switchLangAndRestart();
          }
        }, 3600);
      };
      rec.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finalText += res[0].transcript; else interim += res[0].transcript;
        }
        lastResultAtRef.current = Date.now();
        setLiveText((finalText + ' ' + interim).trim());
        // reset 1s silence timer
        if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        silenceTimerRef.current = window.setTimeout(async () => {
          const q = (finalText + ' ' + interim).trim();
          if (q) {
            setStatus('processing');
            try { await stopMic(); } catch {}
            setIsRecording(false);
            // Prevent auto-restart before stopping
            shouldBeListeningRef.current = false;
            try { rec.stop(); } catch {}
            recognitionRef.current = null;
            const imgs = lastFrameRef.current ? [lastFrameRef.current] : undefined;
            if (!useGeminiLiveRef.current) {
              onQuery?.(q, imgs);
            }
            setLiveText('');
          }
        }, 1500);
      };
      rec.onerror = (ev: any) => {
        // Known transient errors: 'no-speech', 'audio-capture', 'network'
        const err = ev?.error || 'unknown';
        // On no-speech or audio-capture, try fallback language quickly
        if (err === 'no-speech' || err === 'audio-capture') {
          switchLangAndRestart();
          return;
        }
        // If still supposed to listen, try to restart after a brief delay
        if (shouldBeListeningRef.current) {
          try { window.setTimeout(() => { try { rec.start(); } catch {} }, 250); } catch {}
          return;
        }
        // Otherwise stop
        try { rec.stop(); } catch {}
        recognitionRef.current = null;
      };
      rec.onend = () => {
        // Chrome may end recognition periodically; auto-restart if we are still listening
        if (shouldBeListeningRef.current) {
          try { rec.start(); return; } catch {}
        }
        // If not listening anymore, ensure timer cleared
        if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
      };
      recognitionRef.current = rec;
      rec.start();
    } catch {}
  }, [onQuery, switchLangAndRestart]);

  const stopRecognition = useCallback(() => {
    shouldBeListeningRef.current = false;
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
  }, []);

  const handleMicClick = useCallback(async () => {
    if (status === 'idle') {
      setStatus('connecting');
      try {
        // Start mic without overriding any subscriber (we only need permission and active context)
        await startMic();
        // Try Gemini Live connect
        const ok = await connectGeminiLive({ onAudio: (url) => {
          try {
            if (!liveAudioRef.current) liveAudioRef.current = new Audio();
            const el = liveAudioRef.current!;
            el.src = url;
            el.onended = () => { setStatus((s) => s === 'speaking' ? 'idle' : s); };
            setStatus('speaking');
            void el.play();
          } catch {}
        }});
        if (ok) {
          useGeminiLiveRef.current = true;
          setIsRecording(true);
          setStatus('listening');
          shouldBeListeningRef.current = true;
          // No SpeechRecognition when Live active
        } else {
          // Fallback to SpeechRecognition pipeline
          useGeminiLiveRef.current = false;
          setIsRecording(true);
          setStatus('listening');
          shouldBeListeningRef.current = true;
          startRecognition();
        }
      } catch {
        // Fallback: Even if mic graph fails (e.g., insecure context for worklets), try SpeechRecognition
        useGeminiLiveRef.current = false;
        setIsRecording(true);
        setStatus('listening');
        shouldBeListeningRef.current = true;
        startRecognition();
      }
      return;
    }
    // Session active: toggle regardless of camera state (pause/resume)
    try {
      if (isRecording) {
        await stopMic();
        setIsRecording(false);
        stopRecognition();
        // Explicitly close current audio stream for Live turn
        if (useGeminiLiveRef.current) { try { sendAudioStreamEnd(); } catch {} }
        if (useGeminiLiveRef.current) { try { await disconnectGeminiLive(); } catch {} useGeminiLiveRef.current = false; }
        setLiveText('');
      } else {
        await startMic({ onData: () => {} });
        setIsRecording(true);
        if (status === 'processing') setStatus('listening');
        shouldBeListeningRef.current = true;
        // Try reconnect Live if previously used
        const ok = await connectGeminiLive({ onAudio: (url) => {
          try {
            if (!liveAudioRef.current) liveAudioRef.current = new Audio();
            const el = liveAudioRef.current!;
            el.src = url;
            el.onended = () => { setStatus((s) => s === 'speaking' ? 'idle' : s); };
            setStatus('speaking');
            void el.play();
          } catch {}
        }});
        if (ok) {
          useGeminiLiveRef.current = true;
        } else {
          useGeminiLiveRef.current = false;
          startRecognition();
        }
      }
    } catch {}
  }, [status, isRecording, startRecognition, stopRecognition]);

  const handleCancel = useCallback(async () => {
    await stopMic();
    setIsRecording(false);
    setStatus('idle');
    setIsCameraOn(false);
    stopRecognition();
    if (useGeminiLiveRef.current) { try { await disconnectGeminiLive(); } catch {} useGeminiLiveRef.current = false; }
    setLiveText('');
  }, [stopRecognition]);

  // Ensure proper cleanup if component unmounts while listening
  useEffect(() => {
    return () => {
      try { stopMic(); } catch {}
      stopRecognition();
      if (useGeminiLiveRef.current) { try { disconnectGeminiLive(); } catch {} useGeminiLiveRef.current = false; }
      if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
    };
  }, [stopRecognition]);

  // Sync live status updates (processing/speaking/listening/idle) from App TTS pipeline
  useEffect(() => {
    const handler = (e: any) => {
      const s = e?.detail as LiveStatus | undefined;
      if (!s) return;
      setStatus(prev => {
        // Do not override listening state while user is speaking
        if (prev === 'listening' && (s === 'processing' || s === 'speaking')) return s;
        if (s === 'idle') return prev === 'processing' || prev === 'speaking' ? 'idle' : prev;
        return s;
      });
    };
    window.addEventListener('nov-era-live-status' as any, handler as any);
    return () => window.removeEventListener('nov-era-live-status' as any, handler as any);
  }, []);

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
              {status === 'listening' && liveText ? liveText : (
                status === 'idle' ? 'Başlamaq üçün mikrofona toxunun' :
                status === 'connecting' ? 'Bağlanır...' :
                status === 'processing' ? 'Emal edilir...' :
                status === 'speaking' ? 'Səsləndirir...' : 'Dinləyir...'
              )}
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
                {status === 'listening' && liveText ? liveText : (
                  status === 'idle' ? 'Başlamaq üçün mikrofona toxunun' :
                  status === 'connecting' ? 'Bağlanır...' :
                  status === 'processing' ? 'Emal edilir...' :
                  status === 'speaking' ? 'Səsləndirir...' : 'Dinləyir...')}
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
          onVoiceChange={(v) => { setSelectedVoice(v); setIsVoiceMenuOpen(false); try { const raw = localStorage.getItem('gemini-insight-settings'); const s = raw ? JSON.parse(raw) : {}; const next = { ...s, voiceId: v, voiceEnabled: true }; localStorage.setItem('gemini-insight-settings', JSON.stringify(next)); window.dispatchEvent(new CustomEvent('nov-era-voice-change', { detail: v })); } catch {} }}
          onClose={() => setIsVoiceMenuOpen(false)}
          usePortal={false}
        />
      )}

      {/* No separate bottom controls while camera is ON */}
    </div>
  );
};

export default LiveConversationView;
