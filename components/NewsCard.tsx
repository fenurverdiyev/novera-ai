import React from 'react';
import type { NewsArticle } from '../types';
import { ProtectedImage } from './ProtectedImage';
import { BookmarkIcon } from './Icons';

interface NewsCardProps {
  article: NewsArticle;
  onSelect: (article: NewsArticle) => void;
  variant?: 'default' | 'compact';
  style?: React.CSSProperties;
}

const timeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} il əvvəl`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} ay əvvəl`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} gün əvvəl`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} saat əvvəl`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} dəqiqə əvvəl`;
    return `${Math.floor(seconds)} saniyə əvvəl`;
};

export const NewsCard: React.FC<NewsCardProps> = ({ article, onSelect, variant = 'default', style }) => {
  if (variant === 'compact') {
    return (
      <div
        onClick={() => onSelect(article)}
        className="flex gap-4 p-3 bg-bg-slate/50 rounded-lg hover:bg-bg-onyx transition-colors cursor-pointer"
        style={style}
      >
        <ProtectedImage
          src={article.imageUrl}
          alt={article.title}
          className="w-24 h-24 object-cover rounded-md flex-shrink-0"
          proxyParams="w=512&h=512&fit=cover&output=webp&q=90"
        />
        <div className="flex flex-col">
          <h3 className="text-md font-semibold text-text-main line-clamp-3">{article.title}</h3>
          <p className="text-xs text-text-sub mt-auto">{article.source} &middot; {timeAgo(article.publishedAt)}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(article)}
      className="bg-bg-slate rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer group"
      style={style}
    >
      <div className="relative">
        <ProtectedImage
          src={article.imageUrl}
          alt={article.title}
          className="w-full h-56 object-cover"
          proxyParams="w=1280&h=720&fit=cover&output=webp&q=90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-4">
          <span className="px-2 py-1 bg-accent/80 text-bg-jet text-xs font-bold rounded capitalize">{article.category}</span>
        </div>
      </div>

      <div className="p-5">
        <h2 className="text-xl font-bold text-text-main mb-2 line-clamp-2 group-hover:text-accent transition-colors">{article.title}</h2>
        <p className="text-text-sub text-sm mb-4 line-clamp-3">{article.summary}</p>
        <div className="flex justify-between items-center text-xs text-text-sub">
          <span>{article.source} &middot; {timeAgo(article.publishedAt)}</span>
          <button className="p-2 rounded-full hover:bg-bg-onyx" aria-label="Əlfəcinə əlavə et">
            <BookmarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};