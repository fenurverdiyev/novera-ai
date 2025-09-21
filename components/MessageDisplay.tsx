import React, { useState, useEffect } from 'react';
import type { Message } from '../types';
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

const ImagePreview: React.FC<{ url: string }> = ({ url }) => {
    const [hasError, setHasError] = useState(false);
    const proxiedUrl = `https://wsrv.nl/?url=${encodeURIComponent(url)}`;

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
                src={proxiedUrl} 
                alt="Vizual önizləmə" 
                className="w-full h-full object-cover" 
                loading="lazy" 
                onError={() => setHasError(true)}
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