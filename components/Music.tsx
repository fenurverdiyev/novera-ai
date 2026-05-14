import React, { useState, useEffect } from 'react';
import { MusicIcon, SendIcon, LoadingSpinner, PlayIcon, PauseIcon, DownloadIcon } from './Icons';

export const Music: React.FC<{ language?: string }> = ({ language = 'az' }) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'pending' | 'completed' | 'failed'>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [showLyrics, setShowLyrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const t = {
    az: {
      title: 'Musiqi Yaradıcısı',
      subtitle: 'Süni intellekt ilə xəyalınızdakı melodiyanı yaradın',
      placeholder: 'Məsələn: dark trap beat with piano...',
      generate: 'Yarat',
      generating: 'Musiqi yaradılır...',
      ready: 'Musiqi hazırdır!',
      error: 'Xəta baş verdi',
      download: 'Yüklə'
    },
    en: {
      title: 'Music Creator',
      subtitle: 'Create the melody of your dreams with AI',
      placeholder: 'e.g.: dark trap beat with piano...',
      generate: 'Generate',
      generating: 'Generating music...',
      ready: 'Music is ready!',
      error: 'An error occurred',
      download: 'Download'
    }
  }[language === 'az' ? 'az' : 'en'];

  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);

  const toggleInstrument = (name: string) => {
    setSelectedInstruments(prev => 
      prev.includes(name) ? prev.filter(i => i !== name) : [...prev, name]
    );
  };

  const toggleMood = (name: string) => {
    setSelectedMoods(prev => 
      prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
    );
  };

  const handleGenerate = async () => {
    if (!prompt.trim() && selectedInstruments.length === 0 && selectedMoods.length === 0) return;
    
    setIsGenerating(true);
    setError(null);
    setStatus('pending');
    setAudioUrl(null);

    try {
      // Combine everything into a perfect prompt
      let fullPromptText = prompt.trim();
      const parts = [];
      if (selectedInstruments.length > 0) parts.push(`Instruments: ${selectedInstruments.join(', ')}`);
      if (selectedMoods.length > 0) parts.push(`Style/Mood: ${selectedMoods.join(', ')}`);
      if (lyrics.trim()) parts.push(`Vibe/Lyrics: ${lyrics.trim()}`);
      
      const combinedPrompt = `${fullPromptText} ${parts.join('. ')}`.trim();

      const res = await fetch('/replicate-music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prompt: combinedPrompt, 
          lyrics_type: 'generate'
        })
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('API Error Response:', text);
        throw new Error(`Xəta (${res.status}): ${text.substring(0, 200)}`);
      }
      
      const data = await res.json();
      console.log('Generate Response:', data);
      
      if (data.task_id) {
        setTaskId(data.task_id);
      } else {
        throw new Error('API cavabında Task ID tapılmadı');
      }
    } catch (err: any) {
      console.error('Music generation error:', err);
      setError(err.message || 'Bilinməyən xəta baş verdi');
      setIsGenerating(false);
      setStatus('failed');
    }
  };

  useEffect(() => {
    let interval: number | null = null;

    if (taskId && status === 'pending') {
      interval = window.setInterval(async () => {
        try {
          const res = await fetch(`/replicate-music/status/${taskId}`);
          const data = await res.json();

          if (data.status === 'completed' || data.status === 'succeeded' || data.audio_url) {
            setAudioUrl(data.audio_url);
            setStatus('completed');
            setIsGenerating(false);
            if (interval) clearInterval(interval);
          } else if (data.status === 'failed' || data.error) {
            setError(data.error || 'Musiqi yaradılması uğursuz oldu (API xətası)');
            setIsGenerating(false);
            setStatus('failed');
            if (interval) clearInterval(interval);
          }
        } catch (err: any) {
          console.error('Polling error:', err);
          setError(`Status yoxlanarkən xəta: ${err.message}`);
          setIsGenerating(false);
          setStatus('failed');
          if (interval) clearInterval(interval);
        }
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [taskId, status]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 py-12 text-white overflow-y-auto">
      <div className="max-w-2xl w-full space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-3xl bg-accent/10 ring-1 ring-accent/30 shadow-[0_0_30px_rgba(88,166,255,0.2)] mb-8">
            <MusicIcon className="w-12 h-12 text-accent animate-pulse" />
          </div>
        </div>

        <div className="space-y-8 w-full max-w-lg md:max-w-3xl">
          {/* Main Input Area */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-accent/50 to-purple-500/50 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
            <div className="relative bg-white/5 backdrop-blur-2xl p-4 md:p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4">
              <div className="flex flex-col gap-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Mahnının təsvirini və ya mövzusunu yazın... (Məs: Günəşli bir gün üçün şən musiqi)"
                  className="w-full h-24 md:h-28 bg-transparent border-none outline-none text-base md:text-lg placeholder:text-white/20 resize-none"
                  disabled={isGenerating}
                />
                
                <div className="flex items-center justify-between pt-4 border-t border-white/5">
                  <div className="flex items-center gap-2 text-xs text-white/40">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                    AI Studio Hazırdır
                  </div>
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating || !prompt.trim()}
                    className={`px-8 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                      isGenerating 
                      ? 'bg-white/5 text-white/40 cursor-not-allowed' 
                      : 'bg-accent text-white hover:bg-accent/80 shadow-lg shadow-accent/20'
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <LoadingSpinner className="w-5 h-5" />
                        <span>Hazırlanır...</span>
                      </>
                    ) : (
                      <>
                        <SendIcon className="w-5 h-5" />
                        <span>Musiqi Yarat</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Categories Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Instruments Category */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                <span className="w-1 h-4 bg-accent rounded-full shadow-[0_0_8px_rgba(88,166,255,0.6)]"></span>
                Alətlər
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Piano', icon: '🎹' },
                  { name: 'Guitar', icon: '🎸' },
                  { name: 'Violin', icon: '🎻' },
                  { name: 'Saxophone', icon: '🎷' },
                  { name: 'Drums', icon: '🥁' },
                  { name: 'Electric', icon: '⚡' }
                ].map(item => {
                  const isSelected = selectedInstruments.includes(item.name);
                  return (
                    <button
                      key={item.name}
                      onClick={() => toggleInstrument(item.name)}
                      className={`px-4 py-2.5 rounded-2xl border transition-all flex items-center gap-2 active:scale-95 ${
                        isSelected 
                        ? 'bg-accent/20 border-accent text-accent shadow-[0_0_15px_rgba(88,166,255,0.3)]' 
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <span>{item.icon}</span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mood/Genre Category */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white/40 uppercase tracking-widest px-1 flex items-center gap-2">
                <span className="w-1 h-4 bg-purple-500 rounded-full shadow-[0_0_8px_rgba(168,85,247,0.6)]"></span>
                Janr və Əhval
              </h4>
              <div className="flex flex-wrap gap-2">
                {[
                  { name: 'Lo-fi', mood: '☕' },
                  { name: 'Cinematic', mood: '🎬' },
                  { name: 'Energetic', mood: '🔥' },
                  { name: 'Sad', mood: '🌧️' },
                  { name: 'Jazz', mood: '🎷' },
                  { name: 'Dark Trap', mood: '🌃' },
                  { name: 'Cyberpunk', mood: '🤖' }
                ].map(item => {
                  const isSelected = selectedMoods.includes(item.name);
                  return (
                    <button
                      key={item.name}
                      onClick={() => toggleMood(item.name)}
                      className={`px-4 py-2.5 rounded-2xl border transition-all flex items-center gap-2 active:scale-95 ${
                        isSelected 
                        ? 'bg-purple-500/20 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]' 
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      <span>{item.mood}</span>
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Optional Lyrics / Details */}
          <div className="pt-4 px-2">
            <button 
              onClick={() => setShowLyrics(!showLyrics)}
              className="group flex items-center gap-3 text-sm text-white/30 hover:text-white transition-colors"
            >
              <div className={`w-10 h-1 rounded-full transition-all ${showLyrics ? 'bg-accent w-16' : 'bg-white/10'}`}></div>
              <span>{showLyrics ? 'Detalları Gizlə' : 'Daha çox detal əlavə et (Könüllü)'}</span>
            </button>
            
            {showLyrics && (
              <div className="mt-4 animate-in fade-in slide-in-from-top-4 duration-500">
                <textarea
                  value={lyrics}
                  onChange={(e) => setLyrics(e.target.value)}
                  placeholder="Mahnı üçün xüsusi sözlər və ya əlavə detallar (vokal tərzi, temp və s.)..."
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-3xl p-5 text-sm md:text-base outline-none focus:border-accent/30 transition-all placeholder:text-white/10 resize-none shadow-inner"
                  disabled={isGenerating}
                />
              </div>
            )}
          </div>
        </div>

        {status === 'pending' && (
          <div className="text-center space-y-4 animate-in zoom-in-95 duration-500">
            <div className="flex justify-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:-0.3s]"></div>
              <div className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:-0.15s]"></div>
              <div className="w-2 h-2 rounded-full bg-accent animate-bounce"></div>
            </div>
            <p className="text-sm text-white/50 tracking-widest uppercase font-semibold">
              Musiqi parçaları hazırlanır... təxminən 30-60 saniyə çəkə bilər
            </p>
          </div>
        )}

        {audioUrl && (
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-[2rem] p-6 md:p-8 space-y-6 animate-in slide-in-from-top-4 duration-500 shadow-inner w-full max-w-lg md:max-w-2xl">
            <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="text-lg md:text-xl font-semibold text-accent flex items-center justify-center sm:justify-start gap-2">
                  <PlayIcon className="w-5 h-5 fill-accent" />
                  {t.ready}
                </h3>
                <p className="text-xs md:text-sm text-white/40 italic line-clamp-2">"{prompt}"</p>
              </div>
              <a 
                href={audioUrl} 
                download="novera-ai-music.mp3"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 transition-all text-sm font-medium w-full sm:w-auto justify-center"
              >
                <DownloadIcon className="w-5 h-5" />
                <span>{t.download}</span>
              </a>
            </div>
            
            <div className="w-full">
              <audio 
                controls 
                autoPlay
                src={audioUrl} 
                className="w-full h-12 rounded-full opacity-90 hover:opacity-100 transition-opacity"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-6 rounded-2xl text-center animate-shake space-y-4">
            <p className="flex items-center justify-center gap-2 font-medium">
              <span className="text-xl">⚠️</span> {error}
            </p>
            <button 
              onClick={handleGenerate}
              className="px-6 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-sm transition-colors border border-rose-500/30"
            >
              Yenidən cəhd et
            </button>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.3s ease-in-out 3; }
        
        audio::-webkit-media-controls-panel {
          background-color: rgba(30, 41, 59, 0.9);
        }
        audio::-webkit-media-controls-current-time-display,
        audio::-webkit-media-controls-time-remaining-display {
          color: #fff;
        }
      `}} />
    </div>
  );
};
