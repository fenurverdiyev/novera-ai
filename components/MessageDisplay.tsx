import React, { useState, useEffect } from 'react';
import type { Message, PlaceResult, SearchNewsItem, ShoppingProduct, NewsArticle } from '../types';
import { BotIcon, UserIcon, PlayIcon } from './Icons';
import { SourcePill } from './SourcePill';
import { RelatedQuery } from './RelatedQuery';
import { ProtectedImage } from './ProtectedImage';

// Remember which message IDs have already been animated (typing/fade) so it doesn't repeat
const animatedMessageIds = new Set<string>();

type NewsCardArticle = SearchNewsItem | NewsArticle;

// Mask-based avatar renderer so any logo can be filled as pure white
const AiAvatarView: React.FC<{ src: string; className?: string }> = ({ src, className = '' }) => {
  const style: React.CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    backgroundColor: '#ffffff',
  };
  return <div className={`rounded-full ${className}`} style={style} />;
};

// Minimal white "N" monogram as guaranteed fallback
const AiMonogram: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`rounded-full bg-white/10 border border-white/15 flex items-center justify-center ${className}`}>
    <span className="text-white font-extrabold leading-none select-none" style={{ fontSize: 18 }}>N</span>
  </div>
);
interface MessageDisplayProps {
  message: Message;
  onRelatedQuery: (query: string) => void;

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
    try { window.open(url, '_blank'); } catch {}
  }
};

const formatText = (text: string, onOpen: (url: string) => void) => {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const boldRegex = /\*\*(.*?)\*\*/g;

  return text.split('\n').map((line, lineIndex) => {
    if (line.trim() === '') {
      return <div key={lineIndex} className="h-4" />; // Render empty lines as spacing
    }
    const parts = line.split(urlRegex);

    return (
      <p key={lineIndex} className="my-1">
        {parts.map((part, partIndex) => {
          if (part.match(urlRegex)) {
            return (
              <button
                key={`${lineIndex}-${partIndex}`}
                onClick={() => onOpen(part)}
                className="text-accent underline hover:no-underline"
                title={part}
                type="button"
              >
                {part}
              </button>
            );
          }
          const boldParts = part.split(boldRegex);
          return boldParts.map((bp, bidx) => {
            if (bidx % 2 === 1) {
              return <strong key={`${lineIndex}-${partIndex}-${bidx}`}>{bp}</strong>;
            }
            return <React.Fragment key={`${lineIndex}-${partIndex}-${bidx}`}>{bp}</React.Fragment>;
          });
        })}
      </p>
    );
  });
};
// Removed ModernProgress HUD in favor of pure typing effect

const ImagePreview: React.FC<{ url: string; onOpen: (url: string) => void }> = ({ url, onOpen }) => {
    const [hasError, setHasError] = useState(false);
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    // stage: 0 = original, 1 = proxy, 2 = placeholder
    const [stage, setStage] = useState<0 | 1 | 2>(0);
    const placeholder = 'https://placehold.co/640x360?text=Şəkil+yüklənmədi';
    const src = stage === 0 ? url : (stage === 1 ? proxyUrl : placeholder);

    if (hasError) {
        return (
            <button onClick={() => onOpen(url)} className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105 flex items-center justify-center p-2">
                <div className="text-center">
                    <svg className="mx-auto h-8 w-8 text-text-sub" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-1 text-xs text-text-sub">Şəkil yüklənmədi</p>
                </div>
            </button>
        );
    }

    return (
        <button onClick={() => onOpen(url)} className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105">
            <img 
                src={src} 
                alt="Vizual önizləmə" 
                className="w-full h-full object-cover" 
                loading="lazy" 
                onError={() => {
                  if (stage === 0) setStage(1); // try proxy
                  else if (stage === 1) setStage(2); // try placeholder
                  else setHasError(true);
                }}
            />
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
            <div className="rounded-lg overflow-hidden aspect-video bg-bg-onyx">
                <iframe
                    src={embedUrl}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                ></iframe>
            </div>
        );
    }
    
    return (
        <button onClick={() => onOpen(url)} className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105 flex items-center justify-center p-2">
            <div className="text-center">
                <PlayIcon className="mx-auto h-10 w-10 text-text-sub" />
                <p className="mt-2 text-xs text-text-sub">Videoya baxın</p>
            </div>
        </button>
    );
};

const PlaceCard: React.FC<{ place: PlaceResult; onOpen: (url: string) => void }> = ({ place, onOpen }) => {
  const [thumbSrc, setThumbSrc] = useState<string | null>(place.thumbnailUrl || null);
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors">
      <div className="flex items-start gap-3">
        {thumbSrc ? (
          <img src={thumbSrc} alt={place.title} className="w-16 h-16 rounded-lg object-cover" onError={() => setThumbSrc('https://placehold.co/96x96?text=📍')} />
         ) : (
           <div className="w-16 h-16 rounded-lg bg-bg-onyx flex items-center justify-center text-text-sub">📍</div>
         )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{place.title}</div>
          <div className="text-xs text-white/70 mt-1 truncate">
            {place.category || ''}{place.category && place.address ? ' • ' : ''}{place.address || ''}
          </div>
          {(place.rating || place.reviewsCount) && (
            <div className="text-xs text-white/70 mt-1">
              {place.rating ? `⭐ ${place.rating.toFixed(1)}` : ''} {place.reviewsCount ? `(${place.reviewsCount})` : ''}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {place.mapsUrl && (
              <button onClick={() => onOpen(place.mapsUrl!)} className="text-xs px-2 py-1 rounded-lg bg-accent/20 text-accent hover:bg-accent/30">Xəritədə aç</button>
            )}
            {place.website && (
              <button onClick={() => onOpen(place.website!)} className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20">Sayt</button>
            )}
            {place.phoneNumber && (
              <a href={`tel:${place.phoneNumber}`} className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20">Zəng et</a>
            )}
          </div>
        </div>
      </div>
      {/* Image Zoom Modal for chat images */}
      {imageModalUrl && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setImageModalUrl(null)}>
          <div className="relative max-w-5xl w-full max-h-[90vh] bg-black/40 border border-white/20 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setImageModalUrl(null)} className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Bağla</button>
            <div className="w-full h-full flex items-center justify-center p-3">
              <img src={imageModalUrl} alt="şəkil" className="max-w-full max-h-[72vh] object-contain rounded-lg" />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <div className="text-xs text-white/70">Şəkil önizləmə</div>
              <div className="flex items-center gap-2">
                <a href={imageModalUrl} download className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Yüklə</a>
                <button
                  onClick={async () => {
                    try {
                      if (navigator.share && /^https?:/i.test(imageModalUrl)) {
                        await navigator.share({ title: 'Şəkil', url: imageModalUrl });
                        setShareHint('Paylaşıldı');
                        setTimeout(() => setShareHint(null), 1400);
                        return;
                      }
                      await navigator.clipboard.writeText(imageModalUrl);
                      setShareHint('Link kopyalandı');
                      setTimeout(() => setShareHint(null), 1400);
                    } catch {
                      setShareHint('Paylaşmaq alınmadı');
                      setTimeout(() => setShareHint(null), 1600);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20"
                >Paylaş</button>
                <a href={imageModalUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Yeni tab</a>
              </div>
            </div>
            {shareHint && <div className="absolute left-3 bottom-3 text-xs text-white/80 bg-white/10 rounded-md px-2 py-1 border border-white/20">{shareHint}</div>}
          </div>
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
    <button onClick={() => onOpen(href)} className="block text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors w-full">
      <div className="flex items-start gap-4">
        {thumb && (
          <div className="w-32 h-24 rounded-lg overflow-hidden bg-bg-onyx flex-shrink-0">
            <ProtectedImage
              src={thumb}
              alt={anyArt.title}
              className="w-full h-full object-cover"
              proxyParams="w=480&h=320&fit=cover&output=webp&q=85"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white leading-tight line-clamp-2">{anyArt.title}</div>
          <div className="text-xs text-white/70 mt-2">{anyArt.source}{dateText ? ` • ${dateText}` : ''}</div>
          {snippet && <p className="text-sm text-white/80 mt-2 line-clamp-2">{snippet}</p>}
        </div>
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
    <button onClick={() => onOpen(href)} className="block text-left rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors w-full">
        {product.imageUrl && (
          <div className="aspect-square w-full bg-white/10 rounded-lg mb-3 overflow-hidden">
            <ProtectedImage
              src={product.imageUrl}
              alt={product.title}
              className="w-full h-full object-contain"
              proxyParams="w=512&h=512&fit=contain&output=webp&q=85"
            />
          </div>
        )}
        <div className="font-semibold text-white leading-tight line-clamp-2">{product.title}</div>
        <div className="text-sm text-accent font-bold mt-2">{product.price}</div>
        <div className="text-xs text-white/70 mt-1">{product.source}</div>
        {product.rating && (
            <div className="text-xs text-white/70 mt-1">⭐ {product.rating.toFixed(1)} ({product.reviews || 0})</div>
        )}
    </button>
  );
};

// Decide if products should be shown for this message
// Decide if products should be shown for this message
const shouldShowProducts = (m: Message): boolean => {
  if (!m.products || m.products.length === 0) return false;
  if (m.toolCalls && m.toolCalls.some(t => /shop|product|commerce|shopping|amazon|aliexpress/i.test(t.name))) return true;
  const t = (m.text || '').toLowerCase();
  const asked = /(məhsul|qiymət|satın|almaq|haradan ala|mağaza|magaza|price|buy|purchase|amazon|aliexpress)/i.test(t);
  return asked;
};

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, onRelatedQuery }) => {
  const isUser = message.role === 'user';

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [aiAvatarUrl, setAiAvatarUrl] = useState<string | null>(null);
  const [aiAvatarError, setAiAvatarError] = useState(false);
  const [displayText, setDisplayText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [imageModalUrl, setImageModalUrl] = useState<string | null>(null);
  const [shareHint, setShareHint] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nov-era-avatar');
      setAvatarUrl(stored);
      const aiStored = localStorage.getItem('nov-era-ai-avatar');
      setAiAvatarUrl(aiStored || '/ai-avatar.png');
    } catch {}
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

  // ChatGPT-like typing effect for model messages (only once per message id)
  useEffect(() => {
    if (isUser) { setDisplayText(message.text || ''); setIsStreaming(false); return; }
    const t = message.text || '';
    if (!t) { setDisplayText(''); setIsStreaming(!!message.isLoading); return; }
    // If we've already animated this message id once, render fully without re-animating
    if (animatedMessageIds.has(message.id)) {
      setDisplayText(t);
      setIsStreaming(false);
      return;
    }
    let i = 0;
    setDisplayText('');
    setIsStreaming(true);
    const interval = 12;
    const targetMs = Math.max(1300, Math.min(4200, 1400 + t.length * 12)); // adapt by length
    const step = Math.max(1, Math.round(t.length / Math.max(1, targetMs / interval)));
    const id = window.setInterval(() => {
      i = Math.min(t.length, i + step);
      setDisplayText(t.slice(0, i));
      if (i >= t.length) {
        setIsStreaming(false);
        animatedMessageIds.add(message.id);
        window.clearInterval(id);
      }
    }, interval);
    return () => window.clearInterval(id);
  }, [message.id, message.text, message.isLoading, isUser]);

  return (
    <div className={`py-6 md:py-8 ${isUser ? '' : 'bg-bg-slate/80'}`}>
      <div className="max-w-4xl mx-auto px-3 sm:px-4 flex gap-3 sm:gap-4">
        <div className="flex-shrink-0">
          {isUser ? (
            avatarUrl ? (
              <img src={avatarUrl} alt="Profil" className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover border border-white/10 shadow-md" />
            ) : (
              <UserIcon className="w-8 h-8 text-text-sub" />
            )
          ) : (
            (aiAvatarUrl && !aiAvatarError) ? (
              <AiAvatarView
                src={aiAvatarUrl}
                className="w-8 h-8 sm:w-10 sm:h-10 border border-white/15 ring-2 ring-white/10 shadow-lg"
              />
            ) : (
              <AiMonogram className="w-8 h-8 sm:w-10 sm:h-10" />
            )
          )}
        </div>
        <div className="flex-grow">
          <div className={`max-w-none text-text-main leading-relaxed text-[15px] md:text-base ${isStreaming ? 'animate-[breath_2.4s_ease-in-out_infinite]' : ''}`}>
             {formatText(displayText, openInNovEra)}
             {isStreaming && <span className="inline-block w-[6px] h-4 align-[-1px] bg-white/80 rounded-[1px] ml-1 animate-[blink_1.1s_steps(2,_start)_infinite]"></span>}
             {message.isLoading && !displayText && (
               <div className="mt-2 space-y-2">
                 <div className="h-3 rounded-md bg-white/10 animate-pulse" />
                 <div className="h-3 w-11/12 rounded-md bg-white/10 animate-pulse" />
                 <div className="h-3 w-8/12 rounded-md bg-white/10 animate-pulse" />
               </div>
             )}
          </div>
          <style>{`@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}} @keyframes breath{0%{opacity:.92}50%{opacity:.65}100%{opacity:.92}}`}</style>
          
          {(message.images && message.images.length > 0) || (message.videos && message.videos.length > 0) ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Vizuallar</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {message.images?.map((url) => <ImagePreview key={url} url={url} onOpen={(u) => setImageModalUrl(u)} />)}
                {message.videos?.map((url) => <VideoPreview key={url} url={url} onOpen={openInNovEra} />)}
              </div>
            </div>
          ) : null}

          {message.places && message.places.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Məkanlar</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {message.places.map((pl) => (
                  <PlaceCard key={`${pl.mapsUrl || pl.title}`} place={pl} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {message.news && message.news.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Xəbərlər</h3>
              <div className="grid grid-cols-1 gap-4">
                {message.news.map((article, index) => (
                  <NewsCard key={index} article={article} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {shouldShowProducts(message) && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Məhsullar</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {message.products.map((product, index) => (
                  <ProductCard key={index} product={product} onOpen={openInNovEra} />
                ))}
              </div>
            </div>
          )}

          {message.sources && message.sources.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Mənbələr</h3>
              <div className="flex flex-wrap">
                {message.sources.map((source) => (
                  <SourcePill key={source.uri} source={source} />
                ))}
              </div>
            </div>
          )}

          {message.related && message.related.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-text-main mb-3">Əlaqəli</h3>
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