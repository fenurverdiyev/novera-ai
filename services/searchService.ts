import type { PlaceResult, NewsArticle, ShoppingProduct } from '../types';
import { fetchNewsFromNewsData } from './newsDataService';

// Optional Google CSE fallback (BrowserView already uses these)
const CSE_KEY = import.meta.env.VITE_GOOGLE_CSE_JSON_KEY as string | undefined;
const CSE_CX = import.meta.env.VITE_GOOGLE_CSE_CX as string | undefined;
const USE_CSE_VISUALS = (import.meta.env.VITE_USE_CSE_VISUALS as string | undefined) === 'true';

const SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY;
const SERPER_TIMEOUT_MS = 8000; // abort slow requests to keep UI responsive
const SERPER_CACHE_TTL_MS = 180000; // 3 minutes cache TTL
const serperCache = new Map<string, { data: any; expires: number }>();
// De-duplicate concurrent requests for the same key
const inflight = new Map<string, Promise<any>>();
const cacheKey = (
  endpoint: string,
  query: string,
  num: number,
  opts: { gl?: string; hl?: string; page?: number } = {}
) => `${endpoint}::${query}::${num}::${opts.gl || ''}::${opts.hl || ''}::${opts.page || 1}`;
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// Basic safety filters to avoid NSFW/suspicious links
const blockedHostPatterns = [
  /porn/i, /adult/i, /nsfw/i, /redtube/i, /xvideos/i, /xnxx/i, /pornhub/i, /sex/i, /nude/i, /erot/i, /hentai/i, /brazzers/i, /xhamster/i, /youjizz/i, /beeg/i, /spankbang/i,
];
const explicitKeywords = [
  'porn', 'adult', 'sex', 'nude', 'erotic', 'hentai', 'naked', 'xxx', '18+', 'yalın', 'çılpaq', 'seks', 'porno', 'ero', 'amçıq', 'sik', 'göt', 'pıçı', 'sikş', 'fahişə', 'azğın', 'yalana', 'ciplaq', 'sikiş', 'erotik', 'seviş', 'pussy', 'dick', 'cock', 'boobs', 'tits', 'anal', 'milf', 'hardcore', 'bcs', 'azgın', 'bakire'
];

export function isLikelyExplicit(url: string, title?: string, snippet?: string): boolean {
  try {
    const u = url.toLowerCase();
    if (blockedHostPatterns.some(re => re.test(u))) return true;
    const t = (title || '').toLowerCase();
    const s = (snippet || '').toLowerCase();
    if (explicitKeywords.some(kw => u.includes(kw) || t.includes(kw) || s.includes(kw))) return true;
    return false;
  } catch {
    return false;
  }
}
const allowedVideoHosts = [
  'www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'www.dailymotion.com', 'dailymotion.com'
];

function isSafeImageUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (blockedHostPatterns.some(re => re.test(url.hostname))) return false;
    // Allow if it has a common image extension
    const okExt = /(\.jpg|\.jpeg|\.png|\.webp|\.gif|\.svg|\.bmp)(\?|#|$)/i.test(url.pathname);
    if (okExt) return true;
    // Allow known reputable image/content hosts even without extension
    const knownHost = /googleusercontent|gstatic|wikimedia|wikipedia|imgur|pinimg|twimg|ggpht\.com|fbcdn\.net|cdninstagram|bitly|pixabay|pexels|unsplash|staticflickr/i.test(url.hostname);
    if (knownHost) return true;
    // Heuristic: if it's from a search engine result and looks like an image service
    if (/img|image|photo|pic/i.test(url.hostname) || /img|image|photo|pic/i.test(url.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function isSafeVideoUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== 'https:') return false;
    if (blockedHostPatterns.some(re => re.test(url.hostname))) return false;
    // Prefer well-known video hosts
    if (allowedVideoHosts.includes(url.hostname)) return true;
    // Otherwise, allow if it looks like a direct mp4/m3u8 link from reputable CDNs
    const okExt = /(\.mp4|\.webm|\.m3u8)(\?|#|$)/i.test(url.pathname);
    const knownCdn = /cdn|akamai|cloudfront|googlevideo|fbcdn/i.test(url.hostname);
    return okExt && knownCdn;
  } catch {
    return false;
  }
}

// Helper to call Serper API to avoid repetition
async function callSerperApi(
  endpoint: 'search' | 'images' | 'videos' | 'places' | 'news' | 'shopping' | 'autocomplete',
  query: string,
  num: number,
  opts: { gl?: string; hl?: string; page?: number; safeSearch?: boolean } = {}
) {
  if (!SERPER_API_KEY) {
    console.error("Serper API key not found. Will try proxy fallbacks.");
  }
  const key = cacheKey(endpoint, query, num, opts);
  const now = Date.now();
  const cached = serperCache.get(key);
  if (cached && cached.expires > now) return cached.data;

  const attemptFetch = async () => {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), SERPER_TIMEOUT_MS);
    try {
      const glLower = opts.gl ? opts.gl.toLowerCase() : undefined;
      const hlLower = opts.hl ? opts.hl.toLowerCase() : undefined;
      const response = await fetch(`https://google.serper.dev/${endpoint}`, {
        method: 'POST',
        headers: {
          'X-API-KEY': SERPER_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: query,
          num,
          page: (opts.page || 1),
          ...(opts.gl ? { gl: opts.gl.toLowerCase() } : {}),
          ...(opts.hl ? { hl: opts.hl.toLowerCase() } : {}),
          ...(opts.safeSearch ? { safeSearch: true } : {}),
        }),
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

  // De-duplicate concurrent requests
  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const p = (async () => {
    let lastErr: any = null;
    const attempts = SERPER_API_KEY ? 2 : 0; // only attempt direct calls if key exists
    for (let attempt = 0; attempt < attempts; attempt++) {
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
    // Fallback: try serverless proxy routes (Vercel/Netlify) to bypass CORS or mask key
    const proxyBody = {
      type: endpoint,
      q: query,
      num,
      ...(opts.gl ? { gl: opts.gl.toLowerCase() } : {}),
      ...(opts.hl ? { hl: opts.hl.toLowerCase() } : {}),
      ...(opts.safeSearch ? { safeSearch: true } : {}),
    } as any;
    const proxyEndpoints = [
      '/api/serper-proxy',
      '/functions/serper-proxy',
      '/.netlify/functions/serper-proxy',
    ];
    for (const url of proxyEndpoints) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(proxyBody),
        });
        if (r.ok) {
          const data = await r.json();
          serperCache.set(key, { data, expires: now + SERPER_CACHE_TTL_MS });
          return data;
        }
      } catch { }
    }
    return null;
  })();

  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}

export function detectLocaleForSearch(): { hl: string; gl: string } {
  let hl = 'en';
  let gl = 'us';
  try {
    if (typeof navigator !== 'undefined') {
      const navLang = navigator.language || 'en-US';
      const [langPart, regionPart] = navLang.split('-');
      hl = (langPart || 'en').toLowerCase();
      gl = (regionPart || 'US').toLowerCase();
    }
  } catch { }
  return { hl, gl };
}

// Types for Serper web search
export interface SerperOrganicResult { title: string; link: string; snippet: string; date?: string }
export interface SerperResponse { organic: SerperOrganicResult[] }

export async function searchWeb(query: string, num = 8, opts?: { gl?: string; hl?: string; page?: number; safeSearch?: boolean }): Promise<SerperResponse | null> {
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
export async function suggestAutocomplete(q: string, opts?: { hl?: string; gl?: string; safeSearch?: boolean }): Promise<string[]> {
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

export async function searchImagesAndVideos(query: string, maxImages = 6, maxVideos = 3, opts?: { safeSearch?: boolean }): Promise<{ images: string[]; videos: string[] }> {
  // If explicitly configured, use Google CSE as primary provider for visuals
  if (USE_CSE_VISUALS && CSE_KEY && CSE_CX) {
    try {
      const imgUrl = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(Math.max(maxImages, 1), 10)}&safe=${opts?.safeSearch ? 'active' : 'off'}`;
      const vidQ = `${query} site:youtube.com/watch`;
      const vidUrl = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(vidQ)}&num=${Math.min(Math.max(maxVideos, 1), 10)}&safe=${opts?.safeSearch ? 'active' : 'off'}`;
      const [ir, vr] = await Promise.all([fetch(imgUrl), fetch(vidUrl)]);
      const [id, vd] = await Promise.all([ir.json(), vr.json()]);
      const imgSet = new Set<string>(
        ((id.items || []) as any[])
          .map((it: any) => (it.link || it.image?.thumbnailLink || it.pagemap?.cse_image?.[0]?.src) as string)
          .filter(Boolean)
      );
      const vidSet = new Set<string>(
        ((vd.items || []) as any[])
          .map((it: any) => (it.link || it.formattedUrl || it.pagemap?.videoobject?.[0]?.url) as string)
          .filter(Boolean)
      );
      const imgs: string[] = Array.from(imgSet).slice(0, maxImages);
      const vids: string[] = Array.from(vidSet).slice(0, maxVideos);
      return { images: imgs, videos: vids };
    } catch { }
  }
  const { hl, gl } = detectLocaleForSearch();
  const hl2 = (hl || 'en').toLowerCase();
  let gl2 = (gl || 'us').toLowerCase();
  
  // Special case for Azerbaijani: if hl is 'az', but gl is 'us', maybe try 'tr' or broader search
  if (hl2 === 'az' && gl2 === 'us') gl2 = 'tr'; 

  const [imageResults, videoResults] = await Promise.all([
    callSerperApi('images', query, maxImages, { gl: gl2, hl: hl2, safeSearch: opts?.safeSearch }),
    callSerperApi('videos', query, maxVideos, { gl: gl2, hl: hl2, safeSearch: opts?.safeSearch }),
  ]);

  const imageItems: any[] = (imageResults?.images || imageResults?.image_results || []) as any[];
  const videoItems: any[] = (videoResults?.videos || videoResults?.video_results || []) as any[];

  let images = Array.from(new Set(
    imageItems.map((img: any) => img.imageUrl || img.image || img.thumbnail || img.link).filter(Boolean)
  )).filter(isSafeImageUrl);
  let videos = Array.from(new Set(
    videoItems.map((vid: any) => vid.link || vid.videoUrl || vid.url).filter(Boolean)
  )).filter(isSafeVideoUrl);

  // Fallback: try general search endpoint to harvest images/videos if empty
  if (images.length < 2 || videos.length === 0) {
    try {
      const alt = await callSerperApi('search', query, Math.max(maxImages, maxVideos), { gl: gl2, hl: hl2, safeSearch: opts?.safeSearch });
      if (alt) {
        if (images.length < 2) {
          const altImgs: any[] = (alt.images || alt.image_results || alt.inlineImages || alt.inline_images || []);
          const altImageUrls = Array.from(new Set(
            (altImgs || []).map((img: any) => img.imageUrl || img.image || img.thumbnail || img.link).filter(Boolean)
          ));
          if (altImageUrls.length) {
              const extra = altImageUrls.filter(isSafeImageUrl);
              images = Array.from(new Set([...images, ...extra])).slice(0, maxImages);
          }
        }
        if (videos.length === 0) {
          const altVids: any[] = (alt.videos || alt.video_results || alt.inlineVideos || alt.inline_videos || []);
          const altVideoUrls = Array.from(new Set(
            (altVids || []).map((vid: any) => vid.link || vid.videoUrl || vid.url).filter(Boolean)
          ));
          if (altVideoUrls.length) videos = altVideoUrls.filter(isSafeVideoUrl).slice(0, maxVideos);
        }
      }
    } catch { }
  }

  // Final fallback: broaden to 'us' if still empty and we were using a specific gl
  if (images.length === 0 && gl2 !== 'us') {
      try {
          const backup = await callSerperApi('images', query, maxImages, { gl: 'us', hl: 'en', safeSearch: opts?.safeSearch });
          const items = (backup?.images || backup?.image_results || []) as any[];
          images = items.map((img: any) => img.imageUrl || img.image || img.thumbnail || img.link).filter(Boolean).filter(isSafeImageUrl);
      } catch {}
  }

  // Final fallback: Google CSE (if configured and explicitly enabled)
  const minImg = Math.min(3, maxImages);
  const minVid = Math.min(2, maxVideos);
  if (USE_CSE_VISUALS && images.length < minImg && CSE_KEY && CSE_CX) {
    try {
      const start = 1;
      const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(Math.max(maxImages, 1), 10)}&safe=${opts?.safeSearch ? 'active' : 'off'}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const items: any[] = data.items || [];
      const cseImages = items.map((it: any) => it.link || it.image?.thumbnailLink || it.pagemap?.cse_image?.[0]?.src).filter(Boolean).filter(isSafeImageUrl);
      if (cseImages.length) {
        const merged = new Set<string>([...images, ...cseImages]);
        images = Array.from(merged).slice(0, maxImages);
      }
    } catch { }
  }
  if (USE_CSE_VISUALS && videos.length < minVid && CSE_KEY && CSE_CX) {
    try {
      const q = `${query} site:youtube.com/watch`;
      const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(q)}&num=${Math.min(Math.max(maxVideos, 1), 10)}&safe=${opts?.safeSearch ? 'active' : 'off'}`;
      const resp = await fetch(url);
      const data = await resp.json();
      const items: any[] = data.items || [];
      const cseVideos = items.map((it: any) => it.link || it.formattedUrl || it.pagemap?.videoobject?.[0]?.url).filter(Boolean).filter(isSafeVideoUrl);
      if (cseVideos.length) {
        const merged = new Set<string>([...videos, ...cseVideos]);
        videos = Array.from(merged).slice(0, maxVideos);
      }
    } catch { }
  }
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

export const searchNews = async (query: string, num = 10, opts?: { hl?: string; gl?: string; safeSearch?: boolean }): Promise<NewsArticle[]> => {
  const newsDataPromise = fetchNewsFromNewsData(query, { lang: opts?.hl, country: opts?.gl });
  const loc = detectLocaleForSearch();
  const hl = opts?.hl ?? loc.hl;
  const gl = opts?.gl ?? loc.gl;
  try {
    const serperData = await callSerperApi('news', query, num, { hl, gl, safeSearch: opts?.safeSearch });
    const serperItems: any[] = serperData?.news || serperData?.news_results || serperData?.newsResults || [];
    const serperArticles: NewsArticle[] = serperItems.map((item: any) => ({
      id: item.link || item.title,
      title: item.title,
      url: item.link,
      source: item.source || item.source_name || item.source?.name || '',
      publishedAt: item.date || item.datePublished || item.time || new Date().toISOString(),
      summary: item.snippet || item.content || item.summary || '',
      imageUrl: item.thumbnail || item.imageUrl || item.image,
      category: 'general',
    }));

    const newsDataArticles = await fetchNewsFromNewsData(query, { lang: hl, country: gl });
    const combined = [...serperArticles, ...newsDataArticles];
    const unique = Array.from(new Map(combined.map(item => [item.url, item])).values());
    return unique.slice(0, num);
  } catch (e) {
    console.error('Serper news failed:', e);
    // In case of Serper failure, still try to return NewsData results
    try {
      const newsDataArticles = await newsDataPromise;
      return newsDataArticles.slice(0, num);
    } catch (e2) {
      console.error('NewsData fallback failed:', e2);
      return [];
    }
  }
};
export const searchShopping = async (query: string, num = 10, opts?: { safeSearch?: boolean }): Promise<ShoppingProduct[]> => {
  const { hl, gl } = detectLocaleForSearch();
  try {
    const data = await callSerperApi('shopping', query, num, { hl, gl, safeSearch: opts?.safeSearch });
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
