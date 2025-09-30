import type { NewsArticle, NewsDataArticle } from '../types';

const API_KEY = import.meta.env.VITE_NEWSDATA_API_KEY;
const BASE_URL = 'https://newsdata.io/api/1/news';

const mapToNewsArticle = (article: NewsDataArticle): NewsArticle => ({
  id: article.link || article.title || Date.now().toString(),
  source: article.source_id || 'Unknown Source',
  title: article.title || '',
  summary: article.description || '',
  imageUrl: article.image_url || null,
  url: article.link || '',
  publishedAt: article.pubDate || new Date().toISOString(),
  content: article.content || '',
  category: article.category?.[0] || 'general',
});

export const fetchNewsFromNewsData = async (query: string, options: { lang?: string, country?: string, category?: string } = {}): Promise<NewsArticle[]> => {
  if (!API_KEY) {
    console.warn('NewsData.io API key is missing.');
    return [];
  }

  const params = new URLSearchParams({
    apikey: API_KEY,
    q: query,
    language: options.lang || 'en',
    country: options.country || 'us',
    category: options.category || 'top',
  });

  try {
    const response = await fetch(`${BASE_URL}?${params.toString()}`);
    if (!response.ok) {
      console.error('Failed to fetch news from NewsData.io:', response.statusText);
      return [];
    }

    const data = await response.json();
    if (data.status === 'success' && data.results) {
      return data.results.map(mapToNewsArticle);
    }
    return [];
  } catch (error) {
    console.error('Error fetching news from NewsData.io:', error);
    return [];
  }
};
