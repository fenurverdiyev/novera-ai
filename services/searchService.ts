import type { PlaceResult, SearchNewsItem, ShoppingProduct } from '../types';

const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY;
const SERPER_TIMEOUT_MS = 8000; // abort slow requests to keep UI responsive
const SERPER_CACHE_TTL_MS = 180000; // 3 minutes cache TTL
const serperCache = new Map<string, { data: any; expires: number }>();
const cacheKey = (
  endpoint: string,
  query: string,
  num: number,
  opts: { gl?: string; hl?: string } = {}
) => `${endpoint}::${query}::${num}::${opts.gl || ''}::${opts.hl || ''}`;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Helper to call Serper API to avoid repetition
async function callSerperApi(
  endpoint: 'search' | 'images' | 'videos' | 'places' | 'news' | 'shopping' | 'autocomplete',
  query: string,
  num: number,
  opts: { gl?: string; hl?: string } = {}
) {
  if (!SERPER_API_KEY) {
    console.error("Serper API key not found.");
    return null;
  }
  const key = cacheKey(endpoint, query, num, opts);
  const now = Date.now();
  const cached = serperCache.get(key);
  if (cached && cached.expires > now) return cached.data;

  const attemptFetch = async () => {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    try {
      const response = await fetch(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ q: query, num, ...opts }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
      return await response.json();
    } finally {
      clearTimeout(to);
    }
  };

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await attemptFetch();
      serperCache.set(key, { data, expires: now + SERPER_CACHE_TTL_MS });
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await sleep(400);
    }
  }
  console.error(`Serper ${endpoint} API error:`, lastErr);
  return null;
}

export function detectLocaleForSearch(): { hl: string; gl: string } {
  let hl = 'en';
  let gl = 'us';
  try {
    if (typeof navigator !== 'undefined') {
      const navLang = navigator.language || 'en-US';
      const [langPart, regionPart] = navLang.split('-');
      hl = langPart || 'en';
      gl = regionPart || 'US';
    }
  } catch {}
  return { hl, gl };
}

// Types for Serper web search
export interface SerperOrganicResult { title: string; link: string; snippet: string; date?: string }
export interface SerperResponse { organic: SerperOrganicResult[] }

export async function searchWeb(query: string, num = 8, opts?: { gl?: string; hl?: string }): Promise<SerperResponse | null> {
  const data = await callSerperApi('search', query, num, opts);
  if (!data) return null;
  const organic = (data.organic || []).map((r: any) => ({
    title: r.title,
    link: r.link,
    snippet: r.snippet,
    date: r.date,
  }));
  return { organic };
}

// Autocomplete suggestions via Serper
export async function suggestAutocomplete(q: string, opts?: { hl?: string; gl?: string }): Promise<string[]> {
  const { hl, gl } = opts || detectLocaleForSearch();
  try {
    const data = await callSerperApi('autocomplete', q, 10, { hl, gl });
    if (!data) return [];
    const raw = data.suggestions || data.suggestion || data.autocomplete || [];
    return (raw as any[])
      .map((s: any) =>
        typeof s === 'string' ? s : (s.value || s.term || s.suggestion || s.query || '')
      )
      .filter(Boolean);
  } catch (e) {
    console.error('Serper autocomplete failed:', e);
    return [];
  }
}

export async function searchImagesAndVideos(query: string, maxImages = 6, maxVideos = 3): Promise<{ images: string[]; videos: string[] }> {
  const { hl, gl } = detectLocaleForSearch();
  const [imageResults, videoResults] = await Promise.all([
    callSerperApi('images', query, maxImages, { gl, hl }),
    callSerperApi('videos', query, maxVideos, { gl, hl }),
  ]);

  const images = Array.from(new Set((imageResults?.images || []).map((img: any) => img.imageUrl).filter(Boolean)));
  const videos = Array.from(new Set((videoResults?.videos || []).map((vid: any) => vid.link).filter(Boolean)));
  return { images, videos };
}

export async function searchPlaces(query: string, num = 8, opts?: { gl?: string; hl?: string }): Promise<PlaceResult[] | null> {
  const data = await callSerperApi('places', query, num, opts);
  if (!data || !data.places) return null;

  return (data.places as any[]).map((p: any) => ({
    title: p.title || '',
    rating: p.rating || null,
    reviewsCount: p.reviews || null,
    address: p.address || null,
    category: p.category || null,
    phoneNumber: p.phoneNumber || null,
    website: p.website || null,
    mapsUrl: p.link || null,
    thumbnailUrl: p.thumbnailUrl || null,
  }));
}

export const searchNews = async (query: string, num = 10, opts?: { hl?: string; gl?: string }): Promise<SearchNewsItem[]> => {
  const loc = detectLocaleForSearch();
  const hl = opts?.hl ?? loc.hl;
  const gl = opts?.gl ?? loc.gl;
  try {
    const data = await callSerperApi('news', query, num, { hl, gl });
    const items: any[] = data?.news || data?.news_results || data?.newsResults || [];
    return items.map((item: any) => ({
      title: item.title,
      link: item.link,
      source: item.source || item.source_name || item.source?.name || '',
      date: item.date || item.datePublished || item.time || '',
      snippet: item.snippet || item.content || item.summary || '',
      thumbnail: item.thumbnail || item.imageUrl || item.image,
    }));
  } catch (e) {
    console.error('Serper news failed:', e);
    return [];
  }
};

export const searchShopping = async (query: string, num = 10): Promise<ShoppingProduct[]> => {
  const { hl, gl } = detectLocaleForSearch();
  try {
    const data = await callSerperApi('shopping', query, num, { hl, gl });
    const items: any[] = data?.shopping || data?.shopping_results || data?.products || [];
    return items.map((item: any) => ({
      title: item.title,
      link: item.link,
      price: item.price || item.priceText || item.extracted_price_text || '',
      source: item.source || item.store || '',
      rating: typeof item.rating === 'number' ? item.rating : (item.rating?.value || undefined),
      reviews: item.reviews || item.reviews_count || item.reviewsCount,
      imageUrl: item.thumbnail || item.image || item.imageUrl,
    }));
  } catch (e) {
    console.error('Serper shopping failed:', e);
    return [];
  }
};
