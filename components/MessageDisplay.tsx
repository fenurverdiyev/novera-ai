import React, { useState, useEffect } from 'react';
import type { Message, PlaceResult, SearchNewsItem, ShoppingProduct } from '../types';
import { BotIcon, UserIcon, PlayIcon, PauseIcon } from './Icons';
import { SourcePill } from './SourcePill';
import { RelatedQuery } from './RelatedQuery';

interface MessageDisplayProps {
  message: Message;
  onRelatedQuery: (query: string) => void;
  onPlayAudio: (messageId: string, text: string) => void;
  playingMessageId: string | null;
}

const formatText = (text: string) => {
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
              <a
                key={`${lineIndex}-${partIndex}`}
                href={part}
                className="text-accent underline hover:no-underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {part}
              </a>
            );
          }
          
          const boldParts = part.split(boldRegex);
          return boldParts.map((boldPart, boldIndex) => {
             if (boldIndex % 2 === 1) {
                return <strong key={`${lineIndex}-${partIndex}-${boldIndex}`}>{boldPart}</strong>
             }
             return <React.Fragment key={`${lineIndex}-${partIndex}-${boldIndex}`}>{boldPart}</React.Fragment>;
          });
        })}
      </p>
    );
  });
};

const Stepper: React.FC<{ step?: 1 | 2 | 3 }> = ({ step }) => {
  const steps = [
    { id: 1, label: 'Analiz Edirəm...' },
    { id: 2, label: 'Axtarıram...' },
    { id: 3, label: 'Cavab Verirəm' },
  ] as const;
  return (
    <div className="mb-3">
      <div className="flex items-center gap-3">
        {steps.map((s, idx) => {
          const active = step ? s.id <= step : false;
          return (
            <div key={s.id} className="flex items-center gap-2">
              <div className={`px-3 py-1 rounded-full text-xs border ${active ? 'bg-accent/20 text-accent border-accent/30' : 'bg-white/5 text-white/70 border-white/10'}`}>
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${active ? 'bg-accent animate-pulse' : 'bg-white/30'}`}></span>
                {s.label}
              </div>
              {idx < steps.length - 1 && <div className={`w-6 h-px ${active ? 'bg-accent/50' : 'bg-white/10'}`}></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ImagePreview: React.FC<{ url: string }> = ({ url }) => {
    const [hasError, setHasError] = useState(false);
    const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
    // stage: 0 = original, 1 = proxy, 2 = placeholder
    const [stage, setStage] = useState<0 | 1 | 2>(0);
    const placeholder = 'https://placehold.co/640x360?text=Şəkil+yüklənmədi';
    const src = stage === 0 ? url : (stage === 1 ? proxyUrl : placeholder);

    if (hasError) {
        return (
            <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105 flex items-center justify-center p-2">
                <div className="text-center">
                    <svg className="mx-auto h-8 w-8 text-text-sub" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="mt-1 text-xs text-text-sub">Şəkil yüklənmədi</p>
                </div>
            </a>
        );
    }

    return (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105">
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
        </a>
    );
};

const VideoPreview: React.FC<{ url: string }> = ({ url }) => {
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
        <a href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden aspect-video bg-bg-onyx group transition-transform duration-200 ease-in-out hover:scale-105 flex items-center justify-center p-2">
            <div className="text-center">
                <PlayIcon className="mx-auto h-10 w-10 text-text-sub" />
                <p className="mt-2 text-xs text-text-sub">Videoya baxın</p>
            </div>
        </a>
    );
};

const PlaceCard: React.FC<{ place: PlaceResult }> = ({ place }) => {
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
              <a href={place.mapsUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg bg-accent/20 text-accent hover:bg-accent/30">Xəritədə aç</a>
            )}
            {place.website && (
              <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20">Sayt</a>
            )}
            {place.phoneNumber && (
              <a href={`tel:${place.phoneNumber}`} className="text-xs px-2 py-1 rounded-lg bg-white/10 text-white hover:bg-white/20">Zəng et</a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const NewsCard: React.FC<{ article: SearchNewsItem }> = ({ article }) => {
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors">
      <div className="flex items-start gap-4">
        {article.thumbnail && (
          <img src={article.thumbnail} alt={article.title} className="w-24 h-24 rounded-lg object-cover" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white leading-tight">{article.title}</div>
          <div className="text-xs text-white/70 mt-2">{article.source} • {article.date}</div>
          <p className="text-sm text-white/80 mt-2 line-clamp-2">{article.snippet}</p>
        </div>
      </div>
    </a>
  );
};

const ProductCard: React.FC<{ product: ShoppingProduct }> = ({ product }) => {
  return (
    <a href={product.link} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-white/5 border border-white/10 p-4 hover:bg-white/10 transition-colors">
        {product.imageUrl && (
          <div className="aspect-square w-full bg-white/10 rounded-lg mb-3 overflow-hidden">
            <img src={product.imageUrl} alt={product.title} className="w-full h-full object-contain" />
          </div>
        )}
        <div className="font-semibold text-white leading-tight line-clamp-2">{product.title}</div>
        <div className="text-sm text-accent font-bold mt-2">{product.price}</div>
        <div className="text-xs text-white/70 mt-1">{product.source}</div>
        {product.rating && (
            <div className="text-xs text-white/70 mt-1">⭐ {product.rating.toFixed(1)} ({product.reviews || 0})</div>
        )}
    </a>
  );
};

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, onRelatedQuery, onPlayAudio, playingMessageId }) => {
  const isUser = message.role === 'user';
  const isPlaying = message.id === playingMessageId;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('nov-era-avatar');
      setAvatarUrl(stored);
    } catch {}
  }, []);

  const handlePlayClick = () => {
    onPlayAudio(message.id, message.text);
  };

  return (
    <div className={`py-8 ${isUser ? '' : 'bg-bg-slate/80'}`}>
      <div className="max-w-4xl mx-auto px-4 flex gap-4">
        <div className="flex-shrink-0">
          {isUser ? (
            avatarUrl ? (
              <img src={avatarUrl} alt="Profil" className="w-8 h-8 rounded-full object-cover border border-bg-onyx" />
            ) : (
              <UserIcon className="w-8 h-8 text-text-sub" />
            )
          ) : (
            <BotIcon className="w-8 h-8 text-accent" />
          )}
        </div>
        <div className="flex-grow">
          {!isUser && message.progressStep && (
            <Stepper step={message.progressStep} />
          )}
          <div className="max-w-none text-text-main leading-relaxed">
             {formatText(message.text)}
             {message.isLoading && !message.text && <div className="w-3 h-3 bg-accent animate-pulse rounded-full mt-2"></div>}
          </div>

          {!isUser && !message.isLoading && message.text && (
            <div className="mt-4">
              <button onClick={handlePlayClick} className="flex items-center justify-center w-8 h-8 rounded-full bg-bg-onyx text-accent hover:bg-accent hover:text-bg-jet transition-all">
                {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              </button>
              {message.ttsError && (
                <p className="text-red-500 text-xs mt-2">{message.ttsError}</p>
              )}
            </div>
          )}
          
          {(message.images && message.images.length > 0) || (message.videos && message.videos.length > 0) ? (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Vizuallar</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {message.images?.map((url) => <ImagePreview key={url} url={url} />)}
                {message.videos?.map((url) => <VideoPreview key={url} url={url} />)}
              </div>
            </div>
          ) : null}

          {message.places && message.places.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Məkanlar</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {message.places.map((pl) => (
                  <PlaceCard key={`${pl.mapsUrl || pl.title}`} place={pl} />
                ))}
              </div>
            </div>
          )}

          {message.news && message.news.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Xəbərlər</h3>
              <div className="grid grid-cols-1 gap-4">
                {message.news.map((article, index) => (
                  <NewsCard key={index} article={article} />
                ))}
              </div>
            </div>
          )}

          {message.products && message.products.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-text-main mb-3">Məhsullar</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {message.products.map((product, index) => (
                  <ProductCard key={index} product={product} />
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