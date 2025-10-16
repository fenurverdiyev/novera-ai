import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchBar } from './components/AttachmentSearchBar';
import { MessageDisplay } from './components/MessageDisplay';
import { streamChatQuery, generateRelatedQuestions, answerWithGroundedSearch } from './services/geminiService';
import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';
import type { Message, AppView, AppSettings, ToolCall, SearchMode, PlaceResult, ShoppingProduct } from './types';
import { Sidebar } from './components/Sidebar';
import { News } from './components/News';
import { Weather } from './components/Weather';
import { Translate } from './components/Translate';
import { Settings } from './components/Settings';
import SafeSearch from './components/SafeSearch';
import { Logo } from './components/Logo';
import { THEMES } from './animations/themes';
import { useDeviceTools } from './hooks/useDeviceTools';
import { Profile } from './components/Profile';
import { GoogleSearchView } from './components/GoogleSearchView';
import { MenuIcon, CloseIcon } from './components/Icons';
import { BrowserView } from './components/BrowserView';
import LiveConversationView from './components/LiveConversationView';
import { hasVisualIntent, hasPlaceIntent, hasNewsIntent, hasShoppingIntent, buildPlaceRecommendations, buildProductRecommendations, wantsProductRecommendations } from './utils/intents';
import { refineVisualQuery } from './utils/refineVisualQuery';
import { geminiTts } from './services/geminiTtsService';
import { ttsBinary } from './services/ttsBackendService';
// Simple visual/places intent detectors
const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = localStorage.getItem('nov-era-chat-history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [isLiveOverlayOpen, setIsLiveOverlayOpen] = useState(false);
  const [safeSearchMode, setSafeSearchMode] = useState<'off' | 'blur' | 'filter'>(() => {
    try {
      const v = localStorage.getItem('nov-era-safe-search');
      if (v === 'blur' || v === 'filter' || v === 'off') return v;
    } catch {}
    return 'off';
  });
  
  const [liveVocalResponse, setLiveVocalResponse] = useState<{ id: string; text: string } | null>(null);const [activeView, setActiveView] = useState<AppView>('search');
  const activeViewRef = useRef<AppView>('search');
  const [pendingOpenUrl, setPendingOpenUrl] = useState<string | null>(null);
  const [pendingOpenIncognito, setPendingOpenIncognito] = useState<boolean>(false);
  const [pendingBrowserSearch, setPendingBrowserSearch] = useState<{ query: string; fromIncognito?: boolean } | null>(null);
  const [previousView, setPreviousView] = useState<AppView>('search');
  const [returnOnOverlayClose, setReturnOnOverlayClose] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>(() => {
    try {
      const saved = localStorage.getItem('nov-era-search-mode') as SearchMode | null;
      return saved === 'universe' ? 'universe' : 'base';
    } catch { return 'base'; }
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('gemini-insight-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        const migratedTheme = parsed.theme === 'rgbneon' ? 'plexus' : parsed.theme;
        // Ensure voice defaults exist for live conversation
        return { noveraColor: '#000000', voiceEnabled: parsed.voiceEnabled ?? true, voiceId: parsed.voiceId || 'EXAVITQu4vr4xnSDxMaL', ...parsed, theme: migratedTheme };
      }
    } catch (error) {
      console.error("Could not parse saved settings:", error);
    }
    return { theme: 'novera', noveraColor: '#000000', voiceEnabled: true, voiceId: 'EXAVITQu4vr4xnSDxMaL' } as any;
  });
  const [scrollOffset, setScrollOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<number | null>(null);
  // Legacy audio/TTS refs (kept to prevent runtime errors while voice UI is disabled)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
    const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
    const sentenceQueueRef = useRef<string[]>([]);
    const currentPlayingMessageIdRef = useRef<string | null>(null);
  const isProcessingSentencesRef = useRef(false);
  const sentenceAudioCacheRef = useRef<Record<string, string | null>>({});
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  // Bridge status updates to Live view
  const dispatchLiveStatus = useCallback((s: 'idle' | 'speaking' | 'processing' | 'listening') => {
    try { window.dispatchEvent(new CustomEvent('nov-era-live-status' as any, { detail: s })); } catch {}
  }, []);
  // Global: run a Browser search (optionally from Incognito)
  useEffect(() => {
    const onBrowserSearch = (e: any) => {
      try {
        const detail = e?.detail;
        const q = (detail?.query || '').toString();
        const fromIncognito = !!detail?.fromIncognito;
        if (!q) return;
        setPreviousView(activeViewRef.current);
        setReturnOnOverlayClose(false);
        setActiveView('browser');
        setPendingBrowserSearch({ query: q, fromIncognito });
      } catch {}
    };
    window.addEventListener('nov-era-browser-search' as any, onBrowserSearch as any);
    return () => window.removeEventListener('nov-era-browser-search' as any, onBrowserSearch as any);
  }, []);

  
  const addMessage = useCallback((message: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...message, id: Date.now().toString() }]);
  }, []);

  // Listen for voice changes coming from VoiceSelector overlay
  useEffect(() => {
    const onVoiceChange = (e: any) => {
      const v = e?.detail;
      if (v && typeof v === 'string') {
        setSettings(prev => ({ ...prev, voiceId: v, voiceEnabled: true }));
      }
    };
    window.addEventListener('nov-era-voice-change' as any, onVoiceChange as any);
    return () => window.removeEventListener('nov-era-voice-change' as any, onVoiceChange as any);
  }, []);

  // Global: open any external link inside NovEra Browser overlay
  useEffect(() => {
    const handler = (e: any) => {
      try {
        const url = e?.detail;
        if (!url || typeof url !== 'string') return;
        setPreviousView(activeViewRef.current);
        setReturnOnOverlayClose(true);
        setActiveView('browser');
        setPendingOpenUrl(url);
      } catch {}
    };
    window.addEventListener('nov-era-open-url' as any, handler as any);
    return () => window.removeEventListener('nov-era-open-url' as any, handler as any);
  }, []);
  // Global: open Incognito as separate view
  useEffect(() => {
    const onIncog = () => {
      try {
        setPreviousView(activeViewRef.current);
        setReturnOnOverlayClose(false);
        setActiveView('incognito');
        setPendingOpenIncognito(false);
      } catch {}
    };
    window.addEventListener('nov-era-open-incognito' as any, onIncog as any);
    return () => window.removeEventListener('nov-era-open-incognito' as any, onIncog as any);
  }, []);
  // Navigation events (e.g., from SearchBar hamburger)
  useEffect(() => {
    const onNav = (e: any) => {
      const view = (e?.detail || '').toString();
      if (!view) return;
      if (view === 'profile' || view === 'settings' || view === 'safe-search' || view === 'news' || view === 'weather' || view === 'translate') {
        if (view === 'safe-search') setPreviousView(activeViewRef.current);
        setActiveView(view as any);
      }
    };
    window.addEventListener('nov-era-nav' as any, onNav as any);
    return () => window.removeEventListener('nov-era-nav' as any, onNav as any);
  }, []);
  // Back navigation requests
  useEffect(() => {
    const onBack = () => {
      setActiveView(previousView);
    };
    window.addEventListener('nov-era-back' as any, onBack as any);
    return () => window.removeEventListener('nov-era-back' as any, onBack as any);
  }, [previousView]);
  // SafeSearch changes
  useEffect(() => {
    const onSafe = (e: any) => {
      const v = (e?.detail || '').toString();
      if (v === 'off' || v === 'blur' || v === 'filter') setSafeSearchMode(v);
    };
    window.addEventListener('nov-era-safe-search-changed' as any, onSafe as any);
    return () => window.removeEventListener('nov-era-safe-search-changed' as any, onSafe as any);
  }, []);
  const { executeToolCalls } = useDeviceTools(addMessage);
  // Keep ref in sync with current activeView
  useEffect(() => { activeViewRef.current = activeView; }, [activeView]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAppReady(true);
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
    }, 800); // Faster initial loading
    return () => clearTimeout(timer);
  }, []);

  
  // Listen for global "clear all history" requests from Sidebar's button
  useEffect(() => {
    const handleClearAll = () => {
      try {
        localStorage.removeItem('nov-era-sessions');
        localStorage.removeItem('nov-era-chat-history');
        window.dispatchEvent(new Event('nov-era-sessions-updated' as any));
      } catch {}
      setMessages([]);
      setActiveView('search');
    };
    window.addEventListener('nov-era-clear-all' as any, handleClearAll as any);
    return () => window.removeEventListener('nov-era-clear-all' as any, handleClearAll as any);
  }, []);

  // Clear recent N minutes from history
  useEffect(() => {
    const handleClearRecent = (e: any) => {
      try {
        const minutes = Number(e?.detail) || 30;
        const cutoff = Date.now() - minutes * 60 * 1000;
        setMessages(prev => {
          const filtered = prev.filter(m => {
            const t = parseInt(m.id, 10);
            return isNaN(t) || t < cutoff; // keep older than cutoff
          });
          try { localStorage.setItem('nov-era-chat-history', JSON.stringify(filtered)); } catch {}
          return filtered;
        });
      } catch {}
    };
    window.addEventListener('nov-era-clear-recent' as any, handleClearRecent as any);
    return () => window.removeEventListener('nov-era-clear-recent' as any, handleClearRecent as any);
  }, []);

  // Persist SafeSearch mode
  useEffect(() => {
    try { localStorage.setItem('nov-era-safe-search', safeSearchMode); } catch {}
  }, [safeSearchMode]);

  useEffect(() => {
    try {
      localStorage.setItem('gemini-insight-settings', JSON.stringify(settings));
      document.body.className = `theme-${settings.theme} font-sans`;
    } catch (error) {
      console.error("Could not save settings:", error);
    }
  }, [settings]);

  useEffect(() => {
    try { localStorage.setItem('nov-era-search-mode', searchMode); } catch {}
  }, [searchMode]);


  useEffect(() => {
    try {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      // keep storage light: persist only latest 200 messages
      const snapshot = messages.slice(-200);
      saveTimerRef.current = window.setTimeout(() => {
        try { localStorage.setItem('nov-era-chat-history', JSON.stringify(snapshot)); } catch {}
        saveTimerRef.current = null;
      }, 250); // debounce to avoid thrashing
    } catch {}
  }, [messages]);


  // Lightweight client-side image compression for data URLs
  const compressDataUrl = async (dataUrl: string, maxSize = 1280, quality = 0.82): Promise<string> => {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img load error'));
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      let { width, height } = img as HTMLImageElement;
      if (width > height) {
        if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
      } else {
        if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img as HTMLImageElement, 0, 0, width, height);
      const out = canvas.toDataURL('image/jpeg', quality);
      return out || dataUrl;
    } catch {
      return dataUrl;
    }
  };
  const compressAll = async (list: string[], size = 1280, q = 0.82) => Promise.all(list.map(d => compressDataUrl(d, size, q)));


  const clearHistory = useCallback(() => {
    // Archive current conversation into sessions, then clear active chat
    try {
      const current = messages;
      if (current && current.length) {
        const raw = localStorage.getItem('nov-era-sessions');
        const sessions = raw ? JSON.parse(raw) : [];
        const firstUser = current.find(m => m.role === 'user');
        const title = (firstUser?.text || 'Adsız söhbət').slice(0, 60);
        sessions.unshift({ id: Date.now(), title, time: Date.now(), messages: current });
        localStorage.setItem('nov-era-sessions', JSON.stringify(sessions.slice(0, 100)));
        try { window.dispatchEvent(new Event('nov-era-sessions-updated')); } catch {}
      }
      localStorage.removeItem('nov-era-chat-history');
    } catch {}
    setMessages([]);
    setActiveView('search');
  }, [messages]);


  const loadSession = useCallback((sessionMessages: Message[]) => {
    try { localStorage.setItem('nov-era-chat-history', JSON.stringify(sessionMessages)); } catch {}
    setMessages(sessionMessages);
    setActiveView('search');
  }, []);


  const handleSend = async (query: string, images?: string[], isVocalQuery: boolean = false) => {
    // Keep Live view when vocal query; otherwise go to search view
    if (isVocalQuery) {
      setActiveView('live');
    } else {
      setActiveView('search');
    }
    setIsLiveOverlayOpen(false);
    setIsLoading(true);
    const hasImages = !!(images && images.length);
    const preparedImages = hasImages ? await compressAll(images!, 1280, 0.82) : [];
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: query, images: hasImages ? preparedImages : undefined };
    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = {
      id: modelMessageId, role: 'model', text: '', sources: [], related: [],
      isLoading: true, images: [], videos: [], progressStep: 1,
    };
    
    const history = messages.slice(-10); // Son 5 sual-cavab cütü
    setMessages(prev => [...prev, userMessage, initialModelMessage]);
    if (isVocalQuery && (settings.voiceEnabled ?? true)) {
      try { dispatchLiveStatus('processing'); } catch {}
    }


    try {
      // Grounded mode: Universe or prefix '?' forces web-grounded answer
      const explicitGrounded = query.trim().startsWith('?');
      const groundedQuery = explicitGrounded ? query.trim().slice(1).trim() : query;
      // If images are attached, prefer pure analysis (no grounded web search)
      const isGrounded = !hasImages && ((searchMode === 'universe') || explicitGrounded);


      if (isGrounded) {
        // Step 2: Searching (grounded)
        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, progressStep: 2 } : msg));


        // Prefetch Serper data in parallel while grounded answer is being generated
        const willFetchVisualsG = hasVisualIntent(groundedQuery) || hasShoppingIntent(groundedQuery) || hasNewsIntent(groundedQuery) || hasPlaceIntent(groundedQuery);
        const visualImgCountG = hasVisualIntent(groundedQuery) ? 6 : 4;
        const visualVidCountG = hasVisualIntent(groundedQuery) ? 3 : 2;
        const visualsQueryG = hasVisualIntent(groundedQuery) ? refineVisualQuery(groundedQuery, [...history, userMessage]) : groundedQuery;
        const visualsPromiseG = willFetchVisualsG ? searchImagesAndVideos(visualsQueryG, visualImgCountG, visualVidCountG) : null;
        const placesPromiseG = hasPlaceIntent(groundedQuery) ? (async () => {
          const { hl, gl } = detectLocaleForSearch();
          return await searchPlaces(groundedQuery, 8, { hl, gl });
        })() : null;
        const newsPromiseG = hasNewsIntent(groundedQuery) ? (() => { const { hl, gl } = getPreferredNewsLocale(); return searchNews(groundedQuery, 10, { hl, gl }); })() : null;
        const shoppingPromiseG = hasShoppingIntent(groundedQuery) ? searchShopping(groundedQuery) : null;


        const { text, sources } = await answerWithGroundedSearch(groundedQuery, undefined, JSON.stringify(history));
        // Step 3: Answering
        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, text, sources, progressStep: 3 } : msg));


        // Resolve any prefetches
        if (visualsPromiseG) {
          try {
            const vr = await visualsPromiseG;
            if (vr && (vr.images.length || vr.videos.length)) {
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? {
                ...msg,
                images: Array.from(new Set([...(msg.images || []), ...vr.images])),
                videos: Array.from(new Set([...(msg.videos || []), ...vr.videos]))
              } : msg));
            }
          } catch {}
        }
        if (placesPromiseG) {
          try {
            const pr = await placesPromiseG;
            if (pr && pr.length) {
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, places: pr } : msg));
              const rec = buildPlaceRecommendations(pr);
              if (rec) {
                setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: (msg.text || '') + rec } : msg));
              }
            }
          } catch {}
        }
        if (newsPromiseG) {
          try {
            const nr = await newsPromiseG;
            if (nr && nr.length) {
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, news: nr } : msg));
            }
          } catch {}
        }
        if (shoppingPromiseG) {
          try {
            const sr = await shoppingPromiseG;
            if (sr && sr.length) {
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, products: sr } : msg));
              const rec = wantsProductRecommendations(groundedQuery) ? buildProductRecommendations(sr) : '';
              if (rec) setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: (msg.text || '') + rec } : msg));
            }
          } catch {}
        }
        setIsLoading(false);
        return;
      }


      let fullResponseText = '';
      let accumulatedToolCalls: ToolCall[] = [];
      let sentenceAccumulator = '';
      const sentenceEndRegex = /[.!?…]/;


      if (isVocalQuery && (settings.voiceEnabled ?? true)) {
        currentPlayingMessageIdRef.current = modelMessageId;
        setPlayingMessageId(modelMessageId);
      }


      const stream = streamChatQuery(groundedQuery, history, hasImages ? preparedImages : images, undefined, undefined, hasImages ? true : undefined);


      // If we expect visuals/places/news/shopping, mark step 2 and prefetch in background
      const willFetchVisuals = hasImages ? false : (hasVisualIntent(groundedQuery) || hasShoppingIntent(groundedQuery) || hasNewsIntent(groundedQuery) || hasPlaceIntent(groundedQuery));
      const willFetchPlaces = hasImages ? false : hasPlaceIntent(groundedQuery);
      const willFetchNews = hasImages ? false : hasNewsIntent(groundedQuery);
      const willFetchShopping = hasImages ? false : hasShoppingIntent(groundedQuery);


      if (willFetchVisuals || willFetchPlaces || willFetchNews || willFetchShopping) {
        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, progressStep: 2 } : msg));
      }
      const visualImgCount = hasVisualIntent(groundedQuery) ? 6 : 4;
      const visualVidCount = hasVisualIntent(groundedQuery) ? 3 : 2;
      const visualsQuery = hasVisualIntent(groundedQuery) ? refineVisualQuery(groundedQuery, [...history, userMessage]) : groundedQuery;
      const visualsPromise = willFetchVisuals ? searchImagesAndVideos(visualsQuery, visualImgCount, visualVidCount) : null;
      const placesPromise = willFetchPlaces ? (async () => {
        const { hl, gl } = detectLocaleForSearch();
        return await searchPlaces(groundedQuery, 8, { hl, gl });
      })() : null;
      const newsPromise = willFetchNews ? (() => { const { hl, gl } = getPreferredNewsLocale(); return searchNews(groundedQuery, 10, { hl, gl }); })() : null;
      const shoppingPromise = willFetchShopping ? searchShopping(groundedQuery) : null;


      let firstChunk = true;


      for await (const chunk of stream) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          sentenceAccumulator += chunk.text;
          if (firstChunk) {
            // Step 3: Answering
            setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, progressStep: 3 } : msg));
            firstChunk = false;
          }


          if (isVocalQuery && (settings.voiceEnabled ?? true)) {
            let match;
            while ((match = sentenceAccumulator.match(sentenceEndRegex))) {
              const sentence = sentenceAccumulator.substring(0, match.index! + 1).trim();
              if (sentence) {
                sentenceQueueRef.current.push(sentence);
                if (!isProcessingSentencesRef.current) {
                  processVocalStream();
                }
              }
              sentenceAccumulator = sentenceAccumulator.substring(match.index! + 1);
            }
          }
        }


        if (chunk.toolCalls) {
          const webSearchCalls = chunk.toolCalls.filter(tc => tc.functionCall?.name === 'webSearch');
          const otherToolParts = chunk.toolCalls.filter(tc => tc.functionCall?.name !== 'webSearch');


          if (webSearchCalls.length > 0) {
            for (const call of webSearchCalls) {
              const { query, maxImages, maxVideos } = call.functionCall.args;
              const refined = refineVisualQuery(query, [...history, userMessage]);
              const searchResult = await searchImagesAndVideos(refined, maxImages, maxVideos);
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? {
                ...msg,
                images: [...(msg.images || []), ...searchResult.images],
                videos: [...(msg.videos || []), ...searchResult.videos],
              } : msg));
            }
          }
          if (otherToolParts.length > 0) {
            const normalizedCalls = otherToolParts
              .map(p => ({ name: p.functionCall.name, args: p.functionCall.args }))
              .filter(c => c && c.name);
            accumulatedToolCalls.push(...normalizedCalls);
            await executeToolCalls(normalizedCalls);
          }
        }


        setMessages(prev => prev.map(msg => {
          if (msg.id !== modelMessageId) return msg;
          const mergedImages = chunk.images && chunk.images.length
            ? Array.from(new Set([...(msg.images || []), ...chunk.images]))
            : msg.images;
          const mergedVideos = chunk.videos && chunk.videos.length
            ? Array.from(new Set([...(msg.videos || []), ...chunk.videos]))
            : msg.videos;
          return {
            ...msg,
            text: fullResponseText,
            sources: [...(msg.sources || []), ...(chunk.sources || [])],
            images: mergedImages,
            videos: mergedVideos,
          };
        }));


        if (isVocalQuery) setLiveVocalResponse({ id: modelMessageId, text: fullResponseText });
      }


      // Handle any remaining text in the accumulator
      if (isVocalQuery && (settings.voiceEnabled ?? true) && sentenceAccumulator.trim()) {
        const leftover = sentenceAccumulator.trim();
        sentenceQueueRef.current.push(leftover);
        if (!isProcessingSentencesRef.current) {
          processVocalStream();
        }
      }


      if (accumulatedToolCalls.length > 0) {
        await executeToolCalls(accumulatedToolCalls);
      }
      
      const relatedQuestions = await generateRelatedQuestions(groundedQuery, fullResponseText);
      setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, related: relatedQuestions } : msg));
      
      // Resolve any prefetches
      if (visualsPromise) {
        try {
          const vr = await visualsPromise;
          if (vr && (vr.images.length || vr.videos.length)) {
            setMessages(prev => prev.map(msg => msg.id === modelMessageId ? {
              ...msg,
              images: Array.from(new Set([...(msg.images || []), ...vr.images])),
              videos: Array.from(new Set([...(msg.videos || []), ...vr.videos]))
            } : msg));
          }
        } catch {}
      }
      if (placesPromise) {
        try {
          const pr = await placesPromise;
          if (pr && pr.length) {
            setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, places: pr } : msg));
            const rec = buildPlaceRecommendations(pr);
            if (rec) {
              setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: (msg.text || '') + rec } : msg));
            }
          }
        } catch {}
      }
      if (newsPromise) {
          try {
              const nr = await newsPromise;
              if (nr && nr.length) {
                  setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, news: nr } : msg));
              }
          } catch {}
      }
      if (shoppingPromise) {
          try {
              const sr = await shoppingPromise;
              if (sr && sr.length) {
                  setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, products: sr } : msg));
                  const rec = wantsProductRecommendations(groundedQuery) ? buildProductRecommendations(sr) : '';
                  if (rec) setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: (msg.text || '') + rec } : msg));
              }
          } catch {}
      }
    } catch (error) {
      console.error('An error occurred:', error);
      setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, text: "Üzr istəyirəm, xəta baş verdi. Zəhmət olmasa yenidən cəhd edin." } : msg));
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        // You can now send this image with a message
        // For now, let's just add it to a new message
        const query = "Bu şəkli analiz et.";
        handleSend(query, [base64Image]);
      };
      reader.readAsDataURL(file);
    }
  };


  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    setScrollOffset(event.currentTarget.scrollTop);
  };

  // Global: run AI analyze for a given query (from Incognito view)
  useEffect(() => {
    const onAiAnalyze = (e: any) => {
      try {
        const q = (e?.detail || '').toString();
        if (!q) return;
        // Force grounded analysis via leading '?'
        handleSend(`? ${q}`);
      } catch {}
    };
    window.addEventListener('nov-era-ai-analyze' as any, onAiAnalyze as any);
    return () => window.removeEventListener('nov-era-ai-analyze' as any, onAiAnalyze as any);
  }, [handleSend]);


  const renderView = () => {
    switch (activeView) {
        case 'browser': return (
          <BrowserView
            onVisualQuery={(q, imgs) => handleSend(q, imgs)}
            openOverlayUrl={pendingOpenUrl || undefined}
            onOpenedOverlay={() => setPendingOpenUrl(null)}
            onOverlayClosed={() => { if (returnOnOverlayClose) { setReturnOnOverlayClose(false); setActiveView(previousView); } }}
            safeSearchMode={safeSearchMode}
            openIncognito={pendingOpenIncognito}
            onOpenedIncognito={() => setPendingOpenIncognito(false)}
            incomingSearch={pendingBrowserSearch || undefined}
            onConsumedIncomingSearch={() => setPendingBrowserSearch(null)}
          />
        );
        case 'google-search': return (
          <BrowserView
            onVisualQuery={(q, imgs) => handleSend(q, imgs)}
            openOverlayUrl={pendingOpenUrl || undefined}
            onOpenedOverlay={() => setPendingOpenUrl(null)}
            onOverlayClosed={() => { if (returnOnOverlayClose) { setReturnOnOverlayClose(false); setActiveView(previousView); } }}
            safeSearchMode={safeSearchMode}
            openIncognito={pendingOpenIncognito}
            onOpenedIncognito={() => setPendingOpenIncognito(false)}
          />
        );
        case 'incognito':
          return (
            <div className="flex-1 h-full">
              <GoogleSearchView isIncognito={true} />
            </div>
          );
        case 'safe-search': return <SafeSearch value={safeSearchMode} onChange={(v) => setSafeSearchMode(v)} />;
        case 'news': return <News themeColor={activeThemeColor} />;
        case 'weather': return <Weather />;
        case 'translate': return <Translate />;
        case 'profile': return <Profile />;
        case 'settings': return <Settings settings={settings} onSettingsChange={setSettings} themeColor={activeThemeColor} />;
                case 'live':
            return (
                <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
                    <main className="flex-grow overflow-y-auto app-scroll"> 
                        <LiveConversationView onQuery={(q, imgs) => handleSend(q, imgs, true)} onBack={() => setActiveView('search')} />
                    </main>
                </div>
            );
        case 'search':
        default:
            return (
                <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
                    <main className="flex-grow overflow-y-auto app-scroll" onScroll={handleScroll}>
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center px-4">
                                <Logo isLarge={true} className="mb-4" />
                                <h1 className="text-4xl font-bold text-text-main">Bu gün sizə necə kömək edə bilərəm?</h1>
                            </div>
                        ) : (
                            <div>
                                {messages.map(msg => (
                                    <MessageDisplay key={msg.id} message={msg} onRelatedQuery={(q) => handleSend(q)} />
                                ))}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </main>
                    <footer className="bg-transparent pt-2">
                        <SearchBar 
                            onSend={(q, imgs) => handleSend(q, imgs)} 
                            isLoading={isLoading} 
                            onVoiceClick={() => setActiveView('live')}
                                searchMode={searchMode}
                            onChangeMode={setSearchMode}
                        />
                        <p className="text-center text-xs text-text-sub pb-3">
                        NovEra səhv edə bilər. Vacib məlumatları yoxlamağınız tövsiyə olunur.
                        </p>
                    </footer>
                </div>
            );
    }
  };


  const ActiveAnimation = THEMES.find(t => t.id === settings.theme)?.animation;
  const activeThemeColor = THEMES.find(t => t.id === settings.theme)?.colors[2];


  useEffect(() => {
    // Initialize Web Audio analyser for visualizations and playback routing
    if (!audioRef.current) return;
    try {
      const el: any = audioRef.current;
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      const audioCtx = audioContextRef.current || el.__novEraAudioCtx || new AC();
      const existingSource = audioSourceRef.current || el.__novEraSource || null;
      const source = existingSource || audioCtx.createMediaElementSource(audioRef.current);
      // cache on element to avoid creating multiple MediaElementSourceNodes for same element
      el.__novEraAudioCtx = audioCtx;
      el.__novEraSource = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      audioSourceRef.current = source;
    } catch (e) {
      console.error("Could not create AudioContext:", e);
    }

    return () => {
      // Only disconnect analyser; keep source/context cached to prevent duplicate MediaElementSourceNode errors across remounts
      if (analyserRef.current) {
        try { analyserRef.current.disconnect(); } catch {}
        analyserRef.current = null;
      }
    };
  }, []);


  useEffect(() => {
    const unlockAudio = () => {
      try {
        if (audioContextRef.current?.state === 'suspended') {
          audioContextRef.current.resume();
        }
      } catch (e) {
        console.warn('AudioContext resume failed:', e);
      }
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };


  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);


  const stopPlayback = useCallback(() => {
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
      }
      setPlayingMessageId(null);
      currentPlayingMessageIdRef.current = null;
      sentenceQueueRef.current = [];
      isProcessingSentencesRef.current = false;
  }, []);


  const processVocalStream = useCallback(async () => {
    if (isProcessingSentencesRef.current || !currentPlayingMessageIdRef.current) {
        return;
    }
    if (sentenceQueueRef.current.length === 0) {
        dispatchLiveStatus('idle');
        return;
    }


    isProcessingSentencesRef.current = true;
    const sentence = sentenceQueueRef.current[0];


    if (!sentence || !audioRef.current) {
        isProcessingSentencesRef.current = false;
        return;
    }


    try {
        const nextSentences = sentenceQueueRef.current.slice(1, 3);
        nextSentences.forEach(nextSentence => {
            if (nextSentence && sentenceAudioCacheRef.current[nextSentence] === undefined) {
                sentenceAudioCacheRef.current[nextSentence] = null;
                geminiTts(nextSentence)
                  .then(url => {
                    sentenceAudioCacheRef.current[nextSentence] = url;
                  })
                  .catch(async () => {
                    try {
                      const b = await ttsBinary(nextSentence, { voiceId: settings.voiceId });
                      sentenceAudioCacheRef.current[nextSentence] = b;
                    } catch {
                      sentenceAudioCacheRef.current[nextSentence] = null;
                    }
                  });
            }
        });


        let url = sentenceAudioCacheRef.current[sentence];
        if (url === undefined || url === null) {
            try {
              url = await geminiTts(sentence);
            } catch {
              try { url = await ttsBinary(sentence, { voiceId: settings.voiceId }); } catch {}
            }
            sentenceAudioCacheRef.current[sentence] = url || null;
        }


        if (url && currentPlayingMessageIdRef.current) {
            // Play with TTS audio
            sentenceQueueRef.current.shift();
            audioRef.current.src = url;
            if (audioContextRef.current?.state === 'suspended') {
                await audioContextRef.current.resume();
            }
            try { dispatchLiveStatus('speaking'); } catch {}
            await audioRef.current.play();
        } else {
            // Fallback: use Web Speech Synthesis so the queue does not stall
            try {
                const utter = new SpeechSynthesisUtterance(sentence);
                // Pick best available voice/lang (az → tr → en)
                try {
                  const list = window.speechSynthesis.getVoices?.() || [];
                  const pick = list.find(v => (v.lang || '').toLowerCase().startsWith('az'))
                    || list.find(v => (v.lang || '').toLowerCase().startsWith('tr'))
                    || list.find(v => (v.lang || '').toLowerCase().startsWith('en'))
                    || null;
                  if (pick) { utter.voice = pick; utter.lang = pick.lang; } else { utter.lang = (navigator.language || 'tr-TR'); }
                } catch { utter.lang = 'tr-TR'; }
                utter.onend = () => {
                    try { window.speechSynthesis.cancel(); } catch {}
                    sentenceQueueRef.current.shift();
                    isProcessingSentencesRef.current = false;
                    try { dispatchLiveStatus(sentenceQueueRef.current.length ? 'speaking' : 'idle'); } catch {}
                    processVocalStream();
                };
                utter.onerror = () => {
                    // Drop this sentence and continue
                    try { window.speechSynthesis.cancel(); } catch {}
                    sentenceQueueRef.current.shift();
                    isProcessingSentencesRef.current = false;
                    setTimeout(processVocalStream, 0);
                };
                try { dispatchLiveStatus('speaking'); } catch {}
                window.speechSynthesis.speak(utter);
                return; // exit; onend will continue the pipeline
            } catch {
                // If even synthesis fails, drop this sentence and continue
                sentenceQueueRef.current.shift();
                isProcessingSentencesRef.current = false;
                setTimeout(processVocalStream, 0);
                return;
            }
        }
    } catch (error) {
        console.error("S 9s oxunark 99n x 9ta ba 5f verdi:", sentence, error);
        if (currentPlayingMessageIdRef.current) {
          setMessages(prev => prev.map(m => m.id === currentPlayingMessageIdRef.current ? { ...m, ttsError: 'S 9sl 9ndirm 9 m fcmk fcn olmad 31.' } : m));
        }
        sentenceQueueRef.current.shift();
        isProcessingSentencesRef.current = false;
        processVocalStream();
    }
  }, [settings.voiceId]);


  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioEnd = () => {
        isProcessingSentencesRef.current = false;
        processVocalStream();
        if (sentenceQueueRef.current.length === 0) {
          try { dispatchLiveStatus('idle'); } catch {}
        }
    };
    const handleAudioError = () => {
        // Skip current sentence and continue
        isProcessingSentencesRef.current = false;
        processVocalStream();
    };


    audio.addEventListener('ended', handleAudioEnd);
    audio.addEventListener('error', handleAudioError);
    return () => {
      audio.removeEventListener('ended', handleAudioEnd);
      audio.removeEventListener('error', handleAudioError);
    };
  }, [processVocalStream]);
  const chunkText = (text: string): string[] => (text.match(/[^.!?…]+[.!?…]*|[^.!?]+$/g)?.map(s => s.trim()).filter(Boolean) || []);

  const handlePlayAudio = (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
        stopPlayback();
        return;
    }
    stopPlayback();
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ttsError: undefined } : m));
    const chunks = chunkText(text);
    if (chunks.length === 0) return;


    sentenceQueueRef.current = chunks;
    currentPlayingMessageIdRef.current = messageId;
    setPlayingMessageId(messageId);
    processVocalStream();
  };


  const getPreferredNewsLocale = useCallback((): { hl: string; gl: string } => {
    try {
      const saved = localStorage.getItem('nov-era-news-language');
      const { hl, gl } = detectLocaleForSearch();
      if (saved && saved !== 'all') {
        return { hl: saved.toLowerCase(), gl };
      }
      return { hl, gl };
    } catch {
      return detectLocaleForSearch();
    }
  }, []);


  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);


  return (
    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
      {ActiveAnimation && (
        <ActiveAnimation
          scrollOffset={scrollOffset}
          customColor={settings.theme === 'novera' ? (settings.noveraColor || '#000000') : undefined}
        />
      )}
      {/* Desktop sidebar */}
      <div className="hidden md:flex relative">
        <div className={`h-full transition-all duration-300 overflow-hidden ${isSidebarCollapsed ? 'w-0' : 'w-60'}`}>
          <Sidebar activeView={activeView} setActiveView={setActiveView} onNewChat={clearHistory} themeColor={activeThemeColor} onOpenSession={loadSession} />
        </div>
        <button
          onClick={() => setIsSidebarCollapsed(v => !v)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 z-30 w-6 h-16 rounded-r-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white/80 backdrop-blur flex items-center justify-center"
          aria-label="Yan paneli gizlət/göstər"
          title="Yan paneli gizlət/göstər"
        >
          {isSidebarCollapsed ? '<' : '>'}
        </button>
      </div>


      {/* Mobile overlay sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setIsSidebarOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute left-0 top-0 h-full w-64 max-w-[80%]" onClick={(e) => e.stopPropagation()}>
            <div className="h-full bg-bg-slate/95 backdrop-blur-md border-r border-white/10 shadow-2xl">
              <div className="flex items-center justify-between px-3 py-3 border-b border-white/10">
                <span className="text-white/80 text-sm">Menyu</span>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/80">
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
              <Sidebar activeView={activeView} setActiveView={(v) => { setActiveView(v); setIsSidebarOpen(false); }} onNewChat={() => { clearHistory(); setIsSidebarOpen(false); }} themeColor={activeThemeColor} onOpenSession={(msgs) => { loadSession(msgs); setIsSidebarOpen(false); }} />
            </div>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col overflow-y-hidden w-0 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-white/10 bg-bg-slate/80 backdrop-blur sticky top-0 z-40">
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 rounded-lg hover:bg-white/10 text-white/90" aria-label="Menyunu aç">
            <MenuIcon className="w-6 h-6" />
          </button>
          <Logo />
          <button onClick={clearHistory} className="px-3 py-1.5 rounded-lg bg-accent/20 text-white hover:bg-accent/30 text-xs">Yeni söhbət</button>
        </div>

        {renderView()}
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload}
        className="hidden" 
        accept="image/*"
      />
      {/* Hidden audio element for TTS playback */}
      <audio ref={audioRef} className="hidden" preload="auto" />

      {/* Transparent/thin scrollbars for app scroll containers */}
      <style>
        {`
          /* Global (body) scrollbar becomes subtle/transparent */
          html, body { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.14) transparent; }
          body::-webkit-scrollbar-track { background: transparent; }
          body::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.16); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
          body::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,.28); }

          .app-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.18) transparent; }
          .app-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
          .app-scroll::-webkit-scrollbar-track { background: transparent; }
          .app-scroll::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.18); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
          .app-scroll::-webkit-scrollbar-thumb:hover { background-color: rgba(255,255,255,.28); }
          .app-scroll { -webkit-overflow-scrolling: touch; }
        `}
      </style>
    </div>
  );
};


export default App;
















