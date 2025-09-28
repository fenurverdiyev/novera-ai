import type { PlaceResult, SearchNewsItem, ShoppingProduct } from '../types';

// Optional Google CSE fallback (BrowserView already uses these)
const CSE_KEY = import.meta.env.VITE_GOOGLE_CSE_JSON_KEY as string | undefined;
const CSE_CX = import.meta.env.VITE_GOOGLE_CSE_CX as string | undefined;
const USE_CSE_VISUALS = (import.meta.env.VITE_USE_CSE_VISUALS as string | undefined) === 'true';

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
        body: JSON.stringify({ q: query, num, ...(glLower ? { gl: glLower } : {}), ...(hlLower ? { hl: hlLower } : {}), }),
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
    } catch {}
  }
  return null;
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
  // If explicitly configured, use Google CSE as primary provider for visuals
  if (USE_CSE_VISUALS && CSE_KEY && CSE_CX) {
    try {
      const imgUrl = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(Math.max(maxImages,1),10)}&safe=active`;
      const vidQ = `${query} site:youtube.com/watch`;
      const vidUrl = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(vidQ)}&num=${Math.min(Math.max(maxVideos,1),10)}&safe=active`;
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
    } catch {}
  }
  const { hl, gl } = detectLocaleForSearch();
  const hl2 = (hl || 'en').toLowerCase();
  const gl2 = (gl || 'us').toLowerCase();
  const [imageResults, videoResults] = await Promise.all([
    callSerperApi('images', query, maxImages, { gl: gl2, hl: hl2 }),
    callSerperApi('videos', query, maxVideos, { gl: gl2, hl: hl2 }),
  ]);

  const imageItems: any[] = (imageResults?.images || imageResults?.image_results || []) as any[];
  const videoItems: any[] = (videoResults?.videos || videoResults?.video_results || []) as any[];

  let images = Array.from(new Set(
    imageItems.map((img: any) => img.imageUrl || img.image || img.thumbnail || img.link).filter(Boolean)
  ));
  let videos = Array.from(new Set(
    videoItems.map((vid: any) => vid.link || vid.videoUrl || vid.url).filter(Boolean)
  ));

  // Fallback: try general search endpoint to harvest images/videos if empty
  if (images.length === 0 || videos.length === 0) {
    try {
      const alt = await callSerperApi('search', query, Math.max(maxImages, maxVideos), { gl: gl2, hl: hl2 });
      if (alt) {
        if (images.length === 0) {
          const altImgs: any[] = (alt.images || alt.image_results || alt.inlineImages || alt.inline_images || []);
          const altImageUrls = Array.from(new Set(
            (altImgs || []).map((img: any) => img.imageUrl || img.image || img.thumbnail || img.link).filter(Boolean)
          ));
          if (altImageUrls.length) images = altImageUrls.slice(0, maxImages);
        }
        if (videos.length === 0) {
          const altVids: any[] = (alt.videos || alt.video_results || alt.inlineVideos || alt.inline_videos || []);
          const altVideoUrls = Array.from(new Set(
            (altVids || []).map((vid: any) => vid.link || vid.videoUrl || vid.url).filter(Boolean)
          ));
          if (altVideoUrls.length) videos = altVideoUrls.slice(0, maxVideos);
        }
      }
    } catch {}
  }

  // Final fallback: Google CSE (if configured and explicitly enabled)
  const minImg = Math.min(3, maxImages);
  const minVid = Math.min(2, maxVideos);
  if (USE_CSE_VISUALS && images.length < minImg && CSE_KEY && CSE_CX) {
    try {
      const start = 1;
      const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=${Math.min(Math.max(maxImages,1),10)}&safe=active`;
      const resp = await fetch(url);
      const data = await resp.json();
      const items: any[] = data.items || [];
      const cseImages = items.map((it: any) => it.link || it.image?.thumbnailLink || it.pagemap?.cse_image?.[0]?.src).filter(Boolean);
      if (cseImages.length) {
        const merged = new Set<string>([...images, ...cseImages]);
        images = Array.from(merged).slice(0, maxImages);
      }
    } catch {}
  }
  if (USE_CSE_VISUALS && videos.length < minVid && CSE_KEY && CSE_CX) {
    try {
      const q = `${query} site:youtube.com/watch`;
      const url = `https://www.googleapis.com/customsearch/v1?key=${CSE_KEY}&cx=${CSE_CX}&q=${encodeURIComponent(q)}&num=${Math.min(Math.max(maxVideos,1),10)}&safe=active`;
      const resp = await fetch(url);
      const data = await resp.json();
      const items: any[] = data.items || [];
      const cseVideos = items.map((it: any) => it.link || it.formattedUrl || it.pagemap?.videoobject?.[0]?.url).filter(Boolean);
      if (cseVideos.length) {
        const merged = new Set<string>([...videos, ...cseVideos]);
        videos = Array.from(merged).slice(0, maxVideos);
      }
    } catch {}
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
