import React, { useState } from 'react';
import type { ConversationTurn, GroundingChunk, SearchResultItem } from '../types';
import { VideoIcon, ShoppingCartIcon, MapPinIcon, MapIcon, MusicIcon } from './Icons';

const getYoutubeEmbedUrl = (url: string): string | null => {
    // Regex to capture video ID from various YouTube URL formats
    const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(youtubeRegex);
    if (match && match[1]) {
        const videoId = match[1];
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
    return null;
};

const Modal: React.FC<{ children: React.ReactNode; onClose: () => void }> = ({ children, onClose }) => {
    return (
        <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
            onClick={onClose}
        >
            <div 
                className="relative bg-black/50 border border-white/20 rounded-lg max-w-4xl max-h-[90vh] w-full flex items-center justify-center shadow-2xl shadow-cyan-500/20"
                onClick={(e) => e.stopPropagation()}
            >
                <button onClick={onClose} className="absolute -top-4 -right-4 w-10 h-10 rounded-full bg-gray-900/80 border-2 border-white/20 text-white text-2xl font-bold flex items-center justify-center z-10 hover:bg-red-500/80 hover:scale-110 transition-all duration-200">
                    &times;
                </button>
                {children}
            </div>
        </div>
    );
};

const SearchResultCard: React.FC<{item: SearchResultItem, onCardClick: (item: SearchResultItem) => void}> = ({ item, onCardClick }) => {
    const renderContent = () => {
        switch (item.type) {
            case 'image':
                return (
                    <div className="relative w-full h-full">
                        <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-xs font-semibold truncate text-white">{item.title}</p>
                        </div>
                    </div>
                );
            case 'video':
                return (
                    <div className="relative w-full h-full">
                        <VideoIcon className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 bg-black/50 rounded-full p-1" />
                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                             <p className="text-xs font-semibold truncate leading-tight text-white">{item.title}</p>
                            {item.duration && <p className="text-[10px] text-gray-300">{item.duration}</p>}
                        </div>
                    </div>
                );
            case 'product':
                return (
                    <div className="flex flex-col h-full bg-gray-900/30">
                         {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-20 object-cover" />}
                         <div className="p-2 flex-grow flex flex-col justify-between">
                            <p className="text-xs font-semibold leading-tight text-gray-200 line-clamp-2">{item.title}</p>
                            <p className="text-xs font-bold text-green-400 truncate">{item.price}</p>
                         </div>
                    </div>
                );
            case 'location':
                return (
                    <div className="p-2 flex flex-col items-center justify-center h-full text-center">
                         <MapPinIcon className="w-8 h-8 text-cyan-300 mb-2" />
                         <p className="text-xs font-semibold leading-tight line-clamp-2">{item.title}</p>
                         <p className="text-[10px] text-gray-400 w-full mt-1">{item.address}</p>
                    </div>
                );
            case 'map':
                return (
                    <div className="relative w-full h-full">
                        {item.imageUrl ? 
                            <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" /> :
                            <div className="w-full h-full flex items-center justify-center bg-blue-900/50"><MapIcon className="w-12 h-12 text-blue-300"/></div>
                        }
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                            <p className="text-xs font-semibold truncate leading-tight text-white">{item.title}</p>
                        </div>
                    </div>
                );
            case 'music':
                 return (
                    <div className="p-2 flex flex-col items-center justify-center h-full text-center bg-purple-900/30">
                         <MusicIcon className="w-8 h-8 text-purple-300 mb-2" />
                         <p className="text-xs font-semibold leading-tight line-clamp-2 text-white">{item.title}</p>
                         <p className="text-[10px] text-gray-400 w-full mt-1 truncate">{item.artist}</p>
                    </div>
                );
        }
    }
    return (
        <button
            onClick={() => onCardClick(item)}
            className="flex-shrink-0 w-36 h-36 bg-white/5 border border-white/10 rounded-lg overflow-hidden transition-all duration-300 hover:border-cyan-400 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 text-left"
            title={item.title}
        >
            {renderContent()}
        </button>
    )
}

// Fix: Define the MessageDisplayProps interface.
interface MessageDisplayProps {
  conversation: ConversationTurn[];
  sources: GroundingChunk[];
  searchResults: SearchResultItem[];
  status: 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';
}

export const MessageDisplay: React.FC<MessageDisplayProps> = ({ conversation, sources, searchResults, status }) => {
    const [modalContent, setModalContent] = useState<React.ReactNode | null>(null);

    const handleCardClick = (item: SearchResultItem) => {
        const embedUrl = getYoutubeEmbedUrl(item.source);
        if (item.type === 'video' || (item.type === 'music' && embedUrl)) {
            if (embedUrl) {
                setModalContent(
                    <div className="w-full aspect-video">
                        <iframe
                            src={embedUrl}
                            title={item.title}
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="w-full h-full rounded-md bg-black"
                        ></iframe>
                    </div>
                );
            } else {
                 window.open(item.source, '_blank', 'noopener,noreferrer');
            }
        } else if (item.type === 'image') {
             setModalContent(
                <img src={item.imageUrl} alt={item.title} className="max-w-full max-h-[85vh] object-contain rounded-md" />
            );
        } else {
             window.open(item.source, '_blank', 'noopener,noreferrer');
        }
    };

    const closeModal = () => setModalContent(null);

    const getStatusText = () => {
        switch (status) {
            case 'connecting':
                return 'Qoşulur...';
            case 'listening':
                return 'Dinləyirəm...';
            case 'processing':
                return 'Emal edilir...';
            case 'speaking':
                return 'Danışır...';
            case 'idle':
            default:
                return 'Başlamaq üçün mikrofona toxunun';
        }
    }

  const lastTurn = conversation.length > 0 ? conversation[conversation.length - 1] : null;
  const hasSources = sources && sources.length > 0;
  const hasSearchResults = searchResults && searchResults.length > 0;

  return (
    <>
      <div className="relative w-full min-h-[8rem] px-1 py-4 bg-black/20 backdrop-blur-sm border border-white/10 rounded-lg flex flex-col items-center justify-center text-center shadow-2xl shadow-black/50 transition-all duration-300">
        {/* Corner Brackets for HUD effect */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-300/50 rounded-tl-md"></div>
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-300/50 rounded-tr-md"></div>
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-300/50 rounded-bl-md"></div>
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-300/50 rounded-br-md"></div>
        
        <div className="flex-grow flex items-center justify-center px-5">
          <p className="text-xl sm:text-2xl text-gray-100 transition-opacity duration-300 animate-[fadeIn_0.5s_ease-in-out]">
              {lastTurn ? (
              <span key={conversation.length}>
                  <span className={`font-bold capitalize ${lastTurn.author === 'model' ? 'text-cyan-300' : lastTurn.author === 'user' ? 'text-purple-300' : 'text-gray-400'}`}>{lastTurn.author === 'model' ? 'NovEra' : lastTurn.author === 'user' ? 'Siz' : 'Sistem'}: </span>
                  {lastTurn.text}
              </span>
              ) : (
              <span className="italic text-gray-400">{getStatusText()}</span>
              )}
          </p>
        </div>

        {hasSearchResults && (
            <div className="w-full pl-4 pt-2 mt-2 border-t border-white/10">
                <div className="flex space-x-3 overflow-x-auto pb-2">
                    {searchResults.map((item, index) => (
                        <SearchResultCard key={index} item={item} onCardClick={handleCardClick} />
                    ))}
                </div>
            </div>
        )}

        {hasSources && (
            <div className="w-full px-4 pt-2 mt-2 border-t border-white/10">
                <h3 className="text-xs font-bold text-gray-400 mb-1 text-left">Mənbələr:</h3>
                <div className="flex flex-wrap items-center justify-start gap-x-4 gap-y-1">
                    {sources.map((source, index) => (
                        source.web?.uri && (
                          <a 
                              key={index} 
                              href={source.web.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs text-cyan-400 hover:text-cyan-200 hover:underline truncate max-w-[150px] sm:max-w-xs"
                              title={source.web.title || source.web.uri}
                          >
                            {source.web.title || source.web.uri}
                          </a>
                        )
                    ))}
                </div>
            </div>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          /* Custom scrollbar for webkit browsers */
          .overflow-x-auto::-webkit-scrollbar {
              height: 4px;
          }
          .overflow-x-auto::-webkit-scrollbar-track {
              background: #ffffff1a;
              border-radius: 10px;
          }
          .overflow-x-auto::-webkit-scrollbar-thumb {
              background: #4dd0e1; /* cyan-300 */
              border-radius: 10px;
          }
          .line-clamp-2 {
            overflow: hidden;
            display: -webkit-box;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 2;
          }
        `}</style>
      </div>
      {modalContent && <Modal onClose={closeModal}>{modalContent}</Modal>}
    </>
  );
};