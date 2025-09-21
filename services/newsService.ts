import type { NewsArticle } from '../types';
import { searchNews as serperSearchNews } from './searchService';

const GNEWS_API_KEY = import.meta.env.VITE_GNEWS_API_KEY;

// Mappings
const azCategoryToEn: { [key: string]: string } = {
    'siyasət': 'politics',
    'idman': 'sports',
    'texnologiya': 'technology',
    'mədəniyyət': 'entertainment',
    'iqtisadiyyat': 'business',
    'səhiyyə': 'health',
    'elm': 'science',
    'dünya': 'world',
};

const gnewsCategoryMap: { [key: string]: string } = {
    'general': 'general',
    'business': 'business',
    'technology': 'technology',
    'entertainment': 'entertainment',
    'health': 'health',
    'science': 'science',
    'sports': 'sports',
};

// Smart Categorization Keywords (in Azerbaijani)
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
            if (content.includes(keyword)) {
                return category;
            }
        }
    }
    return 'general'; // Default category
};

// Build a simple localized query for Serper fallback
const buildFallbackQuery = (category: string, language: string, country?: string | null) => {
    const catTr: Record<string, string> = {
        general: 'gündem', business: 'ekonomi', technology: 'teknoloji', entertainment: 'eğlence', health: 'sağlık', science: 'bilim', sports: 'spor'
    };
    const catAz: Record<string, string> = {
        general: 'xəbərlər', business: 'iqtisadiyyat', technology: 'texnologiya', entertainment: 'mədəniyyət', health: 'səhiyyə', science: 'elm', sports: 'idman'
    };
    const catRu: Record<string, string> = {
        general: 'новости', business: 'экономика', technology: 'технологии', entertainment: 'развлечения', health: 'здоровье', science: 'наука', sports: 'спорт'
    };
    const catEn: Record<string, string> = {
        general: 'news', business: 'business', technology: 'technology', entertainment: 'entertainment', health: 'health', science: 'science', sports: 'sports'
    };

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
    // Serper expects country codes like 'tr','ru','us','gb'. 'az' may not be supported but we can still pass it; if unsupported, Serper ignores it.
    return gl;
};

const fetchGNews = async (category: string, language: string, country: string | null): Promise<NewsArticle[]> => {
    let url = `https://gnews.io/api/v4/top-headlines?apikey=${GNEWS_API_KEY}&lang=${language}`;

    const gnewsCategory = gnewsCategoryMap[category];
    if (gnewsCategory) {
        url += `&topic=${gnewsCategory}`;
    }

    if (country) {
        url += `&country=${country}`;
    }

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
        console.error("Failed to fetch from GNews:", error);
        return [];
    }
};

export const fetchNews = async ({ category = 'general', language = 'az', country = null }: { category?: string, language?: string, country?: string | null }): Promise<NewsArticle[]> => {
    let combined: NewsArticle[] = [];

    if (language === 'all') {
        // Aggregate across key languages to simulate "all languages"
        const langList = ['az', 'tr', 'ru', 'en'];
        const results = await Promise.all(langList.map(l => fetchGNews(category, l, country)));
        combined = results.flat();
    } else {
        const gnewsArticles = await fetchGNews(category, language, country);
        combined = [...gnewsArticles];
    }

    // Fallback: if GNews returns no results (or very few), try Serper News
    if (combined.length < 3) {
        try {
            const query = buildFallbackQuery(category, language, country || undefined);
            const serperItems = await serperSearchNews(query, 20, { gl: toGL(country), hl: toHL(language) });
            if (serperItems && serperItems.length) {
                const mapped: NewsArticle[] = serperItems.map((n, index) => ({
                    id: `${n.link}-${index}`,
                    title: n.title,
                    summary: n.snippet || null,
                    url: n.link,
                    source: n.source || 'Serper',
                    imageUrl: (n as any).imageUrl || null,
                    publishedAt: n.date || new Date().toISOString(),
                }));
                combined = [...combined, ...mapped];
            }
        } catch (e) {
            console.warn('Serper News fallback failed:', e);
        }
    }

    // Deduplicate (still useful in case GNews returns duplicates)
    const uniqueArticles = new Map<string, NewsArticle>();
    combined.forEach(article => {
        // Normalize title for better deduplication
        const normalizedTitle = article.title.toLowerCase().trim();
        if (!uniqueArticles.has(normalizedTitle)) {
            uniqueArticles.set(normalizedTitle, article);
        }
    });

    const articles = Array.from(uniqueArticles.values());

    // Smart categorize and sort
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

    return scores
        .sort((a, b) => b.score - a.score)
        .slice(0, count)
        .map(item => item.article);
};