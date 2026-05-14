import React, { useEffect, useRef, useState } from 'react';
import type { NewsArticle } from '../types';
import { NewsCard } from './NewsCard';
import { LoadingSpinner, AlertTriangleIcon, SearchIcon, GlobeIcon, MapPinIcon } from './Icons';

interface NewsScreenProps {
  articles: NewsArticle[];
  isLoading: boolean;
  isError: boolean;
  onArticleSelect: (article: NewsArticle) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  activeCategory: string;
  setActiveCategory: (category: string) => void;
  region: 'world' | 'local';
  setRegion: (region: 'world' | 'local') => void;
  language: string;
  setLanguage: (language: string) => void;
  isGeolocationEnabled: boolean;
  themeColor?: string;
}

const categories = [
  { id: 'general', name: 'Ümumi' },
  { id: 'business', name: 'Biznes' },
  { id: 'technology', name: 'Texnologiya' },
  { id: 'entertainment', name: 'Əyləncə' },
  { id: 'health', name: 'Sağlamlıq' },
  { id: 'science', name: 'Elm' },
  { id: 'sports', name: 'İdman' },
];

const languages = [
  { code: 'all', name: 'Bütün dillər', emoji: '🌐' },
  { code: 'az', name: 'Azərbaycan', emoji: '🇦🇿' },
  { code: 'tr', name: 'Türk', emoji: '🇹🇷' },
  { code: 'ru', name: 'Rus', emoji: '🇷🇺' },
  { code: 'en', name: 'İngilis', emoji: '🇬🇧' },
];

export const NewsScreen: React.FC<NewsScreenProps> = ({
  articles,
  isLoading,
  isError,
  onArticleSelect,
  searchQuery,
  setSearchQuery,
  activeCategory,
  setActiveCategory,
  region,
  setRegion,
  language,
  setLanguage,
  isGeolocationEnabled,
  themeColor,
}) => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement | null>(null);
  const selectedLanguage = languages.find(l => l.code === language) || languages[0];

  useEffect(() => {
    const onDocClick = (e: any) => {
      if (!langRef.current) return;
      if (!langRef.current.contains(e.target)) setLangOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLangOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const filteredArticles = articles.filter((article) =>
    article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    article.summary?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCategoryClick = (category: string) => {
    if (activeCategory === category) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveCategory(category);
      setIsTransitioning(false);
    }, 250); // Corresponds with fade-out duration
  };

  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-bg-jet/90 backdrop-blur-sm pb-32 md:pb-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-text-main mb-2">Xəbərlər</h1>
        <p className="text-text-sub">Dünyadan və bölgənizdən ən son xəbərlər.</p>

        <div className="mt-6 flex flex-col md:flex-row gap-4">
          <div className="relative flex-grow">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-sub" />
            <input
              type="text"
              placeholder="Xəbərlərdə axtar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg text-text-main bg-white/5 border border-white/10 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-accent ring-1 ring-transparent"
            />
            <div className="pointer-events-none absolute left-0 right-0 bottom-0 h-[2px] overflow-hidden">
              <div className="h-full w-1/3" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', animation: 'novShimmer 2.8s linear infinite' }} />
            </div>
          </div>
          {isGeolocationEnabled && (
            <div className="flex p-1 rounded-lg bg-white/5 border border-white/10 backdrop-blur-sm">
              <button
                onClick={() => setRegion('world')}
                className={`px-3 py-1 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ease-out ${
                  region === 'world' ? 'bg-white/10 text-accent ring-1 ring-accent/30' : 'text-text-sub hover:bg-white/10'
                }`}
              >
                <GlobeIcon className="w-4 h-4" /> Dünya
              </button>
              <button
                onClick={() => setRegion('local')}
                className={`px-3 py-1 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ease-out ${
                  region === 'local' ? 'bg-white/10 text-accent ring-1 ring-accent/30' : 'text-text-sub hover:bg-white/10'
                }`}
              >
                <MapPinIcon className="w-4 h-4" /> Sizin Bölgə
              </button>
            </div>
          )}
          <div ref={langRef} className="relative min-w-[190px]">
            <button
              type="button"
              aria-expanded={langOpen}
              onClick={() => setLangOpen(v => !v)}
              className="w-full p-2 rounded-lg text-text-main bg-white/5 border border-white/10 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-white/10 bg-white/10 text-white/80">{selectedLanguage.code}</span>
                <span className="text-base">{(selectedLanguage as any).emoji || ''}</span>
                <span>{selectedLanguage.name}</span>
              </span>
              <svg className={`w-4 h-4 transition-transform duration-150 ${langOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
            <div className={`absolute top-full left-0 right-0 mt-2 z-40 bg-bg-onyx/90 border border-white/10 rounded-xl shadow-2xl backdrop-blur-md origin-top transition-all duration-120 ${langOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'}`}>
              <div className="pointer-events-none relative h-[2px] overflow-hidden rounded-t-xl">
                <div className="absolute inset-y-0 left-0 w-1/3" style={{ background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)', animation: 'novShimmer 2.8s linear infinite' }} />
              </div>
              <div className="max-h-60 overflow-y-auto p-1">
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => { setLanguage(lang.code); setLangOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md hover:bg-white/15 text-white/90 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent/30 ${language === lang.code ? 'bg-white/10 ring-1 ring-accent/30' : ''}`}
                  >
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-white/10 bg-white/10 text-white/80">{lang.code}</span>
                    <span className="mr-1">{(lang as any).emoji || ''}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mb-8 overflow-x-auto pb-2 -mx-4 px-4">
        <div className="flex space-x-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategoryClick(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200 ease-out ring-1 ${
                activeCategory === cat.id
                  ? 'text-white shadow-md ring-accent/40'
                  : 'bg-white/5 border border-white/10 backdrop-blur-sm text-text-sub hover:bg-white/10 ring-transparent hover:ring-accent/30 hover:-translate-y-0.5'
              }`}
              style={activeCategory === cat.id ? { backgroundColor: themeColor, boxShadow: `0 0 10px ${themeColor}` } : {}}
            >
              {cat.name.charAt(0).toUpperCase() + cat.name.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner className="w-12 h-12 text-accent" />
        </div>
      ) : isError ? (
        <div className="flex flex-col justify-center items-center h-64 text-center text-text-sub">
          <AlertTriangleIcon className="w-16 h-16 text-yellow-500 mb-4" />
          <p className="max-w-md">
            Xəbərləri yükləmək mümkün olmadı. Zəhmət olmasa, daha sonra yenidən cəhd edin.
          </p>
        </div>
      ) : (
        <div
          className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 transition-opacity duration-200 ${
            isTransitioning ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {filteredArticles.map((article, index) => (
            <NewsCard
              key={article.id}
              article={article}
              onSelect={onArticleSelect}
              style={{ animation: `fadeInUp 0.5s ${index * 0.05}s ease-out both` }}
            />
          ))}
        </div>
      )}
      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes novShimmer {
          0% { transform: translateX(-50%); opacity: 0.25; }
          50% { opacity: 0.9; }
          100% { transform: translateX(150%); opacity: 0.25; }
        }
      `}</style>
    </div>
  );
};