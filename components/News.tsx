import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchNews } from '../services/newsService';
import type { NewsArticle } from '../types';
import { useGeolocation } from '../hooks/useGeolocation';
import { NewsScreen } from './NewsScreen';
import { NewsArticle as NewsArticleView } from './NewsArticle';

// Ölkə kodlarına uyğun dillər
const countryLanguageMap: Record<string, string> = {
  az: 'az',
  tr: 'tr',
  ru: 'ru',
  us: 'en',
  gb: 'en',
};

export const News: React.FC<{ themeColor?: string }> = ({ themeColor }) => {
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('general'); 
  const [language, setLanguage] = useState('az'); 
  const [region, setRegion] = useState<'world' | 'local'>('local');
  const [hasManualLanguage, setHasManualLanguage] = useState(false);
  
  const { countryCode, loading: geoLoading, error: geoError } = useGeolocation();

  // Initialize from saved preference if available
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('nov-era-news-language');
      if (savedLang) {
        setLanguage(savedLang);
        setHasManualLanguage(true);
      }
    } catch {}
  }, []);

  // Geolokasiyaya görə dili təyin et (yalnız istifadəçi manual dəyişməyibsə)
  useEffect(() => {
    if (region === 'local' && countryCode && !hasManualLanguage) {
      const lang = countryLanguageMap[countryCode] || 'en';
      setLanguage(lang);
    }
  }, [countryCode, region, hasManualLanguage]);

  // İstifadəçi dil seçimini dəyişdikdə manual rejimə keç
  const handleSetLanguage = (lang: string) => {
    setHasManualLanguage(true);
    setLanguage(lang);
    try { localStorage.setItem('nov-era-news-language', lang); } catch {}
  };

  const countryToFetch = region === 'local' && countryCode ? countryCode : null;

  const { data: articles = [], isLoading, isError } = useQuery<NewsArticle[]>({
    queryKey: ['news', activeCategory, language, countryToFetch],
    queryFn: () => fetchNews({ category: activeCategory, language, country: countryToFetch }),
    staleTime: 5 * 60 * 1000, 
    gcTime: 10 * 60 * 1000, 
  });
  
  const handleArticleSelect = (article: NewsArticle) => {
      setSelectedArticle(article);
      window.scrollTo(0, 0);
  };

  const handleBack = () => {
      setSelectedArticle(null);
  };

  if (selectedArticle) {
      return <NewsArticleView article={selectedArticle} allArticles={articles} onBack={handleBack} onArticleSelect={handleArticleSelect} />;
  }

  return (
    <NewsScreen
        articles={articles}
        isLoading={isLoading || geoLoading}
        isError={isError}
        onArticleSelect={handleArticleSelect}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        region={region}
        setRegion={setRegion}
        language={language}
        setLanguage={handleSetLanguage}
        isGeolocationEnabled={!!countryCode || !!geoError}
        themeColor={themeColor}
    />
  );
};
