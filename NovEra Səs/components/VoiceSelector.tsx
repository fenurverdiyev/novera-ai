import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, StopIcon, XIcon } from './Icons';

interface Voice {
  id: string;
  name: string;
  gender: 'male' | 'female';
  description: string;
}

interface VoiceSelectorProps {
  isOpen: boolean;
  voices: Voice[];
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  onClose: () => void;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ isOpen, voices, selectedVoice, onVoiceChange, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const cachedKeysRef = useRef<Set<string>>(new Set());
  const [assetVer, setAssetVer] = useState<number>(0);
  const withVer = (p: string) => (assetVer ? `${p}?v=${assetVer}` : p);
  const [slideDir, setSlideDir] = useState<'next' | 'prev' | 'none'>('none');

  // Persona visual effects and theme helpers
  // We switch to a unified "smoke" effect; color differs by gender
  const getEffect = () => ({ effect: 'smoke', rotor: false, shine: false } as const);

  useEffect(() => {
    const index = voices.findIndex(v => v.id === selectedVoice);
    if (index !== -1) {
      setCurrentIndex(index);
    }
  }, [selectedVoice, voices]);

  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isOpen]);

  const go = (dir: -1 | 1) => {
    const len = voices.length;
    setSlideDir(dir === 1 ? 'next' : 'prev');
    setCurrentIndex((prev) => ((prev + (dir === 1 ? 1 : -1)) % len + len) % len);
  };
  const handleNext = () => go(1);
  const handlePrev = () => go(-1);

  // reset the small spin class after animation completes
  useEffect(() => {
    if (slideDir === 'none') return;
    const t = window.setTimeout(() => setSlideDir('none'), 380);
    return () => window.clearTimeout(t);
  }, [slideDir]);

  const handleSelect = () => {
    onVoiceChange(voices[currentIndex].id);
    onClose();
  };

  const handlePlayPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const v = voices[currentIndex];
      if (!v) return;
      const id = v.id;
      const baseLower = `/voices/${id.toLowerCase()}`;
      const baseUpper = `/voices/${id}`;
      // Prefer MP3 first as requested, then WAV
      const candidates = [withVer(`${baseLower}.mp3`), withVer(`${baseLower}.wav`), withVer(`${baseUpper}.mp3`), withVer(`${baseUpper}.wav`)];

      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;

      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
        return;
      }

      let found = false;
      for (const path of candidates) {
        try {
          if (audioCacheRef.current.has(path)) {
            audio.src = audioCacheRef.current.get(path)!;
            found = true;
            break;
          }
          const resp = await fetch(path, { cache: 'no-store' });
          const ct = (resp.headers.get('content-type') || '').toLowerCase();
          if (resp.ok && (ct.startsWith('audio/') || ct.includes('octet-stream'))) {
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            audioCacheRef.current.set(path, url);
            cachedKeysRef.current.add(path);
            audio.src = url;
            found = true;
            break;
          }
        } catch {}
      }

      if (found) {
        audio.currentTime = 0;
        audio.muted = false;
        audio.volume = 1.0;
        (audio as any).preservesPitch = false; (audio as any).mozPreservesPitch = false; (audio as any).webkitPreservesPitch = false;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
        setIsPlaying(true);
        return;
      }
    } catch {}

    // Fallback: browser TTS (no API usage)
    try {
      const text = 'Salam mən NovEra sizə necə kömək edə bilərəm.';
      const synth = window.speechSynthesis;
      const utter = new SpeechSynthesisUtterance(text);
      const az = synth.getVoices().find(v => /az|azer/i.test(v.lang));
      if (az) utter.voice = az;
      utter.rate = 1.0; utter.pitch = 1.0; utter.volume = 1.0;
      synth.cancel();
      synth.speak(utter);
    } catch (err) {
      console.warn('TTS fallback failed', err);
    }
  };

  // Prefetch audio on open for snappy previews
  useEffect(() => {
    if (!isOpen) return;
    setAssetVer(Date.now());
    let mounted = true;
    (async () => {
      for (const v of voices) {
        const base = `/voices/${v.id.toLowerCase()}`;
        for (const p of [withVer(`${base}.wav`), withVer(`${base}.mp3`)]) {
          if (audioCacheRef.current.has(p)) continue;
          try {
            const resp = await fetch(p, { cache: 'no-store' });
            const ct = (resp.headers.get('content-type') || '').toLowerCase();
            if (!mounted) return;
            if (resp.ok && (ct.startsWith('audio/') || ct.includes('octet-stream'))) {
              const blob = await resp.blob();
              const url = URL.createObjectURL(blob);
              audioCacheRef.current.set(p, url);
              cachedKeysRef.current.add(p);
              break;
            }
          } catch {}
        }
      }
    })();
    return () => { mounted = false; };
  }, [isOpen, voices]);

  // Clean up object URLs when unmounting
  useEffect(() => {
    return () => {
      for (const key of cachedKeysRef.current) {
        const url = audioCacheRef.current.get(key);
        if (url) try { URL.revokeObjectURL(url); } catch {}
      }
      cachedKeysRef.current.clear();
    };
  }, []);

  if (!isOpen) return null;

  const currentVoice = voices[currentIndex];
  const genderColor = currentVoice.gender === 'male' ? 'text-blue-400' : 'text-pink-400';
  const selected = currentVoice.id === selectedVoice;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 sm:p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/85 backdrop-blur-xl" />
      <div className="relative z-10 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Bağla" className="absolute -top-2 -right-2 sm:top-0 sm:right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <XIcon className="w-6 h-6 text-white" />
        </button>
        <div className="text-center mb-4">
          <div className="text-sm uppercase tracking-widest text-white/60 mb-1">Səs Seçimi</div>
          <h2 className={`text-3xl sm:text-4xl font-extrabold ${genderColor}`}>{currentVoice.name}</h2>
          <div className="text-white/60 mt-1">{currentIndex + 1} / {voices.length}</div>
        </div>

        <div className="relative flex items-center justify-center py-4">
          <button onClick={handlePrev} className="mr-3 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <ChevronLeftIcon className="w-7 h-7 text-white" />
          </button>

          <div className={`relative rounded-full overflow-hidden w-64 h-64 sm:w-80 sm:h-80 border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)] ${selected ? 'opacity-70' : ''} ${slideDir === 'next' ? 'switch-next' : ''} ${slideDir === 'prev' ? 'switch-prev' : ''}`}>
            {/* base glow */}
            <div className="absolute inset-0 rounded-full bg-white/10" />

            {/* unified smoke effect with gendered colors */}
            {(() => {
              const isFemale = currentVoice.gender === 'female';
              const c1 = isFemale ? 'rgba(236,72,153,0.48)' : 'rgba(59,130,246,0.48)';
              const c2 = isFemale ? 'rgba(168,85,247,0.36)' : 'rgba(56,189,248,0.36)';
              const styleVars = { '--c1': c1, '--c2': c2 } as React.CSSProperties as any;
              return (
                <>
                  <div className="absolute inset-0 rounded-full smoke smoke-a" style={styleVars} />
                  <div className="absolute inset-0 rounded-full smoke smoke-b" style={styleVars} />
                  <div className="absolute inset-0 rounded-full smoke smoke-c" style={styleVars} />
                  <div className="absolute inset-0 rounded-full smoke-swirl" />
                </>
              );
            })()}
          </div>

          <button onClick={handleNext} className="ml-3 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <ChevronRightIcon className="w-7 h-7 text-white" />
          </button>
        </div>

        <p className="text-center text-white/80 min-h-12 mb-5">{currentVoice.description}</p>

        <div className="flex justify-center items-center space-x-4">
          <button onClick={handlePlayPreview} className="relative px-7 py-3 rounded-full text-white font-semibold shadow-[0_10px_30px_rgba(34,211,238,0.25)] active:scale-95 transition-transform bg-cyan-500/70 hover:bg-cyan-500">
            <span className="inline-flex items-center">
              {isPlaying ? <StopIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
              Dinlə
            </span>
          </button>
          <button
            disabled={selected}
            onClick={() => { if (!selected) { onVoiceChange(currentVoice.id); onClose(); } }}
            className={`relative px-7 py-3 rounded-full text-white font-semibold active:scale-95 transition-transform shadow-[0_10px_30px_rgba(168,85,247,0.25)] ${selected ? 'bg-violet-600/50 opacity-60 cursor-default' : 'bg-violet-600/80 hover:bg-violet-600'}`}
          >
            {selected ? 'Seçildi' : 'Seç'}
          </button>
        </div>

        <audio ref={audioRef} className="hidden" preload="auto" />
      </div>

      {/* local styles for animations */}
      <style>{`
        @keyframes switchNext { 0% { transform: rotate(0deg) scale(1); } 40% { transform: rotate(10deg) scale(0.98); } 100% { transform: rotate(0deg) scale(1); } }
        @keyframes switchPrev { 0% { transform: rotate(0deg) scale(1); } 40% { transform: rotate(-10deg) scale(0.98); } 100% { transform: rotate(0deg) scale(1); } }
        .switch-next { animation: switchNext 360ms ease-out; }
        .switch-prev { animation: switchPrev 360ms ease-out; }
        @keyframes smokeDriftA { 0% { transform: translate(-5%, -5%) scale(1.0) rotate(0deg); } 50% { transform: translate(5%, 6%) scale(1.08) rotate(10deg); } 100% { transform: translate(-5%, -5%) scale(1.0) rotate(0deg); } }
        @keyframes smokeDriftB { 0% { transform: translate(5%, 4%) scale(1.0) rotate(0deg); } 50% { transform: translate(-4%, -6%) scale(1.10) rotate(-12deg); } 100% { transform: translate(5%, 4%) scale(1.0) rotate(0deg); } }
        @keyframes smokeDriftC { 0% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); } 50% { transform: translate(3%, -3%) scale(1.06) rotate(8deg); } 100% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); } }
        .smoke { filter: blur(12px); mix-blend-mode: screen; opacity: .98; }
        .smoke-a { background-image: radial-gradient(60% 45% at 25% 30%, var(--c1), transparent 60%), radial-gradient(55% 55% at 70% 65%, var(--c2), transparent 60%); background-size: 165% 165%, 165% 165%; animation: smokeDriftA 15s ease-in-out infinite alternate; }
        .smoke-b { background-image: radial-gradient(50% 50% at 75% 25%, var(--c1), transparent 60%), radial-gradient(65% 50% at 30% 80%, var(--c2), transparent 60%); background-size: 175% 175%, 175% 175%; animation: smokeDriftB 15s ease-in-out infinite alternate; opacity: .9; }
        .smoke-c { background-image: radial-gradient(45% 45% at 50% 50%, var(--c1), transparent 60%); background-size: 185% 185%; animation: smokeDriftC 15s ease-in-out infinite alternate; opacity: .78; }
        /* subtle swirl */
        @keyframes swirl { to { transform: rotate(360deg); } }
        .smoke-swirl { position: absolute; inset: -8%; border-radius: 9999px; background: conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.07) 30deg, transparent 60deg, rgba(255,255,255,.06) 120deg, transparent 170deg); filter: blur(10px); mix-blend-mode: screen; animation: swirl 15s linear infinite; }
      `}</style>
    </div>
  );
};
