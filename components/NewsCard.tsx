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
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); onSelect(article); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(article); } }}
        className="relative flex gap-4 p-3 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 cursor-pointer transition-all duration-300 ease-out transform-gpu hover:-translate-y-0.5 hover:scale-[1.035] ring-1 ring-transparent hover:ring-accent/40 group"
        style={style}
      >
        <ProtectedImage
          src={article.imageUrl}
          alt={article.title}
          className="w-24 h-24 object-cover rounded-md flex-shrink-0 transition-transform duration-300 ease-out group-hover:scale-[1.05]"
          proxyParams="w=512&h=512&fit=cover&output=webp&q=90"
        />
        <div className="flex flex-col">
          <h3 className="text-md font-semibold text-text-main line-clamp-3">{article.title}</h3>
          <p className="text-xs text-text-sub mt-auto">{article.source} &middot; {timeAgo(article.publishedAt)}</p>
        </div>
        <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden">
          <div className="h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent), transparent 65%), transparent)', animation: 'novShimmer 2.8s linear infinite' }} />
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onSelect(article); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(article); } }}
      className="relative bg-white/5 border border-white/10 rounded-xl overflow-hidden backdrop-blur-sm shadow-lg hover:shadow-2xl transition-transform duration-300 ease-out transform-gpu hover:-translate-y-1 hover:scale-[1.04] cursor-pointer group ring-1 ring-transparent hover:ring-accent/40"
      style={style}
    >
      <div className="relative">
        <ProtectedImage
          src={article.imageUrl}
          alt={article.title}
          className="w-full h-56 object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
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
      <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden">
        <div className="h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--color-accent), transparent 65%), transparent)', animation: 'novShimmer 2.8s linear infinite' }} />
      </div>
    </div>
  );
};