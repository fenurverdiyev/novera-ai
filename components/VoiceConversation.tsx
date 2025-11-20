import React, { useState, useRef, useCallback, useEffect } from 'react';
import { geminiTts } from '../services/geminiTtsService';

export interface VoiceConversationProps {
    isActive: boolean;
    onTranscript?: (transcript: string) => void;
    onVoiceEnd?: () => void;
    voiceId?: string;
    className?: string;
}

interface AudioQueueItem {
    text: string;
    audioUrl: string | null;
    isPlaying: boolean;
    isLoaded: boolean;
}

export const VoiceConversation: React.FC<VoiceConversationProps> = ({
    isActive,
    onTranscript,
    onVoiceEnd,
    voiceId = 'TX3LPaxmHKxFdv7VOQHJ',
    className = ''
}) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [isProcessingAudio, setIsProcessingAudio] = useState(false);
    const [audioQueue, setAudioQueue] = useState<AudioQueueItem[]>([]);
    const [currentPlayingIndex, setCurrentPlayingIndex] = useState(-1);

    const recognitionRef = useRef<any>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const audioUrlsRef = useRef<string[]>([]);
    const isPlayingRef = useRef(false);
    const manualStopRef = useRef(false);

    const cleanupUrls = (urls: string[]) => {
        urls.forEach((u) => { try { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); } catch {} });
    };

    const voiceNameFor = (id?: string): string => {
        const v = (id || '').trim();
        switch (v) {
            case 'Gacrux': return 'Gacrux';
            case 'Fenrir': return 'Fenrir';
            case 'Sulafat': return 'Sulafat';
            case 'Zephyr': return 'Zephyr';
            case 'Charon': return 'Charon';
            case 'Puck': return 'Puck';
            default: return 'Kore';
        }
    };

    // Initialize speech recognition
    useEffect(() => {
        if (('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window)) {
            const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recognition = new SR();
            
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.maxAlternatives = 3;
            let sttLang = (navigator.language || 'en-US');
            try { const s = localStorage.getItem('nov-era-stt-lang'); if (s) sttLang = s; } catch {}
            recognition.lang = sttLang;
            
            recognition.onstart = () => {
                setIsListening(true);
            };
            
            recognition.onresult = (event) => {
                let finalTranscript = '';
                let interimTranscript = '';
                const pickBest = (res: any) => {
                    try {
                        let best: any = res[0] || {};
                        for (let j = 1; j < res.length; j++) {
                            if ((res[j]?.confidence || 0) > (best?.confidence || 0)) best = res[j];
                        }
                        return (best?.transcript || '').toString();
                    } catch { return (res?.[0]?.transcript || '').toString(); }
                };
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const res = event.results[i];
                    const t = pickBest(res);
                    if (res.isFinal) { finalTranscript += (t + ' '); }
                    else { interimTranscript += (t + ' '); }
                }
                const fullTranscript = (finalTranscript || interimTranscript).trim();
                setTranscript(fullTranscript);
                onTranscript?.(fullTranscript);
            };
            
            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setIsListening(false);
                if (!manualStopRef.current && isActive) {
                    try { recognition.stop(); } catch {}
                    try { recognition.start(); setIsListening(true); } catch {}
                }
            };
            
            recognition.onend = () => {
                setIsListening(false);
                if (!manualStopRef.current && isActive) {
                    try { recognition.start(); setIsListening(true); return; } catch {}
                }
                onVoiceEnd?.();
            };
            
            recognitionRef.current = recognition;
        }
        
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, [onTranscript, onVoiceEnd]);

    // Cleanup audio URLs on unmount
    useEffect(() => {
        return () => {
            cleanupUrls(audioUrlsRef.current);
        };
    }, []);

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            setTranscript('');
            manualStopRef.current = false;
            recognitionRef.current.start();
        }
    }, [isListening]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            manualStopRef.current = true;
            recognitionRef.current.stop();
        }
    }, [isListening]);

    const splitIntoSentences = useCallback((text: string): string[] => {
        return text.match(/[^.!?…]+[.!?…]*|[^.!?…]+$/g)?.filter(s => s.trim().length > 0) || [];
    }, []);

    const playNextAudio = useCallback(async () => {
        if (isPlayingRef.current || currentPlayingIndex >= audioQueue.length - 1) {
            return;
        }

        const nextIndex = currentPlayingIndex + 1;
        const nextItem = audioQueue[nextIndex];
        
        if (!nextItem || !audioRef.current) {
            return;
        }

        setCurrentPlayingIndex(nextIndex);
        isPlayingRef.current = true;

        // If audio URL is not ready, wait for it
        if (!nextItem.audioUrl && !nextItem.isLoaded) {
            try {
                const audioUrl = await geminiTts(nextItem.text, { voiceName: voiceNameFor(voiceId) });
                if (audioUrl) {
                    audioUrlsRef.current.push(audioUrl);
                    setAudioQueue(prev => prev.map((item, index) => 
                        index === nextIndex ? { ...item, audioUrl, isLoaded: true } : item
                    ));
                    
                    if (audioRef.current) {
                        audioRef.current.src = audioUrl;
                        await audioRef.current.play();
                    }
                }
            } catch (error) {
                console.error('Error playing audio:', error);
                isPlayingRef.current = false;
                playNextAudio(); // Try next sentence
            }
        } else if (nextItem.audioUrl && audioRef.current) {
            try {
                audioRef.current.src = nextItem.audioUrl;
                await audioRef.current.play();
            } catch (error) {
                console.error('Error playing audio:', error);
                isPlayingRef.current = false;
                playNextAudio(); // Try next sentence
            }
        }
    }, [audioQueue, currentPlayingIndex, voiceId]);

    const handleAudioEnd = useCallback(() => {
        isPlayingRef.current = false;
        setAudioQueue(prev => prev.map((item, index) => 
            index === currentPlayingIndex ? { ...item, isPlaying: false } : item
        ));
        
        // Play next audio in queue
        setTimeout(() => {
            playNextAudio();
        }, 100);
    }, [currentPlayingIndex, playNextAudio]);

    useEffect(() => {
        const audio = audioRef.current;
        if (audio) {
            audio.addEventListener('ended', handleAudioEnd);
            return () => audio.removeEventListener('ended', handleAudioEnd);
        }
    }, [handleAudioEnd]);

    const speakText = useCallback(async (text: string) => {
        if (!text.trim()) return;

        setIsProcessingAudio(true);
        const sentences = splitIntoSentences(text);
        
        // Create queue items
        const queueItems: AudioQueueItem[] = sentences.map(sentence => ({
            text: sentence.trim(),
            audioUrl: null,
            isPlaying: false,
            isLoaded: false
        }));

        setAudioQueue(queueItems);
        setCurrentPlayingIndex(-1);
        isPlayingRef.current = false;

        // Pre-generate audio for first few sentences
        const preloadCount = Math.min(3, sentences.length);
        for (let i = 0; i < preloadCount; i++) {
            const sentence = sentences[i].trim();
            if (sentence) {
                geminiTts(sentence, { voiceName: voiceNameFor(voiceId) }).then(audioUrl => {
                    if (audioUrl) {
                        audioUrlsRef.current.push(audioUrl);
                        setAudioQueue(prev => prev.map((item, index) => 
                            index === i ? { ...item, audioUrl, isLoaded: true } : item
                        ));
                    }
                });
            }
        }

        setIsProcessingAudio(false);
        
        // Start playing
        setTimeout(() => {
            playNextAudio();
        }, 500);
    }, [splitIntoSentences, voiceId, playNextAudio]);

    const stopSpeaking = useCallback(() => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.src = '';
        }
        
        isPlayingRef.current = false;
        setCurrentPlayingIndex(-1);
        setAudioQueue([]);
        setIsProcessingAudio(false);
        
        // Cleanup audio URLs
        cleanupUrls(audioUrlsRef.current);
        audioUrlsRef.current = [];
    }, []);

    // Auto-start listening when active
    useEffect(() => {
        if (isActive && !isListening) {
            startListening();
        } else if (!isActive && isListening) {
            stopListening();
            stopSpeaking();
        }
    }, [isActive, isListening, startListening, stopListening, stopSpeaking]);

    const getAudioVisualization = () => {
        const playingItem = audioQueue[currentPlayingIndex];
        if (!playingItem) return null;

        return (
            <div className="flex items-center space-x-1">
                {[...Array(5)].map((_, i) => (
                    <div
                        key={i}
                        className="w-1 bg-blue-400 rounded-full animate-pulse"
                        style={{
                            height: `${Math.random() * 20 + 10}px`,
                            animationDelay: `${i * 0.1}s`
                        }}
                    />
                ))}
            </div>
        );
    };

    return (
        <div className={`voice-conversation ${className}`}>
            <audio ref={audioRef} crossOrigin="anonymous" />
            
            {/* Voice Status Indicator */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                    {isListening && (
                        <div className="flex items-center space-x-2 text-green-400">
                            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="text-sm">Dinləyir...</span>
                        </div>
                    )}
                    
                    {isProcessingAudio && (
                        <div className="flex items-center space-x-2 text-blue-400">
                            <div className="animate-spin w-3 h-3 border border-blue-400 border-t-transparent rounded-full"></div>
                            <span className="text-sm">Səs hazırlanır...</span>
                        </div>
                    )}
                    
                    {currentPlayingIndex >= 0 && (
                        <div className="flex items-center space-x-2 text-blue-400">
                            {getAudioVisualization()}
                            <span className="text-sm">Danışır...</span>
                        </div>
                    )}
                </div>
                
                <div className="flex space-x-2">
                    {isListening ? (
                        <button
                            onClick={stopListening}
                            className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                        >
                            Dayandır
                        </button>
                    ) : (
                        <button
                            onClick={startListening}
                            className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 transition-colors"
                        >
                            Başla
                        </button>
                    )}
                    
                    {currentPlayingIndex >= 0 && (
                        <button
                            onClick={stopSpeaking}
                            className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 transition-colors"
                        >
                            Səsi dayandır
                        </button>
                    )}
                </div>
            </div>
            
            {/* Transcript Display */}
            {transcript && (
                <div className="bg-bg-onyx/50 rounded-lg p-3 mb-4">
                    <p className="text-text-main text-sm">{transcript}</p>
                </div>
            )}
            
            {/* Audio Queue Status */}
            {audioQueue.length > 0 && (
                <div className="bg-bg-onyx/30 rounded-lg p-3">
                    <div className="text-xs text-text-sub mb-2">
                        Səs növbəsi: {currentPlayingIndex + 1} / {audioQueue.length}
                    </div>
                    <div className="space-y-1">
                        {audioQueue.map((item, index) => (
                            <div
                                key={index}
                                className={`text-xs p-2 rounded ${
                                    index === currentPlayingIndex
                                        ? 'bg-blue-600/30 text-blue-300'
                                        : index < currentPlayingIndex
                                        ? 'bg-green-600/20 text-green-400'
                                        : 'bg-gray-600/20 text-gray-400'
                                }`}
                            >
                                {item.text}
                                {index === currentPlayingIndex && ' 🔊'}
                                {index < currentPlayingIndex && ' ✓'}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VoiceConversation;
