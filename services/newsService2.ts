import type { NewsArticle } from '../types';
import { searchNews as serperSearchNews } from './searchService';

const GNEWS_API_KEY = import.meta.env.VITE_GNEWS_API_KEY as string | undefined;
const NEWSDATA_API_KEYS = import.meta.env.VITE_NEWSDATA_API_KEYS as string | undefined;
const NEWSDATA_API_KEY = import.meta.env.VITE_NEWSDATA_API_KEY as string | undefined;

// Category maps
const gnewsCategoryMap: { [key: string]: string } = {
  'general': 'general',
  'business': 'business',
  'technology': 'technology',
  'entertainment': 'entertainment',
  'health': 'health',
  'science': 'science',
  'sports': 'sports',
};

// Smart Categorization Keywords (AZ)
const categoryKeywords: { [key: string]: string[] } = {
  'siyasət': ['hökumət', 'nazir', 'parlament', 'prezident', 'seçki', 'qanun', 'partiya'],
  'idman': ['futbol', 'qarabağ', 'neftçi', 'klub', 'oyun', 'çempionat', 'idmançı', 'komanda'],
  'texnologiya': ['ai', 'süni intellekt', 'kompüter', 'internet', 'mobil', 'proqram', 'google', 'apple', 'meta'],
  'mədəniyyət': ['musiqi', 'film', 'kino', 'teatr', 'sərgi', 'incəsənət', 'kitab', 'festival'],
  'iqtisadiyyat': ['iqtisadiyyat', 'biznes', 'şirkət', 'investisiya', 'bank', 'dollar', 'manat', 'neft'],
  'səhiyyə': ['səhiyyə', 'xəstəxana', 'həkim', 'virus', 'covid', 'sağlamlıq', 'dərman'],
  'elm': ['elm', 'tədqiqat', 'kəşf', 'kosmos', 'nasa', 'alimlər', 'universitet'],
  'sports': ['futbol', 'qarabağ', 'neftçi', 'klub', 'oyun', 'çempionat', 'idmançı', 'komanda'],
  'science': ['elm', 'tədqiqat', 'kəşf', 'kosmos', 'nasa', 'alimlər', 'universitet'],
};

const smartCategorize = (article: NewsArticle): string => {
  const content = `${article.title.toLowerCase()} ${article.summary?.toLowerCase() || ''}`;
  for (const category in categoryKeywords) {
    for (const keyword of categoryKeywords[category]) {
      if (content.includes(keyword)) return category;
    }
  }
  return 'general';
};

// Fallback query text for Serper news
const buildFallbackQuery = (category: string, language: string, country?: string | null) => {
  const catTr: Record<string, string> = { general: 'gündem', business: 'ekonomi', technology: 'teknoloji', entertainment: 'eğlence', health: 'sağlık', science: 'bilim', sports: 'spor' };
  const catAz: Record<string, string> = { general: 'xəbərlər', business: 'iqtisadiyyat', technology: 'texnologiya', entertainment: 'mədəniyyət', health: 'səhiyyə', science: 'elm', sports: 'idman' };
  const catRu: Record<string, string> = { general: 'новости', business: 'экономика', technology: 'технологии', entertainment: 'развлечения', health: 'здоровье', science: 'наука', sports: 'спорт' };
  const catEn: Record<string, string> = { general: 'news', business: 'business', technology: 'technology', entertainment: 'entertainment', health: 'health', science: 'science', sports: 'sports' };
  const lc = language.toLowerCase();
  const cc = (country || '').toLowerCase();
  const cat = (lc === 'tr' ? catTr : lc === 'az' ? catAz : lc === 'ru' ? catRu : catEn)[category] || (catEn[category] || 'news');
  if (lc === 'tr') return `Türkiye ${cat} haberleri`;
  if (lc === 'az') return `Azərbaycan ${cat}`;
  if (lc === 'ru') return `Россия ${cat}`;
  return `${cc ? cc.toUpperCase() + ' ' : ''}${cat}`;
};

const toHL = (language: string) => {
  const hl = language.toLowerCase();
  if (['az', 'tr', 'ru', 'en'].includes(hl)) return hl;
  return 'en';
};

const toGL = (country?: string | null) => {
  if (!country) return undefined;
  const gl = country.toLowerCase();
  return gl;
};

// Normalize language for GNews (no 'az' => use 'tr')
const normalizeLangForGNews = (language: string): string => {
  const l = (language || 'en').toLowerCase();
  if (l === 'az') return 'tr';
  const supported = ['en','tr','ru','de','fr','it','es','pt','ar','hi','zh'];
  return supported.includes(l) ? l : 'en';
};

const fetchGNews = async (category: string, language: string, country: string | null): Promise<NewsArticle[]> => {
  if (!GNEWS_API_KEY) return [];
  const langParam = normalizeLangForGNews(language);
  let url = `https://gnews.io/api/v4/top-headlines?apikey=${GNEWS_API_KEY}&lang=${langParam}`;
  const gnewsCategory = gnewsCategoryMap[category];
  if (gnewsCategory) url += `&topic=${gnewsCategory}`;
  if (country) url += `&country=${country}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`GNews API error: ${response.statusText}`);
    const data = await response.json();
    return (data.articles || []).map((article: any, index: number): NewsArticle => ({
      id: `${article.source.name}-${article.publishedAt}-${index}`,
      title: article.title,
      summary: article.description,
      url: article.url,
      source: article.source.name,
      imageUrl: article.image,
      publishedAt: article.publishedAt,
      content: article.content,
    }));
  } catch (error) {
    console.error('Failed to fetch from GNews:', error);
    return [];
  }
};

// Parse NewsData.io keys from env
// Supports:
// - VITE_NEWSDATA_API_KEYS: comma/semicolon/newline separated list
// - VITE_NEWSDATA_API_KEY: single key
const getNewsDataKeys = (): string[] => {
  const keys: string[] = [];
  if (NEWSDATA_API_KEYS) {
    keys.push(...NEWSDATA_API_KEYS.split(/[;,\n]+/).map(s => s.trim()).filter(Boolean));
  }
  if (NEWSDATA_API_KEY) {
    keys.push(NEWSDATA_API_KEY.trim());
  }
  // De-duplicate
  return Array.from(new Set(keys.filter(Boolean)));
};

const newsDataCategoryMap: { [key: string]: string } = {
  general: 'top',
  business: 'business',
  technology: 'technology',
  entertainment: 'entertainment',
  health: 'health',
  science: 'science',
  sports: 'sports',
};

const fetchNewsDataIo = async (category: string, language: string, country: string | null): Promise<NewsArticle[]> => {
  const keys = getNewsDataKeys();
  if (!keys.length) return [];
  const langParam = language === 'all' ? 'az,tr,ru,en' : (language || 'en').toLowerCase();
  const ndCategory = newsDataCategoryMap[category] || 'top';
  const params = new URLSearchParams({ language: langParam, category: ndCategory });
  if (country) params.set('country', country.toLowerCase());
  params.set('image', '1');

  for (const key of keys) {
    const url = `https://newsdata.io/api/1/news?apikey=${encodeURIComponent(key)}&${params.toString()}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const data = await resp.json();
      const items: any[] = data.results || data.articles || [];
      if (!items || !items.length) continue;
      return items.map((a: any, i: number): NewsArticle => ({
        id: `${a.source_id || a.source || 'newsdata'}-${a.pubDate || a.publishedAt || i}-${i}`,
        title: a.title,
        summary: a.description || a.excerpt || null,
        url: a.link || a.url,
        source: a.source_id || a.source || (Array.isArray(a.creator) ? a.creator[0] : a.creator) || 'NewsData.io',
        imageUrl: a.image_url || a.image || null,
        publishedAt: a.pubDate || a.publishedAt || new Date().toISOString(),
        content: a.content || null,
      }));
    } catch {
      continue;
    }
  }
  return [];
};

export const fetchNews = async ({ category = 'general', language = 'az', country = null }: { category?: string, language?: string, country?: string | null }): Promise<NewsArticle[]> => {
  let combined: NewsArticle[] = [];

  if (language === 'all') {
    const langList = ['az', 'tr', 'ru', 'en'];
    const [gnewsResults, newsDataResults] = await Promise.all([
      Promise.all(langList.map(l => fetchGNews(category, l, country))),
      Promise.all(langList.map(l => fetchNewsDataIo(category, l, country))),
    ]);
    combined = [...gnewsResults.flat(), ...newsDataResults.flat()];
  } else {
    const [gnewsArticles, newsDataArticles] = await Promise.all([
      fetchGNews(category, language, country),
      fetchNewsDataIo(category, language, country),
    ]);
    combined = [...gnewsArticles, ...newsDataArticles];
  }

  // Fallback to Serper news if few results
  if (combined.length < 3) {
    try {
      if (language === 'all') {
        const langList = ['az', 'tr', 'ru', 'en'];
        const serperResults = await Promise.all(langList.map(async (l) => {
          const q = buildFallbackQuery(category, l, country || undefined);
          const items = await serperSearchNews(q, 20, { gl: toGL(country), hl: toHL(l) });
          return (items || []).map((n: any, idx: number): NewsArticle => ({
            id: `${l}-${n.link}-${idx}`,
            title: n.title,
            summary: n.snippet || null,
            url: n.link,
            source: n.source || 'Serper',
            imageUrl: (n as any).thumbnail || (n as any).imageUrl || null,
            publishedAt: n.date || new Date().toISOString(),
          }));
        }));
        combined = [...combined, ...serperResults.flat()];
      } else {
        const query = buildFallbackQuery(category, language, country || undefined);
        const serperItems = await serperSearchNews(query, 20, { gl: toGL(country), hl: toHL(language) });
        if (serperItems && serperItems.length) {
          const mapped: NewsArticle[] = serperItems.map((n, index) => ({
            id: `${n.link}-${index}`,
            title: n.title,
            summary: n.snippet || null,
            url: n.link,
            source: n.source || 'Serper',
            imageUrl: (n as any).thumbnail || (n as any).imageUrl || null,
            publishedAt: n.date || new Date().toISOString(),
          }));
          combined = [...combined, ...mapped];
        }
      }
    } catch (e) {
      console.warn('Serper News fallback failed:', e);
    }
  }

  // Deduplicate by normalized title
  const uniqueArticles = new Map<string, NewsArticle>();
  combined.forEach(article => {
    const normalizedTitle = article.title.toLowerCase().trim();
    if (!uniqueArticles.has(normalizedTitle)) {
      uniqueArticles.set(normalizedTitle, article);
    }
  });

  const articles = Array.from(uniqueArticles.values());

  // Smart categorize and sort by date desc
  const processedArticles = articles.map(article => {
    const azCategory = smartCategorize(article);
    return { ...article, category: azCategory };
  }).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return processedArticles;
};

// Similarity scoring for related news
export const findSimilarNews = (currentArticle: NewsArticle, allArticles: NewsArticle[], count: number = 4): NewsArticle[] => {
  const currentTitleWords = new Set(currentArticle.title.toLowerCase().split(/\s+/));
  const scores = allArticles
    .filter(article => article.id !== currentArticle.id)
    .map(article => {
      const otherTitleWords = new Set(article.title.toLowerCase().split(/\s+/));
      const intersection = new Set([...currentTitleWords].filter(word => otherTitleWords.has(word)));
      const union = new Set([...currentTitleWords, ...otherTitleWords]);
      const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;
      return { article, score: jaccardSimilarity };
    });
  return scores.sort((a, b) => b.score - a.score).slice(0, count).map(item => item.article);
};
