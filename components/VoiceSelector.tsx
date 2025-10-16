import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon, StopIcon, XIcon } from "./LiveIcons";
import { ttsBinary } from "../services/ttsBackendService";
import { textToSpeech, AVAILABLE_VOICES } from "../services/elevenLabsService";
interface Voice {
  id: string;
  name: string;
  gender: "male" | "female";
  description: string;
}

interface VoiceSelectorProps {
  isOpen: boolean;
  voices: Voice[];
  selectedVoice: string;
  onVoiceChange: (voiceId: string) => void;
  onClose: () => void;
  usePortal?: boolean;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ isOpen, voices, selectedVoice, onVoiceChange, onClose, usePortal = true }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playError, setPlayError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const cachedKeysRef = useRef<Set<string>>(new Set());
  const [assetVer, setAssetVer] = useState<number>(0);
  const withVer = (p: string) => (assetVer ? `${p}?v=${assetVer}` : p);
  const [slideDir, setSlideDir] = useState<"next" | "prev" | "none">("none");
  const manifestRef = useRef<Record<string, string> | null>(null);

  const stripDiacritics = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ı/g, 'i').replace(/İ/g, 'I')
      .replace(/ə/g, 'e').replace(/Ə/g, 'E')
      .replace(/ö/g, 'o').replace(/Ö/g, 'O')
      .replace(/ü/g, 'u').replace(/Ü/g, 'U')
      .replace(/ç/g, 'c').replace(/Ç/g, 'C')
      .replace(/ş/g, 's').replace(/Ş/g, 'S')
      .replace(/ğ/g, 'g').replace(/Ğ/g, 'G');

  const preferredPreviewFor = (id: string): string | null => {
    const m = voiceCharacterMap[id as keyof typeof voiceCharacterMap];
    return m ? m.preview : null;
  };

  const localCandidatesFor = (id: string): string[] => {
    const list: string[] = [];
    // 0) explicit preferred preview for this voice
    const preferred = preferredPreviewFor(id);
    if (preferred) list.push(withVer(preferred));
    // 1) manifest mapping if any
    const mapped = manifestRef.current?.[id];
    if (mapped) list.push(withVer(`/voices/${mapped}`));
    // 2) generic fallbacks
    const idLower = id.toLowerCase();
    const ascii = stripDiacritics(id);
    const asciiLower = ascii.toLowerCase();
    const bases = [`/voices/${idLower}`, `/voices/${id}`, `/voices/${asciiLower}`, `/voices/${ascii}`];
    const exts = ['.mp3', '.wav'];
    for (const b of bases) for (const ext of exts) list.push(withVer(`${b}${ext}`));
    return list;
  };

  const getLocalOverride = (id: string): string | null => {
    try {
      return localStorage.getItem(`nov-voice-override-${id}`);
    } catch { return null; }
  };

  // NOTE: Upload removed per request

  // Obraz profilləri (browser TTS fallback üçün)
  const voiceProfile: Record<string, { pitch: number; rate: number }> = {
    Gacrux: { pitch: 0.85, rate: 0.95 },
    Fenrir: { pitch: 1.35, rate: 1.12 },
    Sulafat: { pitch: 1.05, rate: 1.0 },
    Zephyr: { pitch: 1.12, rate: 1.04 },
    Charon: { pitch: 0.95, rate: 1.0 },
    Puck: { pitch: 1.2, rate: 1.08 },
  };

  // Map internal voice IDs to ElevenLabs voice IDs for high-quality preview
  const elevenVoiceMap: Record<string, string> = {
    // male, mature
    Gacrux: 'ErXwobaYiN019PkySvjV', // Antoni
    // childlike/energetic male
    Fenrir: 'yoZ06aMxZJJ28mfd3POQ', // Sam
    // warm female
    Sulafat: 'TX3LPaxmHKxFdv7VOQHJ', // Bella
    // bright/cheerful female (alt Bella id for variety)
    Zephyr: 'EXAVITQu4vr4xnSDxMaL', // Bella alt
    // technical, neutral male
    Charon: 'pNInz6obpgDQGcFmaJgB', // Adam
    // upbeat male
    Puck: 'VR6AewLTigWG4xSOukaG', // Arnold
  };

  // Character ↔ Voice mapping and preferred preview mp3 per voice
  const voiceCharacterMap: Record<string, { character: string; preview: string }> = {
    Gacrux: { character: 'Kamran', preview: '/voices/gacrux.wav' },
    Fenrir: { character: 'Səlim',  preview: '/voices/fenrir.wav' },
    Sulafat:{ character: 'Arzu',   preview: '/voices/sulafat.wav' },
    Zephyr: { character: 'Leyla',  preview: '/voices/zephyr.wav' },
    Charon: { character: 'İlkin',  preview: '/voices/charon.wav' },
    Puck:   { character: 'Fərid',  preview: '/voices/puck.wav' },
  };

  const previewText = "Salam mən NovEra sizə necə kömək edə bilərəm.";

  useEffect(() => {
    const index = voices.findIndex((v) => v.id === selectedVoice);
    if (index !== -1) setCurrentIndex(index);
  }, [selectedVoice, voices]);

  useEffect(() => {
    if (!isOpen && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [isOpen]);

  const go = (dir: -1 | 1) => {
    const len = voices.length;
    setSlideDir(dir === 1 ? "next" : "prev");
    setCurrentIndex((prev) => ((prev + (dir === 1 ? 1 : -1)) % len + len) % len);
  };
  const handleNext = () => go(1);
  const handlePrev = () => go(-1);

  useEffect(() => {
    if (slideDir === "none") return;
    const t = window.setTimeout(() => setSlideDir("none"), 380);
    return () => window.clearTimeout(t);
  }, [slideDir]);

  // Dinlə önizləmə
  const handlePlayPreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPlayError(null);

    if (isPlaying) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      try {
        audioRef.current?.pause();
      } catch {}
      setIsPlaying(false);
      return;
    }

    const v = voices[currentIndex];
    if (!v) return;
    const id = v.id;
    const text = previewText;

    // 0) Local override from browser storage (uploaded by user)
    try {
      const override = getLocalOverride(id);
      if (override) {
        if (!audioRef.current) audioRef.current = new Audio();
        const audio = audioRef.current;
        audio.src = override;
        audio.onended = () => setIsPlaying(false);
        await audio.play();
        setIsPlaying(true);
        return;
      }
    } catch {}

    // 1) Lokal nümunələr (manifest.json və ya auto-adlandırma)
    try {
      const candidates = localCandidatesFor(id);
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      for (const path of candidates) {
        try {
          if (audioCacheRef.current.has(path)) {
            audio.src = audioCacheRef.current.get(path)!;
            audio.onended = () => setIsPlaying(false);
            await audio.play();
            setIsPlaying(true);
            return;
          }
          const resp = await fetch(path, { cache: "no-store" });
          const ct = (resp.headers.get("content-type") || "").toLowerCase();
          if (resp.ok && (ct.startsWith("audio/") || ct.includes("octet-stream"))) {
            const blob = await resp.blob();
            const url2 = URL.createObjectURL(blob);
            audioCacheRef.current.set(path, url2);
            cachedKeysRef.current.add(path);
            audio.src = url2;
            audio.onended = () => setIsPlaying(false);
            await audio.play();
            setIsPlaying(true);
            return;
          }
        } catch {}
      }
    } catch {}

    // 2) ElevenLabs TTS (client-side, requires VITE_ELEVENLABS_API_KEY)
    try {
      const elevenId = elevenVoiceMap[id] || AVAILABLE_VOICES[0]?.id;
      if (elevenId) {
        const url = await textToSpeech(text, elevenId);
        if (url) {
          if (!audioRef.current) audioRef.current = new Audio();
          const audio = audioRef.current;
          audio.src = url;
          audio.onended = () => setIsPlaying(false);
          await audio.play();
          setIsPlaying(true);
          return;
        }
      }
    } catch {}

    // 3) Backend TTS fallback (FastAPI)
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      const audio = audioRef.current;
      const url = await ttsBinary(text, { voiceId: id });
      audio.src = url;
      audio.onended = () => setIsPlaying(false);
      await audio.play();
      setIsPlaying(true);
      return;
    } catch (err) {
      console.warn('Preview audio not available', err);
      setPlayError('Səs nümunəsi tapılmadı. Zəhmət olmasa mp3 fayllarını /public/voices/ qovluğuna yerləşdirin (kamran.mp3, salim.mp3, arzu.mp3, leyla.mp3, ilkin.mp3, ferid.mp3).');
      setIsPlaying(false);
    }
  };

  // Açıq olanda lokal nümunələri prefetch et
  useEffect(() => {
    if (!isOpen) return;
    setAssetVer(Date.now());
    let mounted = true;
    // Manifest yüklə (opsional)
    (async () => {
      try {
        const resp = await fetch('/voices/manifest.json', { cache: 'no-store' });
        if (resp.ok) {
          const m = await resp.json();
          manifestRef.current = m || null;
        }
      } catch {}
    })();
    (async () => {
      for (const v of voices) {
        const list = localCandidatesFor(v.id);
        for (const p of list) {
          if (audioCacheRef.current.has(p)) continue;
          try {
            const resp = await fetch(p, { cache: "no-store" });
            const ct = (resp.headers.get("content-type") || "").toLowerCase();
            if (!mounted) return;
            if (resp.ok && (ct.startsWith("audio/") || ct.includes("octet-stream"))) {
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

  // Body scroll kilidi və görünüş
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.classList.add("nov-voice-open");
    return () => {
      document.documentElement.style.overflow = prev;
      document.body.classList.remove("nov-voice-open");
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Portal root (only when usePortal)
  let portalRoot: HTMLElement | null = null;
  if (usePortal) {
    portalRoot = document.getElementById("nov-voice-portal") as HTMLElement | null;
    if (!portalRoot) {
      portalRoot = document.createElement("div");
      portalRoot.id = "nov-voice-portal";
      document.body.appendChild(portalRoot);
    }
  }

  const currentVoice = voices[currentIndex];
  const genderColor = currentVoice.gender === "male" ? "text-blue-400" : "text-pink-400";
  const selected = currentVoice.id === selectedVoice;

    const overlayClass = usePortal ? 'fixed inset-0 z-[2000]' : 'absolute inset-0 z-[600]';
    const overlayBg = usePortal ? 'bg-black/60 backdrop-blur-md' : 'bg-transparent backdrop-blur-0';
    const content = (
    <div className={`${overlayClass} ${overlayBg} flex flex-col items-center justify-center p-4 sm:p-8`}
    >
      <div className="relative z-10 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div role="dialog" aria-modal="true" className="relative">
          <button onClick={onClose} aria-label="Bağla" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
            <XIcon className="w-6 h-6 text-white" />
          </button>
          <div className="p-5 sm:p-8">
            <div className="text-center mb-4">
              <div className="text-sm uppercase tracking-widest text-white/60 mb-1">Səs Seçimi</div>
              <h2 className={`text-3xl sm:text-4xl font-extrabold ${genderColor}`}>{currentVoice.name}</h2>
              <div className="text-white/60 mt-1">{currentIndex + 1} / {voices.length}</div>
            </div>

            <div className="relative flex items-center justify-center py-4">
              <button onClick={handlePrev} className="mr-3 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                <ChevronLeftIcon className="w-7 h-7 text-white" />
              </button>

              <div className={`relative rounded-full overflow-hidden w-64 h-64 sm:w-80 sm:h-80 ${selected ? "opacity-70" : ""} ${slideDir === "next" ? "switch-next" : ""} ${slideDir === "prev" ? "switch-prev" : ""}`}>
                <div className="absolute inset-0 rounded-full bg-transparent" />
                {(() => {
                  const isFemale = currentVoice.gender === "female";
                  const c1 = isFemale ? "rgba(236,72,153,0.48)" : "rgba(59,130,246,0.48)";
                  const c2 = isFemale ? "rgba(168,85,247,0.36)" : "rgba(56,189,248,0.36)";
                  const styleVars = { "--c1": c1, "--c2": c2 } as React.CSSProperties as any;
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

            <p className="text-center text-white/80 min-h-12 mb-6">{currentVoice.description}</p>

            <div className="flex justify-center items-center space-x-4">
              <button onClick={handlePlayPreview} className="relative px-7 py-3 rounded-full text-white font-semibold shadow-[0_10px_30px_rgba(34,211,238,0.25)] active:scale-95 transition-transform bg-cyan-500/70 hover:bg-cyan-500">
                <span className="inline-flex items-center">
                  {isPlaying ? <StopIcon className="w-5 h-5 mr-2" /> : <PlayIcon className="w-5 h-5 mr-2" />}
                  Dinlə
                </span>
              </button>
              <button disabled={selected} onClick={() => { if (!selected) { onVoiceChange(currentVoice.id); onClose(); } }} className={`relative px-7 py-3 rounded-full text-white font-semibold active:scale-95 transition-transform shadow-[0_10px_30px_rgba(168,85,247,0.25)] ${selected ? "bg-violet-600/50 opacity-60 cursor-default" : "bg-violet-600/80 hover:bg-violet-600"}`}>
                {selected ? "Seçildi" : "Seç"}
              </button>
            </div>

            {playError && <div className="mt-3 text-sm text-red-400 text-center">{playError}</div>}
            <audio ref={audioRef} className="hidden" preload="auto" />
          </div>
        </div>

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
          @keyframes swirl { to { transform: rotate(360deg); } }
          .smoke-swirl { position: absolute; inset: -8%; border-radius: 9999px; background: conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,.07) 30deg, transparent 60deg, rgba(255,255,255,.06) 120deg, transparent 170deg); filter: blur(10px); mix-blend-mode: screen; animation: swirl 15s linear infinite; }
        `}</style>
      </div>
    </div>
  );
  return usePortal && portalRoot ? createPortal(content, portalRoot) : content;
};

