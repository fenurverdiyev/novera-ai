import React, { useState, useEffect, useCallback } from 'react';
import type { Message, PlaceResult, SearchNewsItem, ShoppingProduct, NewsArticle } from '../types';
import { BotIcon, UserIcon, PlayIcon, CopyIcon, DownloadIcon } from './Icons';
import { HtmlPreview } from './HtmlPreview';
import { ImageGenerator } from './ImageGenerator';
import { SourcePill } from './SourcePill';
import { RelatedQuery } from './RelatedQuery';
import { ProtectedImage } from './ProtectedImage';
import { MapComponent } from './MapComponent';
import { getTranslation, Language } from '../utils/translations';

// Remember which message IDs have already been animated (typing/fade) so it doesn't repeat
const animatedMessageIds = new Set<string>();

type NewsCardArticle = SearchNewsItem | NewsArticle;

const AiAvatarView: React.FC<{ src: string; className?: string }> = ({ src, className = '' }) => {
  return <div className={`rounded-full bg-white/10 overflow-hidden flex items-center justify-center ${className}`}>
    <img src={src} className="w-full h-full object-cover" alt="AI Avatar" />
  </div>;
};

const AiMonogram: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center shadow-inner ${className}`}>
    <span className="font-semibold select-none text-sm">✦</span>
  </div>
);
interface MessageDisplayProps {
  message: Message;
  onRelatedQuery: (query: string) => void;
  language: Language;
}

// Open a URL inside NovEra's in-app browser overlay when possible
const openInNovEra = (url: string) => {
  try {
    if (/^https?:\/\//i.test(url)) {
      window.dispatchEvent(new CustomEvent('nov-era-open-url' as any, { detail: url } as any));
      return;
    }
    // tel:, mailto:, etc. fallback
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    try { window.open(url, '_blank'); } catch { }
  }
};

const formatText = (rawText: string, onOpen: (url: string) => void, onImageClick?: (url: string) => void) => {
  if (!rawText) return null;

  // Gizli məlumat (yaddaş) taglarını ekranda göstərməmək üçün təmizlə
  const text = rawText.replace(/\[\s*SAVE_FACT\s*:[^\]]*\]/gi, '').replace(/\[\s*SAVE_FACT\s*:[^\]]*$/gi, '').trim();

  // Split by code blocks first
  const codeBlockRegex = /```(\w+)?\s*([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    // Add code block
    parts.push({ type: 'code', language: match[1] || 'text', content: match[2] });
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({ type: 'text', content: text.slice(lastIndex) });
  }

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const boldRegex = /\*\*(.*?)\*\*/g;
  const genImageRegex = /\[GEN_IMAGE:\s*(.*?)\]/g;

  return parts.map((part, index) => {
    if (part.type === 'code') {
      if (part.language && part.language.toLowerCase() === 'html') {
        return <HtmlPreview key={index} html={part.content} />;
      }
      // For other code blocks, just render as pre/code for now
      return (
        <div key={index} className="relative group my-6">
          <div className="absolute left-4 -top-3 px-3 py-1 bg-white/10 backdrop-blur-md rounded-lg border border-white/10 text-[10px] font-bold text-cyan-400 uppercase tracking-widest z-10">
            {part.language}
          </div>
          <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
            <button
              onClick={() => {
                const blob = new Blob([part.content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `novera-file-${Date.now()}.${part.language === 'javascript' ? 'js' : part.language === 'python' ? 'py' : part.language === 'html' ? 'html' : 'txt'}`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium transition-colors backdrop-blur-md"
              title="Fayl kimi yüklə"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(part.content);
                const btn = document.getElementById(`copy-btn-${index}`);
                if (btn) btn.innerText = 'Kopyalandı';
                setTimeout(() => { if (btn) btn.innerText = 'Kopyala'; }, 2000);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 text-xs font-medium transition-colors backdrop-blur-md"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              <span id={`copy-btn-${index}`}>Kopyala</span>
            </button>
          </div>
          <pre className="bg-[#0d1117]/80 p-5 pt-12 rounded-3xl overflow-x-auto text-[13px] font-mono text-slate-300 border border-white/5 leading-relaxed custom-scrollbar shadow-2xl backdrop-blur-sm">
            <code>{part.content}</code>
          </pre>
        </div>
      );
    }    // Simple Table detection (Markdown-ish)
    if (part.content.includes('|') && part.content.includes('-|-')) {
      const rows = part.content.trim().split('\n');
      return (
        <div key={index} className="my-6 overflow-x-auto rounded-2xl border border-white/10 shadow-xl relative group">
          <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
            <button
              onClick={() => {
                const ws = window.XLSX.utils.aoa_to_sheet(rows.map(r => r.split('|').filter(c => c.trim())));
                const wb = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(wb, ws, "NovEra_Data");
                window.XLSX.writeFile(wb, `novera-export-${Date.now()}.xlsx`);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-500/20 text-white/80 text-[10px] font-bold uppercase transition-all border border-white/10 backdrop-blur-md"
              title="Excel kimi yüklə"
            >
              Excel
            </button>
            <button
              onClick={() => {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                doc.setFontSize(16);
                doc.text("NovEra Export", 10, 10);
                doc.setFontSize(10);
                rows.forEach((row, i) => {
                  doc.text(row.split('|').join('  '), 10, 20 + (i * 10));
                });
                doc.save(`novera-table-${Date.now()}.pdf`);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-white/80 text-[10px] font-bold uppercase transition-all border border-white/10 backdrop-blur-md"
              title="PDF kimi yüklə"
            >
              PDF
            </button>
          </div>
          <table className="w-full text-left border-collapse bg-[#0a0b14]/60 backdrop-blur-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5">
                {rows[0].split('|').filter(c => c.trim()).map((cell, i) => (
                  <th key={i} className="px-5 py-4 text-[10px] font-bold text-cyan-400 uppercase tracking-widest">{cell.trim()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(2).map((row, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  {row.split('|').filter(c => c.trim()).map((cell, j) => (
                    <td key={j} className="px-5 py-4 text-sm text-slate-300">{cell.trim()}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (part.content.includes('[GEN_IMAGE:')) {
      const match = genImageRegex.exec(part.content);
      if (match) {
        return <div key={index} className="my-8"><ImageGenerator initialPrompt={match[1]} autoRun={true} onImageClick={onImageClick} /></div>;
      }
    }

    // Render text part with links and bold
    return part.content.split('\n').map((line, lineIndex) => {
      if (line.trim() === '') {
        return <div key={`${index}-${lineIndex}`} className="h-4" />;
      }
      
      // List detection
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\./.test(line.trim())) {
        return (
          <div key={`${index}-${lineIndex}`} className="flex gap-3 my-2 pl-4">
            <span className="text-cyan-400 font-bold">•</span>
            <span className="text-slate-300 leading-relaxed">{line.trim().replace(/^[-*]\s+|\d+\.\s+/, '')}</span>
          </div>
        );
      }

      const lineParts = line.split(urlRegex);
      return (
        <p key={`${index}-${lineIndex}`} className="my-2 leading-relaxed text-slate-300 text-[15px]">
          {lineParts.map((p, pIndex) => {
            if (p.match(urlRegex)) {
              return (
                <button
                  key={`${index}-${lineIndex}-${pIndex}`}
                  onClick={() => onOpen(p)}
                  className="text-cyan-400 underline hover:no-underline font-medium"
                  title={p}
                  type="button"
                >
                  {p}
                </button>
              );
            }
            const boldParts = p.split(boldRegex);
            return boldParts.map((bp, bidx) => {
              if (bidx % 2 === 1) {
                return <strong key={`${index}-${lineIndex}-${pIndex}-${bidx}`} className="text-white font-bold">{bp}</strong>;
              }
              return <React.Fragment key={`${index}-${lineIndex}-${pIndex}-${bidx}`}>{bp}</React.Fragment>;
            });
          })}
        </p>
      );
    });
  });
};
// Removed ModernProgress HUD in favor of pure typing effect

// ── Lightbox Modal ────────────────────────────────────────────────────────────
const ImageLightbox: React.FC<{ url: string; onClose: () => void }> = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10"
        aria-label="Bağla"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      {/* Image */}
      <img
        src={url}
        alt="Tam ölçü"
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[88vh] rounded-2xl shadow-2xl object-contain"
        style={{ animation: 'lightboxIn .22s cubic-bezier(.4,0,.2,1)' }}
      />
      <style>{`@keyframes lightboxIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}`}</style>
    </div>
  );
};

const ImagePreview: React.FC<{ url: string; onOpenLightbox: (url: string) => void }> = ({ url, onOpenLightbox }) => {
  const [hasError, setHasError] = useState(false);
  const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
  const [stage, setStage] = useState<0 | 1 | 2>(0);
  const placeholder = 'https://placehold.co/640x360?text=Şəkil+yüklənmədi';
  const src = stage === 0 ? url : (stage === 1 ? proxyUrl : placeholder);

  if (hasError) {
    return (
      <button onClick={() => onOpenLightbox(url)} className="block rounded-2xl overflow-hidden aspect-video bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center p-2">
        <div className="text-center">
          <svg className="mx-auto h-6 w-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-1 text-[11px] text-white/40">Yüklənmədi</p>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={() => onOpenLightbox(src !== placeholder ? url : url)}
      className="block rounded-2xl overflow-hidden aspect-video bg-white/5 relative group cursor-zoom-in"
      title="Böyüt"
    >
      <img
        src={src}
        alt="Vizual"
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        loading="lazy"
        onError={() => {
          if (stage === 0) setStage(1);
          else if (stage === 1) setStage(2);
          else setHasError(true);
        }}
      />
      {/* Zoom hint overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
        <svg className="w-8 h-8 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M11 8v6M8 11h6"/>
        </svg>
      </div>
    </button>
  );
};

const VideoPreview: React.FC<{ url: string; onOpen: (url: string) => void }> = ({ url, onOpen }) => {
  const getYouTubeEmbedUrl = (videoUrl: string): string | null => {
    let videoId;
    try {
      const urlObj = new URL(videoUrl);
      if (urlObj.hostname === 'youtu.be') {
        videoId = urlObj.pathname.slice(1);
      } else if (urlObj.hostname.includes('youtube.com')) {
        videoId = urlObj.searchParams.get('v');
      }
    } catch (e) {
      return null;
    }

    return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
  };

  const embedUrl = getYouTubeEmbedUrl(url);

  if (embedUrl) {
    return (
      <div className="rounded-2xl overflow-hidden aspect-video bg-white/5">
        <iframe
          src={embedUrl}
          title="YouTube"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full"
        ></iframe>
      </div>
    );
  }

  return (
    <button onClick={() => onOpen(url)} className="block rounded-2xl overflow-hidden aspect-video bg-white/5 flex items-center justify-center p-2 hover:bg-white/10 transition-colors">
      <div className="text-center text-white/50">
        <PlayIcon className="mx-auto h-8 w-8" />
        <p className="mt-1 text-[11px]">İzlə</p>
      </div>
    </button>
  );
};

// MapEmbed replaced by MapComponent from './MapComponent'

const PlaceCard: React.FC<{ place: PlaceResult; onOpen: (url: string) => void }> = ({ place, onOpen }) => {
  const [thumbSrc, setThumbSrc] = useState<string | null>(place.thumbnailUrl || null);
  const [showEmbed, setShowEmbed] = useState(false);
  return (
    <div className="rounded-2xl bg-transparent hover:bg-white/5 transition-colors p-3 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {thumbSrc ? (
          <img src={thumbSrc} alt={place.title} className="w-14 h-14 rounded-xl object-cover" onError={() => setThumbSrc('https://placehold.co/96x96?text=📍')} />
        ) : (
          <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-white/40">📍</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white truncate">{place.title}</div>
          <div className="text-[13px] text-white/60 mt-0.5 truncate">
            {place.category || ''}{place.category && place.address ? ' • ' : ''}{place.address || ''}
          </div>
          {(place.rating || place.reviewsCount) && (
            <div className="text-[13px] text-white/60 mt-0.5">
              {place.rating ? `★ ${place.rating.toFixed(1)}` : ''} {place.reviewsCount ? `(${place.reviewsCount})` : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={() => setShowEmbed(!showEmbed)}
              className={`text-[11px] px-2 py-1 rounded-md transition-colors ${showEmbed ? 'bg-accent/20 text-accent' : 'bg-white/5 text-white/80 hover:bg-white/10'}`}
            >
              {showEmbed ? 'Xəritəni gizlə' : 'Xəritə'}
            </button>
            {place.mapsUrl && (
              <button onClick={() => onOpen(place.mapsUrl!)} className="text-[11px] px-2 py-1 rounded-md bg-white/5 text-white/80 hover:bg-white/10">Xəritədə aç</button>
            )}
          </div>
        </div>
      </div>
      {showEmbed && (
        <div className="w-full h-48 rounded-xl overflow-hidden border border-white/5">
          <MapComponent
            query={place.address || place.title}
            lat={place.latitude}
            lng={place.longitude}
          />
        </div>
      )}
    </div>
  );
};

const NewsCard: React.FC<{ article: SearchNewsItem | NewsArticle; onOpen: (url: string) => void }> = ({ article, onOpen }) => {
  const anyArt: any = article;
  const href: string = anyArt.link ?? anyArt.url ?? '#';
  const thumb: string | undefined = anyArt.imageUrl ?? anyArt.thumbnail;
  const dateText: string | undefined = anyArt.publishedAt ?? anyArt.date;
  const snippet: string | undefined = anyArt.summary ?? anyArt.snippet;
  return (
    <button onClick={() => onOpen(href)} className="block text-left w-full p-3 rounded-2xl bg-transparent hover:bg-white/5 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-white/90 leading-snug line-clamp-2">{anyArt.title}</div>
          <div className="text-[11px] text-white/50 mt-1.5">{anyArt.source}{dateText ? ` • ${dateText}` : ''}</div>
          {snippet && <p className="text-[13px] text-white/70 mt-1.5 line-clamp-2">{snippet}</p>}
        </div>
        {thumb && (
          <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
            <ProtectedImage
              src={thumb}
              alt={anyArt.title}
              className="w-full h-full object-cover"
              proxyParams="w=240&h=240&fit=cover&output=webp&q=80"
            />
          </div>
        )}
      </div>
    </button>
  );
};

const ProductCard: React.FC<{ product: ShoppingProduct; onOpen: (url: string) => void }> = ({ product, onOpen }) => {
  const normalizeLink = (url?: string): string => {
    if (!url) return '#';
    try {
      // valid absolute URL
      return new URL(url).href;
    } catch {
      if (url.startsWith('//')) return 'https:' + url;
      return 'https://' + url.replace(/^\/*/, '');
    }
  };
  const href = normalizeLink(product.link);
  return (
    <button onClick={() => onOpen(href)} className="block text-left w-full p-3 rounded-2xl bg-transparent hover:bg-white/5 transition-colors">
      {product.imageUrl && (
        <div className="aspect-square w-full bg-white/5 rounded-xl mb-3 overflow-hidden flex items-center justify-center p-2">
          <ProtectedImage
            src={product.imageUrl}
            alt={product.title}
            className="w-full h-full object-contain"
            proxyParams="w=400&h=400&fit=contain&output=webp&q=80"
          />
        </div>
      )}
      <div className="font-medium text-white/90 leading-snug line-clamp-2 text-[13px]">{product.title}</div>
      <div className="text-[13px] text-white mt-1.5">{product.price}</div>
      <div className="text-[11px] text-white/50 mt-1">{product.source}</div>
    </button>
  );
};

// Decide if products should be shown for this message
const shouldShowProducts = (m: Message): boolean => {
  if (!m.products || m.products.length === 0) return false;
  if (m.toolCalls && m.toolCalls.some(t => /shop|product|commerce|shopping|amazon|aliexpress/i.test(t.name))) return true;
  const t = (m.text || '').toLowerCase();
  const asked = /(məhsul|qiymət|satın|almaq|haradan ala|mağaza|magaza|price|buy|purchase|amazon|aliexpress)/i.test(t);
  return asked;
};

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, onRelatedQuery, language }) => {
  const isUser = message.role === 'user';
  const t = (key: any) => getTranslation(language, key);

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [aiAvatarError, setAiAvatarError] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const openLightbox = useCallback((url: string) => setLightboxUrl(url), []);
  const closeLightbox = useCallback(() => setLightboxUrl(null), []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nov-era-avatar');
      setAvatarUrl(stored);
      const aiStored = localStorage.getItem('nov-era-ai-avatar');
      setAiAvatarUrl(aiStored || '/ai-avatar.png');
    } catch { }
  }, []);

  // Preload AI avatar and fall back to monogram if missing
  useEffect(() => {
    if (!aiAvatarUrl) { setAiAvatarError(false); return; }
    let cancelled = false;
    const img = new Image();
    img.onload = () => { if (!cancelled) setAiAvatarError(false); };
    img.onerror = () => { if (!cancelled) setAiAvatarError(true); };
    img.src = aiAvatarUrl;
    return () => { cancelled = true; };
  }, [aiAvatarUrl]);

  // High-speed "chasing" typing effect for fluid AI writing feel
  useEffect(() => {
    if (isUser) { 
      setDisplayText(message.text || ''); 
      setIsStreaming(false); 
      return; 
    }
    
    const fullText = message.text || '';
    if (!fullText) {
      setDisplayText('');
      setIsStreaming(!!message.isLoading);
      return;
    }

    // If already animated or not a stream, just show
    if (animatedMessageIds.has(message.id)) {
      setDisplayText(fullText);
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);
    
    let currentPos = displayText.length;
    // If the gap is huge (e.g. initial load), jump closer
    if (fullText.length - currentPos > 100) {
      currentPos = fullText.length - 50;
    }

    const typingInterval = window.setInterval(() => {
      if (currentPos < fullText.length) {
        // "Chase" speed: move faster if the gap is larger
        const gap = fullText.length - currentPos;
        const step = gap > 20 ? 3 : (gap > 5 ? 2 : 1);
        currentPos = Math.min(fullText.length, currentPos + step);
        setDisplayText(fullText.slice(0, currentPos));
      } else if (!message.isLoading) {
        // Finished both streaming and typing
        setIsStreaming(false);
        animatedMessageIds.add(message.id);
        window.clearInterval(typingInterval);
      }
    }, 15); // Very fast 15ms interval

    return () => window.clearInterval(typingInterval);
  }, [message.id, message.text, message.isLoading, isUser]);

  return (
    <div className="py-4 md:py-6">
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={closeLightbox} />}
      <div className={`max-w-5xl mx-auto px-2 md:px-6 flex gap-2 md:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="flex-shrink-0 mt-0.5 flex flex-col items-center gap-1.5">
            {(aiAvatarUrl && !aiAvatarError) ? (
              <AiAvatarView
                src={aiAvatarUrl}
                className="w-6 h-6 sm:w-10 sm:h-10 border border-white/5 shadow-sm"
              />
            ) : (
              <AiMonogram className="w-6 h-6 sm:w-10 sm:h-10" />
            )}
            <span className="text-[8px] md:text-[10px] font-bold text-cyan-400/70 tracking-widest uppercase">NovEra</span>
          </div>
        )}
        <div className={`max-w-[92%] md:max-w-[75%] ${isUser ? 'glass-card rounded-[1.5rem] md:rounded-[2rem] px-4 md:px-6 py-2.5 md:py-3.5 shadow-xl text-white' : 'pt-1 md:pt-2'}`}>
          <div className={`max-w-none text-white leading-relaxed text-[14px] md:text-base ${isStreaming ? 'animate-[breath_2.4s_ease-in-out_infinite]' : ''}`}>
            {formatText(displayText, openInNovEra, openLightbox)}
            {isStreaming && <span className="inline-block w-[6px] h-4 align-[-1px] bg-cyan-400 rounded-[1px] ml-1 animate-[blink_1.1s_steps(2,_start)_infinite]"></span>}
            {message.isLoading && !displayText && (
              <div className="mt-2 space-y-3">
                <div className="h-3 rounded-full bg-white/5 animate-pulse w-full" />
                <div className="h-3 rounded-full bg-white/5 animate-pulse w-[92%]" />
                <div className="h-3 rounded-full bg-white/5 animate-pulse w-[85%]" />
              </div>
            )}
          </div>
          <style>{`@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}} @keyframes breath{0%{opacity:.95}50%{opacity:.7}100%{opacity:.95}}`}</style>

          {(message.images && message.images.length > 0) || (message.videos && message.videos.length > 0) ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('visuals')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {message.images?.map((url) => <ImagePreview key={url} url={url} onOpenLightbox={openLightbox} />)}
                {message.videos?.map((url) => <VideoPreview key={url} url={url} onOpen={openInNovEra} />)}
              </div>
            </div>
          ) : null}

          {message.maps && message.maps.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('map')}</h3>
              <div className="space-y-4">
                {message.maps.map((q) => (
                  <MapComponent key={q} query={q} />
                ))}
              </div>
            </div>
          )}

          {message.places && message.places.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('places')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {message.places.map((pl) => (
                  <PlaceCard key={`${pl.mapsUrl || pl.title}`} place={pl} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {message.news && message.news.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('news')}</h3>
              <div className="grid grid-cols-1 gap-4">
                {message.news.map((article, index) => (
                  <NewsCard key={index} article={article} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {shouldShowProducts(message) && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('products')}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {message.products.map((product, index) => (
                  <ProductCard key={index} product={product} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {message.sources && message.sources.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('sources')}</h3>
              <div className="flex flex-wrap">
                {message.sources.map((source) => (
                  <SourcePill key={source.uri} source={source} />
                ))}
              </div>
            </div>
          )}

          {message.related && message.related.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-text-main mb-3">{t('related')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {message.related.map((query) => (
                  <RelatedQuery key={query} query={query} onQuery={onRelatedQuery} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};