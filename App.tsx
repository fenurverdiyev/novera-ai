import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { MessageDisplay } from './components/MessageDisplay';
import { streamChatQuery, generateRelatedQuestions, answerWithGroundedSearch } from './services/geminiService';
import { textToSpeech, AVAILABLE_VOICES } from './services/elevenLabsService';
import { searchImagesAndVideos } from './services/searchService';
import type { Message, AppView, AppSettings, ToolCall, SearchMode } from './types';
import { Sidebar } from './components/Sidebar';
import { News } from './components/News';
import { Weather } from './components/Weather';
import { Translate } from './components/Translate';
import { Settings } from './components/Settings';
import { VoiceOverlay } from './components/VoiceOverlay';
import { Logo } from './components/Logo';
import { THEMES } from './animations/themes';
import { useDeviceTools } from './hooks/useDeviceTools';
import { Profile } from './components/Profile';

const chunkText = (text: string): string[] => {
  if (!text) return [];
  const sentences = text.match(/[^.!?…]+[.!?…]*|[^.!?…]+$/g) || [];
  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  let currentChunk = "";
  const maxChunkSize = 400;

  for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (trimmedSentence.length === 0) continue;
      if (currentChunk.length > 0 && currentChunk.length + trimmedSentence.length + 1 > maxChunkSize) {
          chunks.push(currentChunk);
          currentChunk = "";
      }
      currentChunk += (currentChunk.length > 0 ? " " : "") + trimmedSentence;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks.length > 0 ? chunks : [text];
};

// Simple visual intent detector for Universe mode
const hasVisualIntent = (q: string): boolean => {
  const s = q.toLowerCase();
  return [
    'şəkil', 'sekil', 'foto', 'fotolar', 'görüntü', 'image', 'images', 'pictures', 'pics',
    'video', 'videolar', 'youtube', 'clip'
  ].some(k => s.includes(k));
};

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
  const [activeView, setActiveView] = useState<AppView>('search');
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
        return { noveraColor: '#0d0f19', ...parsed };
      }
    } catch (error) {
      console.error("Could not parse saved settings:", error);
    }
    return {
      voiceEnabled: true,
      voiceId: AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ',
      theme: 'novera',
      noveraColor: '#0d0f19',
    };
  });
  
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const [liveVocalResponse, setLiveVocalResponse] = useState<{ id: string; text: string; } | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [vocalAudioQueue, setVocalAudioQueue] = useState<string[]>([]);
  const [isVocalPlayback, setIsVocalPlayback] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // For image uploads
  const sentenceQueueRef = useRef<string[]>([]);
  const isProcessingSentencesRef = useRef(false);
  const currentPlayingMessageIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const sentenceAudioCacheRef = useRef<Record<string, string | null>>({});

  const addMessage = useCallback((message: Omit<Message, 'id'>) => {
    setMessages(prev => [...prev, { ...message, id: Date.now().toString() }]);
  }, []);

  const { executeToolCalls } = useDeviceTools(addMessage);

  useEffect(() => {
    // Simulate app loading
    const timer = setTimeout(() => {
        setIsAppReady(true);
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
        }
    }, 3000); // Show loading for 3 seconds
    return () => clearTimeout(timer);
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

  // Initialize Web Audio analyser for visualizations and playback routing
  useEffect(() => {
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

  useEffect(() => {
    try {
      localStorage.setItem('nov-era-chat-history', JSON.stringify(messages));
    } catch {}
  }, [messages]);

  const stopPlayback = useCallback(() => {
      if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = '';
      }
      setPlayingMessageId(null);
      currentPlayingMessageIdRef.current = null;
      sentenceQueueRef.current = [];
      isProcessingSentencesRef.current = false;
      // Keep sentence audio cache for replay (do not clear here)
  }, []);

  const processVocalStream = useCallback(async () => {
    if (isProcessingSentencesRef.current || sentenceQueueRef.current.length === 0 || !currentPlayingMessageIdRef.current) {
        return;
    }

    isProcessingSentencesRef.current = true;
    const sentence = sentenceQueueRef.current[0]; // Cümləni növbədən silmə

    if (!sentence || !audioRef.current) {
        isProcessingSentencesRef.current = false;
        return;
    }

    try {
        // Növbəti cümlələri öncədən yüklə
        const nextSentences = sentenceQueueRef.current.slice(1, 3);
        nextSentences.forEach(nextSentence => {
            if (nextSentence && sentenceAudioCacheRef.current[nextSentence] === undefined) {
                sentenceAudioCacheRef.current[nextSentence] = null; // Yüklənməyə başladığını işarələ
                textToSpeech(nextSentence, settings.voiceId).then(url => {
                    sentenceAudioCacheRef.current[nextSentence] = url;
                });
            }
        });

        let url = sentenceAudioCacheRef.current[sentence];
        if (url === undefined || url === null) { // Əgər cache-də yoxdursa və ya hələ yüklənməyibsə
            url = await textToSpeech(sentence, settings.voiceId);
            sentenceAudioCacheRef.current[sentence] = url;
        }

        if (url && currentPlayingMessageIdRef.current) {
            sentenceQueueRef.current.shift(); // Səs uğurla yükləndikdən sonra cümləni növbədən sil
            audioRef.current.src = url;
            if (audioContextRef.current?.state === 'suspended') {
                await audioContextRef.current.resume();
            }
            await audioRef.current.play();
        } else {
            isProcessingSentencesRef.current = false;
            setTimeout(processVocalStream, 100); // Uğursuz olarsa, bir az sonra yenidən cəhd et
        }
    } catch (error) {
        console.error("Səs oxunarkən xəta baş verdi:", sentence, error);
        // Surface error on the current message
        if (currentPlayingMessageIdRef.current) {
          setMessages(prev => prev.map(m => m.id === currentPlayingMessageIdRef.current ? { ...m, ttsError: 'Səsləndirmə mümkün olmadı. Zəhmət olmasa yenidən cəhd edin.' } : m));
        }
        sentenceQueueRef.current.shift(); // Xətalı cümləni atla
        isProcessingSentencesRef.current = false;
        processVocalStream(); // Növbəti cümləyə keç
    }
}, [settings.voiceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleAudioEnd = () => {
        isProcessingSentencesRef.current = false;
        processVocalStream(); // Növbəti cümləni oxu
    };

    audio.addEventListener('ended', handleAudioEnd);
    return () => audio.removeEventListener('ended', handleAudioEnd);
  }, [processVocalStream]);

  const handlePlayAudio = (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
        stopPlayback();
        return;
    }
    stopPlayback();
    // Clear any previous TTS error on this message when retrying
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ttsError: undefined } : m));
    const chunks = chunkText(text);
    if (chunks.length === 0) return;

    sentenceQueueRef.current = chunks;
    currentPlayingMessageIdRef.current = messageId;
    setPlayingMessageId(messageId);
    processVocalStream();
  };

  const handleSend = async (query: string, images?: string[], isVocalQuery: boolean = false) => {
    // Always close overlay; background TTS will continue
    setIsVoiceOverlayOpen(false);
    stopPlayback();
    setIsLoading(true);
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: query };
    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = {
      id: modelMessageId, role: 'model', text: '', sources: [], related: [],
      isLoading: true, images: [], videos: [],
    };
    
    const history = messages.slice(-10);
    setMessages(prev => [...prev, userMessage, initialModelMessage]);

    try {
      // Grounded mode: Universe or prefix '?' forces web-grounded answer
      const explicitGrounded = query.trim().startsWith('?');
      const groundedQuery = explicitGrounded ? query.trim().slice(1).trim() : query;
      const isGrounded = (searchMode === 'universe') || explicitGrounded;

      if (isGrounded) {
        const { text, sources } = await answerWithGroundedSearch(groundedQuery);
        setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, text, sources } : msg));
        // If visual intent, also fetch visuals via Serper
        if (hasVisualIntent(groundedQuery)) {
          const searchResult = await searchImagesAndVideos(groundedQuery, 6, 3);
          setMessages(prev => prev.map(msg => msg.id === modelMessageId ? {
            ...msg,
            images: searchResult.images,
            videos: searchResult.videos,
          } : msg));
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

      for await (const chunk of stream) {
        if (chunk.text) {
          fullResponseText += chunk.text;
          sentenceAccumulator += chunk.text;

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
              const searchResult = await searchImagesAndVideos(query, maxImages, maxVideos);
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
      
      // On-demand TTS: Do not auto-generate audio. User must press play button under the message.
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

  const handleCloseVoiceOverlay = () => {
    setIsVoiceOverlayOpen(false);
    setLiveVocalResponse(null);
    stopPlayback();
  };
  
  const handleScroll = (event: React.UIEvent<HTMLElement>) => {
    setScrollOffset(event.currentTarget.scrollTop);
  };

  const clearHistory = useCallback(() => {
    setMessages([]);
    try { localStorage.removeItem('nov-era-chat-history'); } catch {}
  }, []);

  const renderView = () => {
    switch (activeView) {
        case 'news': return <News themeColor={activeThemeColor} />;
        case 'weather': return <Weather />;
        case 'translate': return <Translate />;
        case 'profile': return <Profile />;
        case 'settings': return <Settings settings={settings} onSettingsChange={setSettings} themeColor={activeThemeColor} />;
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
                            <MessageDisplay key={msg.id} message={msg} onRelatedQuery={(q) => handleSend(q)} onPlayAudio={handlePlayAudio} playingMessageId={playingMessageId} />
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        )}
                    </main>
                    <footer className="bg-transparent pt-2">
                        <SearchBar 
                            onSend={(q) => handleSend(q)} 
                            isLoading={isLoading} 
                            onVoiceClick={() => setIsVoiceOverlayOpen(true)} 
                            searchMode={searchMode}
                            onChangeMode={setSearchMode}
                            onClearHistory={clearHistory}
                        />
                        <p className="text-center text-xs text-text-sub pb-3">
                        NovEra səhv edə bilər. Vacib məlumatları yoxlamağınız tövsiyə olunur.
                        </p>
                    </footer>
                </div>
            )
    }
  };

  const ActiveAnimation = THEMES.find(t => t.id === settings.theme)?.animation;
  const activeThemeColor = THEMES.find(t => t.id === settings.theme)?.colors[2];

  return (
    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
      {ActiveAnimation && (
        <ActiveAnimation
          scrollOffset={scrollOffset}
          analyserNode={analyserRef.current}
          customColor={settings.theme === 'novera' ? (settings.noveraColor || '#0d0f19') : undefined}
        />
      )}
      <Sidebar activeView={activeView} setActiveView={setActiveView} themeColor={activeThemeColor} />
      <div className="flex-1 flex flex-col overflow-y-hidden">
        {renderView()}
      </div>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleImageUpload}
        className="hidden" 
        accept="image/*"
      />
      <audio ref={audioRef} crossOrigin="anonymous" />
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen} 
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => handleSend(q, i, true)}
        liveResponse={liveVocalResponse}
        isResponding={isLoading && !!liveVocalResponse}
      />
    </div>
  );
};

export default App;
