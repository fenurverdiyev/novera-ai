import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PlaceResult, ShoppingProduct, NewsArticle } from '../types';
import { ChevronLeftIcon } from './LiveIcons';
import { Orb } from './Orb';
import { ActionButtons, LiveStatus } from './ActionButtons';
import { VoiceSelector } from './VoiceSelector';
import { CameraView } from './CameraView';
import { onPcmData, startMic, stopMic, getSampleRate, initAudioWorklets } from '../services/liveConversationService';
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
  const framesBufferRef = useRef<string[]>([]);
  const [orbHiding, setOrbHiding] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const [liveImages, setLiveImages] = useState<string[]>([]);
  const [liveVideos, setLiveVideos] = useState<string[]>([]);
  const [livePlaces, setLivePlaces] = useState<PlaceResult[]>([]);
  const [liveProducts, setLiveProducts] = useState<ShoppingProduct[]>([]);
  const [liveNews, setLiveNews] = useState<NewsArticle[]>([]);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const noResultTimerRef = useRef<number | null>(null);
  const lastResultAtRef = useRef<number>(0);
  const useGeminiLiveRef = useRef<boolean>(false);
  const liveAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastAudioUrlRef = useRef<string | null>(null);
  const silenceSinceRef = useRef<number | null>(null);
  const sentEndForThisTurnRef = useRef<boolean>(false);
  const langCandidatesRef = useRef<string[]>(['az-AZ']);
  const langIndexRef = useRef<number>(0);
  const fallbackAttemptsRef = useRef<number>(0);
  const shouldBeListeningRef = useRef<boolean>(false);
  const lastHeardTextRef = useRef<string>('');
  const [liveText, setLiveText] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [renderedAnswer, setRenderedAnswer] = useState('');
  const [typedMessage, setTypedMessage] = useState('');
  const [isSendingText, setIsSendingText] = useState(false);
  const writerTimerRef = useRef<number | null>(null);
  const queueRef = useRef<string>('');
  const preCtxRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const continuousModeRef = useRef<boolean>(true);
  const isMutedRef = useRef<boolean>(false);
  const lastMicClickAtRef = useRef<number>(0);
  const postSpeakTimerRef = useRef<number | null>(null);
  const postSpeakGuardMsRef = useRef<number>(450);

  const dedupeSentences = useCallback((s: string): string => {
    try {
      let n = (s || '').replace(/\s+/g, ' ').trim();
      if (!n) return '';
      // Collapse immediate word repeats (e.g., salam salam salam)
      n = n.replace(/\b(\w+)(\s+\1\b)+/gi, '$1');
      const parts = n.split(/(?<=[\.!?…])\s+/);
      const seen = new Set<string>();
      const out: string[] = [];
      for (const p of parts) {
        const k = p.trim().toLowerCase();
        if (!k) continue;
        if (!seen.has(k)) { seen.add(k); out.push(p.trim()); }
      }
      // Fallback: if dedupe removed everything, return original
      const joined = out.join(' ');
      return joined || n;
    } catch { return (s || '').trim(); }
  }, []);

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
        // Only accept mic while actively listening; block during speaking/processing/idle
        if (status !== 'listening') return;
        try { bufferPcmFrame(pcm, getSampleRate()); } catch {}
        // Simple silence detection to auto-end turn (tuned for softer Azerbaijani phonemes)
        try {
          let sum = 0;
          for (let i = 0; i < pcm.length; i++) { const s = pcm[i]; sum += s * s; }
          const rms = Math.sqrt(sum / (pcm.length || 1));
          const now = Date.now();
          const speaking = rms > 0.012; // slightly lower threshold
          if (speaking) {
            silenceSinceRef.current = null;
            sentEndForThisTurnRef.current = false;
          } else {
            if (silenceSinceRef.current == null) {
              silenceSinceRef.current = now;
            } else if (!sentEndForThisTurnRef.current && (now - silenceSinceRef.current) > 1000) {
              // End of user speech detected -> mark end of stream to prompt model response
              try { sendAudioStreamEnd(); } catch {}
              setStatus('processing');
              sentEndForThisTurnRef.current = true;
              try { stopMic(); } catch {}
              try { setIsRecording(false); } catch {}
            }
          }
        } catch {}
      }
    };
    onPcmData(sub);
    return () => onPcmData(null);
  }, [status]);

  useEffect(() => {
    const onModelText = (e: any) => {
      // Accept updates only while model is generating (processing/speaking). Ignore during listening so user speech shows.
      if (!(status === 'processing' || status === 'speaking')) return;
      const t = (e?.detail || '').toString();
      const cleaned = dedupeSentences(t);
      setAnswerText(cleaned);
    };
    window.addEventListener('nov-era-live-text' as any, onModelText as any);
    return () => window.removeEventListener('nov-era-live-text' as any, onModelText as any);
  }, [status, dedupeSentences]);

  useEffect(() => {
    const onContent = (e: any) => {
      const d = e?.detail || {};
      if (d.images && d.images.length) setLiveImages(prev => Array.from(new Set([...(prev || []), ...d.images])));
      if (d.videos && d.videos.length) setLiveVideos(prev => Array.from(new Set([...(prev || []), ...d.videos])));
      if (d.places && d.places.length) setLivePlaces(d.places);
      if (d.products && d.products.length) setLiveProducts(d.products);
      if (d.news && d.news.length) setLiveNews(d.news);
    };
    window.addEventListener('nov-era-live-content' as any, onContent as any);
    return () => window.removeEventListener('nov-era-live-content' as any, onContent as any);
  }, []);

  // Preload worklets to speed up first mic attach
  useEffect(() => {
    let mounted = true;
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      preCtxRef.current = ctx;
      initAudioWorklets(ctx).catch(() => {});
    } catch {}
    return () => { mounted = false; };
  }, []);

  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => {
    if (renderedAnswer.length > answerText.length) {
      setRenderedAnswer(answerText);
      queueRef.current = '';
      writerTimerRef.current && window.clearTimeout(writerTimerRef.current);
      writerTimerRef.current = null;
      return;
    }
    const extra = answerText.slice(renderedAnswer.length);
    if (!extra) return;
    queueRef.current += extra;
    const tick = () => {
      const q = queueRef.current;
      if (!q.length) { writerTimerRef.current = null; return; }
      const ch = q.slice(0,1);
      queueRef.current = q.slice(1);
      setRenderedAnswer(prev => prev + ch);
      const d = ch === '.' ? 55 : ch === ',' ? 42 : (ch === ' ' ? 10 : 18);
      writerTimerRef.current = window.setTimeout(tick, d);
    };
    if (!writerTimerRef.current) writerTimerRef.current = window.setTimeout(tick, 18);
    return () => { /* no-op */ };
  }, [answerText, renderedAnswer]);

  const switchLangAndRestart = useCallback(() => {
    // Try next language in the list to improve recognition
    langIndexRef.current = (langIndexRef.current + 1) % langCandidatesRef.current.length;
    fallbackAttemptsRef.current += 1;
    if (fallbackAttemptsRef.current > 3) return; // avoid endless loops
    try { recognitionRef.current?.stop?.(); } catch {}
    recognitionRef.current = null;
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
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
      rec.maxAlternatives = 3;
      shouldBeListeningRef.current = true;
      let finalText = '';
      rec.onstart = () => {
        // When the recognizer actually starts
        setStatus((s) => (s === 'connecting' ? 'listening' : s));
        setLiveText('');
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
          // Choose best alternative by confidence when available
          let best = res[0];
          try {
            for (let j = 1; j < res.length; j++) {
              const alt = res[j];
              if ((alt?.confidence || 0) > (best?.confidence || 0)) best = alt;
            }
          } catch {}
          if (res.isFinal) finalText += best.transcript; else interim += best.transcript;
        }
        lastResultAtRef.current = Date.now();
        const combined = (finalText + ' ' + interim).trim();
        lastHeardTextRef.current = combined;
        setLiveText(combined);
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
            // Send last up to 3 frames to improve visual grounding
            const imgs = framesBufferRef.current.length ? [...framesBufferRef.current] : (lastFrameRef.current ? [lastFrameRef.current] : undefined);
            if (!useGeminiLiveRef.current) {
              onQuery?.(q, imgs);
            }
            setLiveText('');
          }
        }, 500);
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

  const autoResumeListening = useCallback(async () => {
    if (!continuousModeRef.current || isRecordingRef.current || isMutedRef.current) return;
    setIsRecording(true);
    // Clear previous AI answer so live user speech appears again
    setAnswerText('');
    setRenderedAnswer('');
    setLiveText('');
    lastHeardTextRef.current = '';
    setStatus('listening');
    shouldBeListeningRef.current = true;
    // Reset silence tracking
    if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
    silenceSinceRef.current = null;
    lastResultAtRef.current = Date.now();
    sentEndForThisTurnRef.current = false;
    if (!useGeminiLiveRef.current) startRecognition();
  }, [startRecognition]);

  const handleMicClick = useCallback(async () => {
    try { window.dispatchEvent(new Event('nov-era-audio-unlock' as any)); } catch {}
    // Fast double-tap to cancel everything
    const now = Date.now();
    if (now - lastMicClickAtRef.current < 400) {
      await handleCancel();
      lastMicClickAtRef.current = 0;
      return;
    }
    lastMicClickAtRef.current = now;

    // If model is processing or speaking, treat click as cancel (stop session)
    if (status === 'idle') {
      try { setLiveImages([]); setLiveVideos([]); setLivePlaces([]); setLiveProducts([]); setLiveNews([]); } catch {}
      setStatus('connecting');
      setAnswerText('');
      setRenderedAnswer('');
      try {
        // Strict voice: SR-only for UI text; App handles TTS; no mic graph needed
        useGeminiLiveRef.current = false;
        setIsRecording(true);
        setStatus('listening');
        shouldBeListeningRef.current = true;
        startRecognition();
      } catch {
        // Fallback: try SpeechRecognition
        useGeminiLiveRef.current = false;
        setIsRecording(true);
        setStatus('listening');
        shouldBeListeningRef.current = true;
        startRecognition();
      }
      return;
    }
    // Session active: single click = mute/unmute (yellow when muted)
    try {
      if (isRecording) {
        // MUTE (yellow): send current question and stop recognition, keep session active
        const q = (lastHeardTextRef.current || liveText || '').trim();
        if (silenceTimerRef.current) { window.clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
        if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
        if (q) {
          const imgs = lastFrameRef.current ? [lastFrameRef.current] : undefined;
          try { onQuery?.(q, imgs); } catch {}
        }
        isMutedRef.current = true;
        continuousModeRef.current = false; // do not auto-resume while muted
        setIsRecording(false);
        stopRecognition();
        shouldBeListeningRef.current = false;
        setLiveText('');
        setStatus('processing');
      } else {
        // UNMUTE (red): start recognition only
        isMutedRef.current = false;
        continuousModeRef.current = true;
        setIsRecording(true);
        setStatus('listening');
        setAnswerText('');
        setRenderedAnswer('');
        shouldBeListeningRef.current = true;
        useGeminiLiveRef.current = false; // keep Live audio disabled for strict voice
        startRecognition();
      }
    } catch {}
  }, [status, isRecording, startRecognition, stopRecognition, liveText, onQuery]);

  const handleCancel = useCallback(async () => {
    await stopMic();
    setIsRecording(false);
    setStatus('idle');
    setIsCameraOn(false);
    try { setLiveImages([]); setLiveVideos([]); setLivePlaces([]); setLiveProducts([]); setLiveNews([]); } catch {}
    stopRecognition();
    isMutedRef.current = false;
    continuousModeRef.current = true;
    if (useGeminiLiveRef.current) { try { await disconnectGeminiLive(); } catch {} useGeminiLiveRef.current = false; }
    setLiveText('');
    setAnswerText('');
    setRenderedAnswer('');
  }, [stopRecognition]);

  // Ensure proper cleanup if component unmounts while listening
  useEffect(() => {
    return () => {
      try { stopMic(); } catch {}
      stopRecognition();
      if (postSpeakTimerRef.current) { window.clearTimeout(postSpeakTimerRef.current); postSpeakTimerRef.current = null; }
      if (useGeminiLiveRef.current) { try { disconnectGeminiLive(); } catch {} useGeminiLiveRef.current = false; }
      if (noResultTimerRef.current) { window.clearTimeout(noResultTimerRef.current); noResultTimerRef.current = null; }
      try { if (lastAudioUrlRef.current && lastAudioUrlRef.current.startsWith('blob:')) URL.revokeObjectURL(lastAudioUrlRef.current); } catch {}
      try {
        if (liveAudioRef.current) {
          try { liveAudioRef.current.pause(); } catch {}
          try { document.body.removeChild(liveAudioRef.current); } catch {}
        }
      } catch {}
      liveAudioRef.current = null;
      lastAudioUrlRef.current = null;
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
      // If App TTS pipeline signals 'idle' (end of speaking), auto-resume mic in continuous mode
      if (s === 'idle') {
        try {
          if (postSpeakTimerRef.current) { window.clearTimeout(postSpeakTimerRef.current); postSpeakTimerRef.current = null; }
          postSpeakTimerRef.current = window.setTimeout(() => { autoResumeListening(); }, postSpeakGuardMsRef.current);
        } catch {}
      }
      // While AI is speaking, pause recognition to avoid picking up AI voice as user input
      if (s === 'speaking') {
        try { stopRecognition(); } catch {}
        // Keep ring state unchanged; do not toggle mute UI automatically
        shouldBeListeningRef.current = false;
      }
    };
    window.addEventListener('nov-era-live-status' as any, handler as any);
    return () => window.removeEventListener('nov-era-live-status' as any, handler as any);
  }, [autoResumeListening, stopRecognition]);

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
    if (!blob) { lastFrameRef.current = null; framesBufferRef.current = []; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const s = reader.result as string;
      lastFrameRef.current = s;
      // Keep last 3 frames for better visual context
      const buf = framesBufferRef.current;
      buf.push(s);
      if (buf.length > 3) buf.shift();
      framesBufferRef.current = buf;
    };
    reader.readAsDataURL(blob);
  }, []);

  const renderLiveVisuals = () => {
    const hasAny = (liveImages && liveImages.length) || (liveVideos && liveVideos.length) || (livePlaces && livePlaces.length) || (liveProducts && liveProducts.length) || (liveNews && liveNews.length);
    if (!hasAny) return null as any;
    const images = (liveImages || []).slice(0, 6);
    const videos = (liveVideos || []).slice(0, 4);
    const places = (livePlaces || []).slice(0, 4);
    const products = (liveProducts || []).slice(0, 4);
    const news = (liveNews || []).slice(0, 4);
    return (
      <div className="mt-3 md:mt-4 w-full flex flex-col items-center px-4">
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 w-full max-w-[min(85vw,560px)]">
            {images.map((src, i) => (
              <img key={`img-${i}`} src={src} className="w-full h-24 object-cover rounded-lg border border-white/10" alt="" />
            ))}
          </div>
        )}
        {videos.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 w-full max-w-[min(85vw,560px)]">
            {videos.map((src, i) => (
              <img key={`vid-${i}`} src={src} className="w-full h-24 object-cover rounded-lg border border-white/10" alt="" />
            ))}
          </div>
        )}
        {places.length > 0 && (
          <div className="mt-2 w-full max-w-[min(85vw,560px)] bg-white/10 border border-white/10 rounded-xl backdrop-blur px-4 py-3 text-white/90 text-sm">
            <div className="font-medium mb-1">Məkanlar</div>
            <ul className="list-disc pl-5 space-y-1">
              {places.map((p, i) => (<li key={`pl-${i}`}>{p.title}</li>))}
            </ul>
          </div>
        )}
        {products.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2 w-full max-w-[min(85vw,560px)]">
            {products.map((pr, i) => (
              <div key={`pr-${i}`} className="rounded-xl border border-white/10 bg-white/10 backdrop-blur p-2 text-white/90">
                {pr.imageUrl ? <img src={pr.imageUrl} className="w-full h-24 object-cover rounded-md mb-2" alt="" /> : null}
                <div className="text-xs line-clamp-2">{pr.title}</div>
                <div className="text-[11px] opacity-80 mt-1">{pr.price}</div>
              </div>
            ))}
          </div>
        )}
        {news.length > 0 && (
          <div className="mt-2 w-full max-w-[min(85vw,560px)] bg-white/10 border border-white/10 rounded-xl backdrop-blur px-4 py-3 text-white/90 text-sm">
            <div className="font-medium mb-1">Xəbərlər</div>
            <ul className="list-disc pl-5 space-y-1">
              {news.map((n, i) => (<li key={`nw-${i}`}>{n.title}</li>))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="nov-live-layer relative w-full h-full min-h-[calc(100vh-0px)] overflow-hidden">
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
            <div className="rounded-[1.25rem] overflow-hidden border border-white/10 bg-black/30 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out" style={{ width: 'clamp(320px, 60vw, 560px)', aspectRatio: '16 / 9' }}>
              <CameraView onFrame={handleFrame} facingMode={facingMode} />
            </div>
            <div className="mt-3 md:mt-4 px-6 py-3 rounded-xl border border-white/10 bg-white/10 backdrop-blur-md text-white/90 text-sm md:text-base shadow-xl max-w-[min(85vw,560px)] text-center whitespace-pre-wrap break-words leading-relaxed select-none relative">
              {renderedAnswer
                ? `Nova AI: ${renderedAnswer}`
                : (status === 'listening' ? (liveText || 'Dinləyir...')
                  : status === 'idle' ? 'Başlamaq üçün mikrofona toxunun'
                  : status === 'connecting' ? 'Bağlanır...'
                  : status === 'processing' ? 'Emal edilir...'
                  : 'Səsləndirir...')}
            </div>
            {/* Corner accents for visual parity with camera-off */}
            <div className="pointer-events-none">
              <div className="absolute -left-1.5 -top-1.5 w-3 h-3 border-t-2 border-l-2 rounded-tl-sm border-cyan-400/70"></div>
              <div className="absolute -right-1.5 -top-1.5 w-3 h-3 border-t-2 border-r-2 rounded-tr-sm border-cyan-400/70"></div>
              <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-l-2 rounded-bl-sm border-cyan-400/70"></div>
              <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-r-2 rounded-br-sm border-cyan-400/70"></div>
            </div>
            {renderLiveVisuals()}
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
                {renderedAnswer
                  ? `Nova AI: ${renderedAnswer}`
                  : (status === 'listening' ? (liveText || 'Dinləyir...')
                    : status === 'idle' ? 'Başlamaq üçün mikrofona toxunun'
                    : status === 'connecting' ? 'Bağlanır...'
                    : status === 'processing' ? 'Emal edilir...'
                    : 'Səsləndirir...')}
              </div>
              {/* Corner accents */}
              <div className="pointer-events-none">
                <div className="absolute -left-1.5 -top-1.5 w-3 h-3 border-t-2 border-l-2 rounded-tl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -top-1.5 w-3 h-3 border-t-2 border-r-2 rounded-tr-sm border-cyan-400/70"></div>
                <div className="absolute -left-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-l-2 rounded-bl-sm border-cyan-400/70"></div>
                <div className="absolute -right-1.5 -bottom-1.5 w-3 h-3 border-b-2 border-r-2 rounded-br-sm border-cyan-400/70"></div>
              </div>
            </div>
            {renderLiveVisuals()}
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
