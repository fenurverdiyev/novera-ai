import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { MessageDisplay } from './components/MessageDisplay';
import { streamChatQuery, generateRelatedQuestions, answerWithGroundedSearch } from './services/geminiService';
import { searchImagesAndVideos, searchPlaces, searchNews, searchShopping, detectLocaleForSearch } from './services/searchService';
import type { Message, AppView, AppSettings, ToolCall, SearchMode, PlaceResult, ShoppingProduct } from './types';
import { Sidebar } from './components/Sidebar';
import { News } from './components/News';
import { Weather } from './components/Weather';
import { Translate } from './components/Translate';
import { Settings } from './components/Settings';
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
import { textToSpeech } from './services/elevenLabsService';
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
  
  const [liveVocalResponse, setLiveVocalResponse] = useState<{ id: string; text: string } | null>(null);const [activeView, setActiveView] = useState<AppView>('search');
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
        return { noveraColor: '#000000', ...parsed, theme: migratedTheme };
      }
    } catch (error) {
      console.error("Could not parse saved settings:", error);
    }
    return { theme: 'novera', noveraColor: '#000000' };
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
  const addMessage = useCallback((message: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...message, id: Date.now().toString() }]);
  }, []);
  const { executeToolCalls } = useDeviceTools(addMessage);
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
    // Always close overlay; background TTS will continue
    setActiveView('search');
    setIsLiveOverlayOpen(false);
    setIsLoading(true);
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: query };
    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = {
      id: modelMessageId, role: 'model', text: '', sources: [], related: [],
      isLoading: true, images: [], videos: [], progressStep: 1,
    };
    
    const history = messages.slice(-10); // Son 5 sual-cavab cГјtГј
    setMessages(prev => [...prev, userMessage, initialModelMessage]);


    try {
      // Grounded mode: Universe or prefix '?' forces web-grounded answer
      const explicitGrounded = query.trim().startsWith('?');
      const groundedQuery = explicitGrounded ? query.trim().slice(1).trim() : query;
      const isGrounded = (searchMode === 'universe') || explicitGrounded;


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


      if (isVocalQuery && settings.voiceEnabled) {
        currentPlayingMessageIdRef.current = modelMessageId;
        setPlayingMessageId(modelMessageId);
      }


      const stream = streamChatQuery(groundedQuery, history, images);


      // If we expect visuals/places/news/shopping, mark step 2 and prefetch in background
      const willFetchVisuals = hasVisualIntent(groundedQuery) || hasShoppingIntent(groundedQuery) || hasNewsIntent(groundedQuery) || hasPlaceIntent(groundedQuery);
      const willFetchPlaces = hasPlaceIntent(groundedQuery);
      const willFetchNews = hasNewsIntent(groundedQuery);
      const willFetchShopping = hasShoppingIntent(groundedQuery);


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


          if (isVocalQuery && settings.voiceEnabled) {
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


        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? {
          ...msg, text: fullResponseText,
          sources: [...(msg.sources || []), ...(chunk.sources || [])],
        } : msg));


        if (isVocalQuery) setLiveVocalResponse({ id: modelMessageId, text: fullResponseText });
      }


      // Handle any remaining text in the accumulator
      if (isVocalQuery && settings.voiceEnabled && sentenceAccumulator.trim()) {
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


  const renderView = () => {
    switch (activeView) {
        case 'browser': return <BrowserView onVisualQuery={(q, imgs) => handleSend(q, imgs)} />;
        case 'google-search': return <BrowserView onVisualQuery={(q, imgs) => handleSend(q, imgs)} />;
        case 'news': return <News themeColor={activeThemeColor} />;
        case 'weather': return <Weather />;
        case 'translate': return <Translate />;
        case 'profile': return <Profile />;
        case 'settings': return <Settings settings={settings} onSettingsChange={setSettings} themeColor={activeThemeColor} />;
                case 'live':
            return (
                <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
                    <main className="flex-grow overflow-y-auto"> 
                        <LiveConversationView onQuery={(q, imgs) => handleSend(q, imgs, true)} onBack={() => setActiveView('search')} />
                    </main>
                </div>
            );
        case 'search':
        default:
            return (
                <div className="flex flex-col h-full bg-bg-jet/80 backdrop-blur-sm">
                    <main className="flex-grow overflow-y-auto" onScroll={handleScroll}>
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
                            onSend={(q) => handleSend(q)} 
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
    if (audioRef.current && !audioSourceRef.current) {
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            
            const source = audioCtx.createMediaElementSource(audioRef.current);
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            
            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;
            audioSourceRef.current = source;
        } catch (e) {
            console.error("Could not create AudioContext:", e);
        }
    }
    return () => {
        if (audioSourceRef.current) {
            audioSourceRef.current.disconnect();
            audioSourceRef.current = null;
        }
        if (analyserRef.current) {
            analyserRef.current.disconnect();
            analyserRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
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
    if (isProcessingSentencesRef.current || sentenceQueueRef.current.length === 0 || !currentPlayingMessageIdRef.current) {
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
                textToSpeech(nextSentence, settings.voiceId).then(url => {
                    sentenceAudioCacheRef.current[nextSentence] = url;
                });
            }
        });


        let url = sentenceAudioCacheRef.current[sentence];
        if (url === undefined || url === null) {
            url = await textToSpeech(sentence, settings.voiceId);
            sentenceAudioCacheRef.current[sentence] = url;
        }


        if (url && currentPlayingMessageIdRef.current) {
            sentenceQueueRef.current.shift();
            audioRef.current.src = url;
            if (audioContextRef.current?.state === 'suspended') {
                await audioContextRef.current.resume();
            }
            await audioRef.current.play();
        } else {
            isProcessingSentencesRef.current = false;
            setTimeout(processVocalStream, 100);
        }
    } catch (error) {
        console.error("SЙ™s oxunarkЙ™n xЙ™ta baЕџ verdi:", sentence, error);
        if (currentPlayingMessageIdRef.current) {
          setMessages(prev => prev.map(m => m.id === currentPlayingMessageIdRef.current ? { ...m, ttsError: 'Səsləndirmə mümkün olmadı.' } : m));
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
    };


    audio.addEventListener('ended', handleAudioEnd);
    return () => audio.removeEventListener('ended', handleAudioEnd);
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


  return (
    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
      {ActiveAnimation && (
        <ActiveAnimation
          scrollOffset={scrollOffset}
          customColor={settings.theme === 'novera' ? (settings.noveraColor || '#000000') : undefined}
        />
      )}
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Sidebar activeView={activeView} setActiveView={setActiveView} onNewChat={clearHistory} themeColor={activeThemeColor} onOpenSession={loadSession} />
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
    </div>
  );
};


export default App;



















