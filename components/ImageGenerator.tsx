import React, { useState } from 'react';
import { useImageGen } from '../hooks/useImageGen';
import { LoadingSpinner, DownloadIcon, CloseIcon } from './Icons';

export const ImageGenerator: React.FC<{ 
  initialPrompt?: string; 
  onClose?: () => void; 
  autoRun?: boolean;
  onImageClick?: (url: string) => void;
}> = ({ initialPrompt = '', onClose, autoRun = false, onImageClick }) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const { imageUrl, loading, error, generate, reset } = useImageGen();

  React.useEffect(() => {
    if (autoRun && initialPrompt && !imageUrl && !loading) {
      generate(initialPrompt);
    }
  }, [autoRun, initialPrompt]);

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    generate(prompt);
  };

  return (
    <div className="flex flex-col gap-6 p-6 glass-card rounded-[2.5rem] border border-white/10 shadow-2xl animate-fade-in max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-2xl">🎨</span> NovEra Art Studio
        </h2>
        {onClose && (
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <CloseIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {!autoRun && (
        <div className="relative group">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Yaratmaq istədiyiniz şəkli təsvir edin..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400/50 transition-all resize-none h-24"
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className={`absolute right-3 bottom-3 px-6 py-2 rounded-xl font-bold transition-all ${
              loading || !prompt.trim() 
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed' 
                : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(34,211,238,0.3)]'
            }`}
          >
            {loading ? <LoadingSpinner className="w-5 h-5 mx-auto" /> : 'Yarat'}
          </button>
        </div>
      )}

      {error && !imageUrl && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {imageUrl && (
        <div className="relative group rounded-3xl overflow-hidden border border-white/10 shadow-2xl animate-fade-in cursor-zoom-in" onClick={() => onImageClick?.(imageUrl)}>
          <img 
            src={imageUrl} 
            alt={prompt} 
            className="w-full h-auto object-cover"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                const a = document.createElement('a');
                a.href = imageUrl;
                a.download = `novera-art-${Date.now()}.png`;
                a.click();
              }}
              className="p-4 rounded-2xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all scale-90 group-hover:scale-100"
              title="Yüklə"
            >
              <DownloadIcon className="w-6 h-6" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                reset();
              }}
              className="p-4 rounded-2xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all scale-90 group-hover:scale-100"
              title="Yeni"
            >
              <span className="text-xl">🔄</span>
            </button>
          </div>
        </div>
      )}

      {loading && !imageUrl && (
        <div className="py-20 border-2 border-dashed border-cyan-400/20 rounded-3xl flex flex-col items-center justify-center text-cyan-400 gap-4 animate-pulse bg-cyan-400/5">
          <LoadingSpinner className="w-10 h-10" />
          <p className="text-sm font-bold tracking-widest uppercase">Şəkil yaradılır...</p>
        </div>
      )}

      {!imageUrl && !loading && !error && (
        <div className="py-12 border-2 border-dashed border-white/5 rounded-3xl flex flex-col items-center justify-center text-slate-500 gap-4">
          <div className="text-5xl opacity-20">🪄</div>
          <p className="text-sm">Sizin şahəsəriniz burada görünəcək</p>
        </div>
      )}
    </div>
  );
};
