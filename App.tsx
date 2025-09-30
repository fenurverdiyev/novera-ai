import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SearchBar } from './components/SearchBar';
import { MessageDisplay } from './components/MessageDisplay';
import { streamChatQuery, generateRelatedQuestions } from './services/geminiService';
import { textToSpeech, AVAILABLE_VOICES } from './services/elevenLabsService';
import { searchImagesAndVideos } from './services/searchService';
import type { Message, AppView, AppSettings, ToolCall } from './types';
import { Sidebar } from './components/Sidebar';
import { News } from './components/News';
import { Weather } from './components/Weather';
import { Translate } from './components/Translate';
import { Settings } from './components/Settings';
import { VoiceOverlay } from './components/VoiceOverlay';
import { UploadMenu } from './components/UploadMenu';
import { Logo } from './components/Logo';
import { THEMES } from './animations/themes';
import { useDeviceTools } from './hooks/useDeviceTools';
import { LoadingScreen } from './components/LoadingScreen';

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

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('search');
  
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const savedSettings = localStorage.getItem('gemini-insight-settings');
      if (savedSettings) return JSON.parse(savedSettings);
    } catch (error) {
      console.error("Could not parse saved settings:", error);
    }
    return {
      voiceId: AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ',
      theme: 'novera',
    };
  });
  
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isVoiceOverlayOpen, setIsVoiceOverlayOpen] = useState(false);
  const [isUploadMenuOpen, setIsUploadMenuOpen] = useState(false);
  const [liveVocalResponse, setLiveVocalResponse] = useState<{ id: string; text: string; } | null>(null);
  const [scrollOffset, setScrollOffset] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
    if (isAppReady) return;
    const mainTimer = setTimeout(() => setIsAppReady(true), 3000);
    const fallbackTimer = setTimeout(() => { if (!isAppReady) setIsAppReady(true); }, 7000);
    return () => { clearTimeout(mainTimer); clearTimeout(fallbackTimer); };
  }, [isAppReady]);
  
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
        } catch (e) { console.error("Could not create AudioContext:", e); }
    }
    return () => {
        if (audioSourceRef.current) audioSourceRef.current.disconnect();
        if (analyserRef.current) analyserRef.current.disconnect();
        if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close().catch(console.error);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('gemini-insight-settings', JSON.stringify(settings));
      document.body.className = `theme-${settings.theme} font-sans`;
    } catch (error) { console.error("Could not save settings:", error); }
  }, [settings]);

  useEffect(() => {
    const unlockAudio = () => {
      if (audioContextRef.current?.state === 'suspended') audioContextRef.current.resume();
      window.removeEventListener('pointerdown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio);
    return () => window.removeEventListener('pointerdown', unlockAudio);
  }, []);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, isLoading]);

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
    if (isProcessingSentencesRef.current || sentenceQueueRef.current.length === 0 || !currentPlayingMessageIdRef.current) return;
    isProcessingSentencesRef.current = true;
    const sentence = sentenceQueueRef.current[0];
    if (!sentence || !audioRef.current) { isProcessingSentencesRef.current = false; return; }
    try {
        const nextSentences = sentenceQueueRef.current.slice(1, 3);
        nextSentences.forEach(next => {
            if (next && sentenceAudioCacheRef.current[next] === undefined) {
                sentenceAudioCacheRef.current[next] = null;
                textToSpeech(next, settings.voiceId).then(url => { sentenceAudioCacheRef.current[next] = url; });
            }
        });
        let url = sentenceAudioCacheRef.current[sentence];
        if (!url) {
            url = await textToSpeech(sentence, settings.voiceId);
            sentenceAudioCacheRef.current[sentence] = url;
        }
        if (url && currentPlayingMessageIdRef.current) {
            sentenceQueueRef.current.shift();
            audioRef.current.src = url;
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
            await audioRef.current.play();
        } else {
            isProcessingSentencesRef.current = false;
            setTimeout(processVocalStream, 100);
        }
    } catch (error) {
        console.error("TTS Error:", sentence, error);
        if (currentPlayingMessageIdRef.current) setMessages(prev => prev.map(m => m.id === currentPlayingMessageIdRef.current ? { ...m, ttsError: 'Səsləndirmə mümkün olmadı.' } : m));
        sentenceQueueRef.current.shift();
        isProcessingSentencesRef.current = false;
        processVocalStream();
    }
  }, [settings.voiceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handleAudioEnd = () => { isProcessingSentencesRef.current = false; processVocalStream(); };
    audio.addEventListener('ended', handleAudioEnd);
    return () => audio.removeEventListener('ended', handleAudioEnd);
  }, [processVocalStream]);

  const handlePlayAudio = (messageId: string, text: string) => {
    if (playingMessageId === messageId) { stopPlayback(); return; }
    stopPlayback();
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, ttsError: undefined } : m));
    const chunks = chunkText(text);
    if (chunks.length === 0) return;
    sentenceQueueRef.current = chunks;
    currentPlayingMessageIdRef.current = messageId;
    setPlayingMessageId(messageId);
    processVocalStream();
  };

  const handleSend = async (query: string, images?: string[], isVocalQuery: boolean = false) => {
    setActiveView('search');
    setIsVoiceOverlayOpen(false);
    stopPlayback();
    setIsLoading(true);
    const userMessage: Message = { id: Date.now().toString(), role: 'user', text: query, toolCalls: [] };
    const modelMessageId = (Date.now() + 1).toString();
    const initialModelMessage: Message = { id: modelMessageId, role: 'model', text: '', sources: [], related: [], isLoading: true, images: [], videos: [], toolCalls: [] };
    const history = messages.slice(-10);
    setMessages(prev => [...prev, userMessage, initialModelMessage]);
    try {
      let fullResponseText = '';
      let accumulatedToolCalls: ToolCall[] = [];
      let sentenceAccumulator = '';
      const sentenceEndRegex = /[.!?…]/;
      if (isVocalQuery) {
          currentPlayingMessageIdRef.current = modelMessageId;
          setPlayingMessageId(modelMessageId);
      }
      const stream = streamChatQuery(query, history, images);
      for await (const chunk of stream) {
          if (chunk.text) {
              fullResponseText += chunk.text;
              sentenceAccumulator += chunk.text;
              if (isVocalQuery) {
                  let match;
                  while ((match = sentenceAccumulator.match(sentenceEndRegex))) {
                      const sentence = sentenceAccumulator.substring(0, match.index! + 1).trim();
                      if (sentence) {
                          sentenceQueueRef.current.push(sentence);
                          if (!isProcessingSentencesRef.current) processVocalStream();
                      }
                      sentenceAccumulator = sentenceAccumulator.substring(match.index! + 1);
                  }
              }
          }
          if (chunk.toolCalls) {
              const webSearchCalls = chunk.toolCalls.filter(tc => tc.functionCall?.name === 'webSearch');
              if (webSearchCalls.length > 0) {
                  for (const call of webSearchCalls) {
                      const { query, maxImages, maxVideos } = call.functionCall.args;
                      const searchResult = await searchImagesAndVideos(query, maxImages, maxVideos);
                      setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, images: [...(msg.images || []), ...searchResult.images], videos: [...(msg.videos || []), ...searchResult.videos] } : msg));
                  }
              }
              const otherToolParts = chunk.toolCalls.filter(tc => tc.functionCall?.name !== 'webSearch');
              if (otherToolParts.length > 0) {
                  const normalizedCalls = otherToolParts.map(p => ({ name: p.functionCall.name, args: p.functionCall.args })).filter(c => c && c.name);
                  accumulatedToolCalls.push(...normalizedCalls);
                  await executeToolCalls(normalizedCalls);
              }
          }
          setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: fullResponseText, sources: [...(msg.sources || []), ...(chunk.sources || [])] } : msg));
          if (isVocalQuery) setLiveVocalResponse({ id: modelMessageId, text: fullResponseText });
      }
      if (isVocalQuery && sentenceAccumulator.trim()) {
          sentenceQueueRef.current.push(sentenceAccumulator.trim());
          if (!isProcessingSentencesRef.current) processVocalStream();
      }
      if (accumulatedToolCalls.length > 0) await executeToolCalls(accumulatedToolCalls);
      const relatedQuestions = await generateRelatedQuestions(query, fullResponseText);
      setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, related: relatedQuestions } : msg));
    } catch (error) {
      console.error('An error occurred:', error);
      setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false, text: "Üzr istəyirəm, xəta baş verdi." } : msg));
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleFileUploadRequest = (fileType: 'gallery' | 'file') => {
    if (fileInputRef.current) {
        fileInputRef.current.accept = fileType === 'gallery' ? 'image/*,video/*' : '.pdf,.doc,.docx,.txt';
        fileInputRef.current.click();
    }
    setIsUploadMenuOpen(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64Image = e.target?.result as string;
        handleSend("Bu faylı analiz et.", [base64Image]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCloseVoiceOverlay = () => {
    setIsVoiceOverlayOpen(false);
    setLiveVocalResponse(null);
    stopPlayback();
  };
  
  const handleScroll = (event: React.UIEvent<HTMLElement>) => setScrollOffset(event.currentTarget.scrollTop);

  const ActiveAnimation = THEMES.find(t => t.id === settings.theme)?.animation;
  const activeThemeColor = THEMES.find(t => t.id === settings.theme)?.colors[2];

  const renderView = () => {
    switch (activeView) {
        case 'news': return <News themeColor={activeThemeColor} />;
        case 'weather': return <Weather />;
        case 'translate': return <Translate />;
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
                            onLiveConversationClick={() => setIsVoiceOverlayOpen(true)} 
                            onPlusClick={() => setIsUploadMenuOpen(true)}
                        />
                        <p className="text-center text-xs text-text-sub pb-3">
                        NovEra səhv edə bilər.
                        </p>
                    </footer>
                </div>
            )
    }
  };

  if (!isAppReady) {
    return <LoadingScreen />;
  }

  return (
    <div className={`flex h-screen bg-transparent text-text-main transition-opacity duration-700 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
      {ActiveAnimation && <ActiveAnimation scrollOffset={scrollOffset} analyserNode={analyserRef.current} />}
      
      <Sidebar activeView={activeView} setActiveView={setActiveView} themeColor={activeThemeColor} />

      <div className="flex-1 flex flex-col overflow-y-hidden">
        {renderView()}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" />
      <audio ref={audioRef} crossOrigin="anonymous" />
      <VoiceOverlay 
        isOpen={isVoiceOverlayOpen} 
        onClose={handleCloseVoiceOverlay}
        onQuery={(q, i) => handleSend(q, i, true)}
        liveResponse={liveVocalResponse}
        isResponding={isLoading && !!liveVocalResponse}
      />
      <UploadMenu 
        isOpen={isUploadMenuOpen}
        onClose={() => setIsUploadMenuOpen(false)}
        onFileUpload={handleFileUploadRequest}
      />
    </div>
  );
};

export default App;