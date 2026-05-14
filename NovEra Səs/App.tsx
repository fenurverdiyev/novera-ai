import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { Orb } from './components/Orb';
import { ActionButtons } from './components/ActionButtons';
import { MessageDisplay } from './components/MessageDisplay';
import { CameraView } from './components/CameraView';
import { ProxyBrowserOverlay } from './components/ProxyBrowserOverlay';
import type { ConversationTurn, GroundingChunk, SearchResultItem } from './types';
import { createPcmBlob, decodeAudioData, base64Encode } from './utils/audio';

// Assume API keys are provided via Vite env (VITE_*) or process.env fallback
const API_KEY = (import.meta as any).env?.VITE_GEMINI_API_KEY || (import.meta as any).env?.VITE_API_KEY || (process as any).env?.GEMINI_API_KEY || (process as any).env?.API_KEY;
const SERPER_API_KEY = (import.meta as any).env?.VITE_SERPER_API_KEY || (process as any).env?.SERPER_API_KEY;

if (!API_KEY) {
  alert("GEMINI API key is not set. Please add VITE_GEMINI_API_KEY to your .env.local file.");
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'perform_web_search',
    description: 'Get up-to-date information from the web for general knowledge questions or recent events.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The search query to look up.' } },
      required: ['query'],
    },
  },
  {
    name: 'find_images',
    description: 'Find images based on a user query.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The image search query.' } },
      required: ['query'],
    },
  },
  {
    name: 'find_videos',
    description: 'Find videos based on a user query.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The video search query.' } },
      required: ['query'],
    },
  },
   {
    name: 'find_products',
    description: 'Find products for shopping based on a user query.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The product search query.' } },
      required: ['query'],
    },
  },
  {
    name: 'find_places',
    description: 'Find places or locations of interest based on a user query.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The location search query (e.g., "nearby cafes").' } },
      required: ['query'],
    },
  },
  {
    name: 'find_on_map',
    description: 'Find a specific location on a map.',
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING, description: 'The location to find on the map.' } },
      required: ['query'],
    },
  },
  {
    name: 'find_song_by_lyrics',
    description: 'Find a song by its lyrics.',
    parameters: {
      type: Type.OBJECT,
      properties: { lyrics: { type: Type.STRING, description: 'The lyrics of the song to find.' } },
      required: ['lyrics'],
    },
  },
];


const App: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'listening' | 'processing' | 'speaking'>('idle');
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [sources, setSources] = useState<GroundingChunk[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isSearchEnabled, setIsSearchEnabled] = useState(true); // Default to true for better functionality
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [selectedVoice, setSelectedVoice] = useState('Zephyr');
  const [showBrowser, setShowBrowser] = useState(false);

  // Mute state: single mic click toggles this when session is active
  const [isMuted, setIsMuted] = useState(false);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const isMutedRef = useRef(false);
  const isStartingRef = useRef(false);
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  
  const nextAudioStartTimeRef = useRef(0);
  const audioBufferSources = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stopAllAudio = useCallback(() => {
    if (outputAudioContextRef.current) {
        audioBufferSources.current.forEach(source => {
            try {
                source.stop();
            } catch (e) {
                // Ignore errors from stopping already stopped sources
            }
        });
        audioBufferSources.current.clear();
        nextAudioStartTimeRef.current = 0;
    }
  }, []);

  const cleanup = useCallback(async () => {
    console.log("Cleaning up resources...");
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }

    if (mediaStreamSourceRef.current) {
      mediaStreamSourceRef.current.disconnect();
      mediaStreamSourceRef.current = null;
    }
    
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        await outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }

    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch (e) {
            console.error("Error closing session:", e);
        }
        sessionPromiseRef.current = null;
    }

    stopAllAudio();
    setStatus('idle');
    setIsCameraOn(false);
    setIsMuted(false);
  }, [stopAllAudio]);

  const executeSearch = async (type: 'images' | 'videos' | 'shopping' | 'places' | 'maps' | 'music', query: string) => {
    if (!SERPER_API_KEY) {
        console.error("Serper API key not configured.");
        setConversation(prev => [...prev, {author: 'system', text: "Search is not configured."}]);
        return "Search is not configured.";
    }

    try {
        const endpoint = type === 'music' ? 'search' : type;
        const url = `https://corsproxy.io/?https://google.serper.dev/${endpoint}`;
        const searchQuery = type === 'music' ? `song with lyrics "${query}"` : query;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: searchQuery }),
        });

        if (!response.ok) throw new Error(`Serper API request failed with status ${response.status}`);
        
        const data = await response.json();
        
        let results: SearchResultItem[] = [];
        if (type === 'images' && data.images) {
            results = data.images.slice(0, 10).map((img: any) => ({ type: 'image', imageUrl: img.imageUrl, title: img.title, source: img.link }));
        } else if (type === 'videos' && data.videos) {
            results = data.videos.slice(0, 5).map((vid: any) => ({ type: 'video', imageUrl: vid.imageUrl, title: vid.title, source: vid.link, duration: vid.duration }));
        } else if (type === 'shopping' && data.shopping) {
            results = data.shopping.slice(0, 5).map((item: any) => ({ type: 'product', imageUrl: item.imageUrl, title: item.title, source: item.link, price: item.price, rating: item.rating }));
        } else if (type === 'places' && data.places) {
             results = data.places.slice(0, 5).map((place: any) => ({ type: 'location', title: place.title, address: place.address, source: place.link || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.title + ", " + place.address)}` }));
        } else if (type === 'maps' && data.maps) {
            results = data.maps.slice(0, 5).map((map: any) => ({ type: 'map', imageUrl: map.imageUrl, title: map.title, address: map.address, source: map.link }));
        } else if (type === 'music' && data.organic) {
            const song = data.organic[0];
            if (song) {
                 results = [{
                    type: 'music',
                    title: song.title,
                    artist: song.snippet?.split('·')[1]?.trim() || 'Unknown Artist',
                    source: song.link,
                    imageUrl: '' // Image would require another API call, leave blank for now
                }];
                setSearchResults(results);
                return `Found song: ${song.title}`;
            }
        }
        
        setSearchResults(results);
        return `Found ${results.length} ${type} results.`;

    } catch (error) {
        console.error(`Error during ${type} search:`, error);
        setConversation(prev => [...prev, {author: 'system', text: `Error during search.`}]);
        return "An error occurred during search.";
    }
  };

  const executeTextSearch = useCallback(async (query: string): Promise<string> => {
    if (!SERPER_API_KEY) {
        console.error("Serper API key not configured.");
        return "Search is not configured.";
    }
    try {
        const url = `https://corsproxy.io/?https://google.serper.dev/search`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: query }),
        });
        if (!response.ok) throw new Error(`Serper text search failed with status ${response.status}`);
        
        const data = await response.json();
        const snippets = data.organic?.slice(0, 5).map((item: any) => item.snippet).join('\n');
        
        const searchSources: GroundingChunk[] = data.organic?.slice(0, 5).map((item: any) => ({
            web: { uri: item.link, title: item.title }
        }));
        setSources(searchSources);

        return snippets || "No information found.";

    } catch (error) {
        console.error(`Error during text search:`, error);
        return "An error occurred during the search.";
    }
  }, []);


  const handleMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.toolCall) {
        for (const fc of message.toolCall.functionCalls) {
            let result = "OK"; // Default result
            setSources([]);
            setSearchResults([]);

            const functionMap: { [key: string]: (query: string) => Promise<string> } = {
                'perform_web_search': (query) => executeTextSearch(query),
                'find_images': (query) => executeSearch('images', query),
                'find_videos': (query) => executeSearch('videos', query),
                'find_products': (query) => executeSearch('shopping', query),
                'find_places': (query) => executeSearch('places', query),
                'find_on_map': (query) => executeSearch('maps', query),
                'find_song_by_lyrics': (lyrics) => executeSearch('music', lyrics),
            };

            const queryArg = fc.args.query || fc.args.lyrics;

                        if (functionMap[fc.name] && queryArg && typeof queryArg === 'string') {
                 setConversation(prev => [...prev, { author: 'system', text: `Axtarılır: ${queryArg}...` }]);
                 result = await functionMap[fc.name](queryArg);
            }

            sessionPromiseRef.current?.then((session) => {
                session.sendToolResponse({
                    functionResponses: { id: fc.id, name: fc.name, response: { result: result } }
                });
            });
        }
    }

    if (message.serverContent?.outputTranscription) {
      const text = message.serverContent.outputTranscription.text;
      currentOutputTranscriptionRef.current += text;
      setConversation(prev => {
          const lastTurn = prev[prev.length - 1];
          if (lastTurn?.author === 'model') {
            return [...prev.slice(0, -1), { ...lastTurn, text: currentOutputTranscriptionRef.current }];
          }
          return [...prev, { author: 'model', text: currentOutputTranscriptionRef.current }];
      });
    }

    if (message.serverContent?.inputTranscription) {
      // Clear previous search results and sources when user starts speaking
      setSources([]);
      setSearchResults([]);
      const text = message.serverContent.inputTranscription.text;
      currentInputTranscriptionRef.current += text;
      setConversation(prev => {
        const lastTurn = prev[prev.length - 1];
        if (lastTurn?.author === 'user') {
          return [...prev.slice(0, -1), { ...lastTurn, text: currentInputTranscriptionRef.current }];
        }
        return [...prev, { author: 'user', text: currentInputTranscriptionRef.current }];
      });
    }
    
    if (message.serverContent?.groundingMetadata?.groundingChunks) {
        setSources(message.serverContent.groundingMetadata.groundingChunks);
    }

    if (message.serverContent?.turnComplete) {
      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';
    }

    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (audioData) {
      if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const context = outputAudioContextRef.current;
      const decodedData = atob(audioData);
      const uint8Array = new Uint8Array(decodedData.length);
      for (let i = 0; i < decodedData.length; ++i) {
        uint8Array[i] = decodedData.charCodeAt(i);
      }
      
      const audioBuffer = await decodeAudioData(uint8Array, context, 24000, 1);
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);

      source.onended = () => {
          audioBufferSources.current.delete(source);
      };

      const currentTime = context.currentTime;
      const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
      source.start(startTime);
      nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
      audioBufferSources.current.add(source);
    }
     if (message.serverContent?.interrupted) {
        stopAllAudio();
     }

  }, [stopAllAudio, executeTextSearch]);

  const startSession = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    if (!API_KEY) {
        console.error("API key is not available.");
        setStatus('idle');
        isStartingRef.current = false;
        return;
    }
    
    // Ensure any stale audio/session resources are fully cleaned before a fresh start
    try {
      if (audioContextRef.current || outputAudioContextRef.current || mediaStreamRef.current || scriptProcessorRef.current || mediaStreamSourceRef.current || sessionPromiseRef.current) {
        await cleanup();
      }
    } catch {}

    setStatus('connecting');
    setConversation([]);
    setSources([]);
    setSearchResults([]);

    try {
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        // Prepare microphone immediately within user gesture to satisfy mobile policies
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        try { if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume(); } catch {}
        try {
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
            scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current.onaudioprocess = (event) => {
                if (isMutedRef.current) return; // do not send audio while muted
                const inputData = event.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current.destination);
        } catch (err) {
            console.error("Error getting user media. Please ensure microphone permissions are granted.", err);
            setConversation(prev => [...prev, {author: 'system', text: "Microphone access denied or unavailable."}]);
            if (audioContextRef.current) {
                try { await audioContextRef.current.close(); } catch {}
                audioContextRef.current = null;
            }
            isStartingRef.current = false;
            setStatus('idle');
            return;
        }

       const systemInstruction = `You are NovEra, a helpful and friendly multimodal AI assistant by the NovEra company. Always introduce yourself as NovEra. You are multilingual; respond in the user's language, understanding colloquialisms. Keep answers concise.

**FUNCTION CALLING RULES (CRITICAL):**
You have access to several functions. You MUST call the appropriate function when the user's intent matches. Do NOT describe what you will do; just call the function.

1.  **'perform_web_search'**: Use for general knowledge, recent events, or text-based questions.
    *   User (AZ): "Bu gün dolların məzənnəsi nə qədərdir?" -> Call \`perform_web_search({ query: "dolların məzənnəsi" })\`
    *   User (AZ): "Ən son xəbərlər nədir?" -> Call \`perform_web_search({ query: "ən son xəbərlər" })\`

2.  **'find_images'**: Use ONLY when the user explicitly asks for images, pictures, or photos.
    *   User (AZ): "Qarabağ atlarının şəkillərini tap" -> Call \`find_images({ query: "Qarabağ atları" })\`
    *   User (AZ): "Dolların şəkli" -> Call \`find_images({ query: "Dollar" })\`

3.  **'find_videos'**: Use ONLY when the user asks for videos or clips.
    *   User (AZ): "Formula 1 videolarını göstər" -> Call \`find_videos({ query: "Formula 1" })\`

4.  **'find_products'**: Use when the user expresses intent to buy something or asks for product prices.
    *   User (AZ): "iPhone 15 almaq istəyirəm" -> Call \`find_products({ query: "iPhone 15" })\`

5.  **'find_places'**: Use for finding nearby locations, restaurants, cafes, etc.
    *   User (AZ): "Yaxınlıqdakı kafeləri göstər" -> Call \`find_places({ query: "yaxınlıqdakı kafelər" })\`

6.  **'find_on_map'**: Use when the user asks to see something on a map.
    *   User (AZ): "Xəritədə Qız Qalasını tap" -> Call \`find_on_map({ query: "Qız Qalası" })\`
    *   User (AZ): "İçərişəhərin xəritəsi" -> Call \`find_on_map({ query: "İçərişəhər" })\`

7.  **'find_song_by_lyrics'**: Use when the user provides lyrics and asks to identify the song.
    *   User (AZ): "Bu hansı mahnıdır: 'gecələr keçir yuxusuz'" -> Call \`find_song_by_lyrics({ lyrics: "gecələr keçir yuxusuz" })\`
    *   User (EN): "Find song with lyrics 'we will rock you'" -> Call \`find_song_by_lyrics({ lyrics: "we will rock you" })\``;

        const sessionConfig: any = {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
            },
            systemInstruction: systemInstruction,
            tools: isSearchEnabled ? [{ functionDeclarations }] : [],
        };

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-3.1-flash-lite-preview',
            callbacks: {
                onopen: async () => {
                    console.log('Session opened.');
                    setStatus('listening');
                },
                onmessage: handleMessage,
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    setConversation(prev => [...prev, {author: 'system', text: `Error: ${e.message}`}]);
                    cleanup();
                },
                onclose: (e: CloseEvent) => {
                    console.log('Session closed.');
                    cleanup();
                },
            },
            config: sessionConfig,
        });
        await sessionPromiseRef.current;
    } catch (error) {
        console.error('Failed to start session:', error);
        setStatus('idle');
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setConversation([{author: 'system', text: `Failed to connect: ${errorMessage}`}]);
    } finally {
        isStartingRef.current = false;
    }
  }, [handleMessage, cleanup, selectedVoice, isSearchEnabled]);

  const handleMicClick = async () => {
    if (status === 'idle') {
      // Attempt to resume any suspended contexts before starting
      try { if (audioContextRef.current && audioContextRef.current.state === 'suspended') await audioContextRef.current.resume(); } catch {}
      try { if (outputAudioContextRef.current && outputAudioContextRef.current.state === 'suspended') await outputAudioContextRef.current.resume(); } catch {}
      startSession();
      return;
    }
    // Session active: toggle mute/unmute
    setIsMuted((m) => !m);
  };

  const handleCameraClick = () => {
    if (status === 'idle') {
      alert("Please start a session with the microphone first.");
      return;
    }
    setIsCameraOn(prev => !prev);
  };
  
  const handleCameraFlip = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      // If only one camera, still attempt flip (some browsers map facingMode internally)
      setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
      if (videoInputs.length <= 1) return;
    } catch (e) {
      console.warn('Camera flip may not be supported on this device.', e);
    }
  };

  const handleVoiceChange = (voice: string) => {
    setSelectedVoice(voice);
  };
  
  const handleToggleSearch = () => {
    setIsSearchEnabled(prev => !prev);
  }

  const handleFrame = useCallback(async (blob: Blob | null) => {
    if (blob) {
        const base64Data = await base64Encode(blob);
        sessionPromiseRef.current?.then((session) => {
          session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
        });
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Mobile reliability: cleanup when page is hidden or being unloaded
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') { cleanup(); } };
    const onHide = () => { cleanup(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [cleanup]);

  // Keep ref in sync for fast onaudioprocess checks
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  return (
    <div className="fixed inset-0 w-full h-full font-sans text-white bg-transparent flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="relative z-10 flex flex-col items-center justify-between w-full h-full">
        <header className="w-full h-12"></header>
        
        <main className="relative flex items-center justify-center flex-grow w-full">
                    <div className={`relative h-64 sm:h-80 transition-[width] duration-500 ease-in-out ${isCameraOn ? 'w-full max-w-xl' : 'w-56 sm:w-64'}`}>
             {isCameraOn && <CameraView onFrame={handleFrame} facingMode={facingMode} />}
            <Orb status={status} isCameraOn={isCameraOn} />
          </div>
        </main>

                <footer className="w-full max-w-2xl mx-auto space-y-4 flex flex-col items-center">
          <MessageDisplay conversation={conversation} sources={sources} searchResults={searchResults} status={status} />
          <ActionButtons
            status={status}
            isCameraOn={isCameraOn}
            isSearchEnabled={isSearchEnabled}
            selectedVoice={selectedVoice}
            isMuted={isMuted}
            isRecording={status === 'listening' && !isMuted}
            onMicClick={handleMicClick}
            onCameraClick={handleCameraClick}
            onCameraFlip={handleCameraFlip}
            onCancelClick={cleanup}
            onVoiceChange={handleVoiceChange}
            onToggleSearch={handleToggleSearch}
            onOpenBrowser={() => setShowBrowser(true)}
          />
        </footer>
      </div>
      <ProxyBrowserOverlay
        url={"https://novera.zachkingrespect.workers.dev/"}
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
      />
    </div>
  );
};

export default App;





