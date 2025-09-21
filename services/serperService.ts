const CLIENT_SERPER_API_KEY = import.meta.env.VITE_SERPER_API_KEY || import.meta.env.VITE_SERPAPI_KEY;
const SERPER_BASE_URL = 'https://google.serper.dev';
const SERPER_PROXY_URL = '/api/serper-proxy';

if (!CLIENT_SERPER_API_KEY) {
    console.warn('Serper client key not found; will rely on serverless proxy if configured.');
}

async function callSerperProxy<T>(type: 'search' | 'images' | 'videos' | 'news', payload: { q: string; num?: number; gl?: string; hl?: string }): Promise<T | null> {
    try {
        const resp = await fetch(SERPER_PROXY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...payload }),
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        return data as T;
    } catch (e) {
        return null;
    }
}

export interface SerperSearchResult {
    title: string;
    link: string;
    snippet: string;
    position: number;
}

export interface SerperImageResult {
    title: string;
    imageUrl: string;
    imageWidth: number;
    imageHeight: number;
    thumbnailUrl: string;
    thumbnailWidth: number;
    thumbnailHeight: number;
    source: string;
    domain: string;
    link: string;
    position: number;
}

export interface SerperVideoResult {
    title: string;
    link: string;
    snippet: string;
    imageUrl: string;
    duration: string;
    source: string;
    channel: string;
    date: string;
    position: number;
}

export interface SerperNewsItem {
    title: string;
    link: string;
    snippet?: string;
    source?: string;
    date?: string; // ISO or human readable
    imageUrl?: string;
    position?: number;
}

export interface SerperResponse {
    searchParameters: {
        q: string;
        type: string;
        engine: string;
    };
    organic?: SerperSearchResult[];
    images?: SerperImageResult[];
    videos?: SerperVideoResult[];
    answerBox?: {
        answer: string;
        title: string;
        link: string;
    };
    knowledgeGraph?: {
        title: string;
        type: string;
        description: string;
        descriptionSource: string;
        descriptionLink: string;
        imageUrl: string;
    };
}

/**
 * Simple URL safety filter to exclude NSFW or dangerous content.
 */
const BLOCKED_PATTERNS = [/porn/i, /xxx/i, /adult/i, /sex/i, /gambling/i, /malware/i, /phishing/i];
function isSafeUrl(url: string): boolean {
    try {
        const u = new URL(url);
        const host = u.hostname;
        return !BLOCKED_PATTERNS.some((p) => p.test(url) || p.test(host));
    } catch {
        return false;
    }
}

/**
 * Detects locale for Serper: hl (language) and gl (country).
 * Fallbacks: hl='en', gl='us'.
 */
export function detectLocaleForSearch(): { hl: string; gl: string } {
    let hl = 'en';
    let gl = 'us';
    try {
        if (typeof navigator !== 'undefined') {
            const navLang = navigator.language || (navigator as any).userLanguage || 'en-US';
            const [langPart, regionPart] = navLang.split('-');
            const lang = (langPart || 'en').toLowerCase();
            const region = (regionPart || 'US').toLowerCase();
            if (['az', 'tr', 'ru', 'en'].includes(lang)) {
                hl = lang;
            }
            // Prefer region when present; otherwise map by language
            if (region) {
                gl = region;
            }
            if (lang === 'az') gl = 'az';
            if (lang === 'tr') gl = 'tr';
            if (lang === 'ru') gl = 'ru';
        }
    } catch {}
    return { hl, gl };
}

/**
 * Search for web results using Serper API
 * @param query Search query
 * @param num Number of results to return (default: 10)
 * @param opts Optional locale options
 * @returns Promise<SerperResponse | null>
 */
export async function searchWeb(query: string, num: number = 10, opts?: { gl?: string; hl?: string }): Promise<SerperResponse | null> {
    if (!query || query.trim().length === 0) {
        return null;
    }

    try {
        const viaProxy = await callSerperProxy<SerperResponse>('search', { q: query.trim(), num, gl: opts?.gl, hl: opts?.hl });
        if (viaProxy) {
            // Apply safety filter to organic results
            if (viaProxy.organic) {
                viaProxy.organic = viaProxy.organic.filter((r) => isSafeUrl(r.link));
            }
            return viaProxy;
        }

        if (!CLIENT_SERPER_API_KEY) return null;
        const response = await fetch(`${SERPER_BASE_URL}/search`, {
            method: 'POST',
            headers: {
                'X-API-KEY': CLIENT_SERPER_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query.trim(),
                num: Math.min(num, 100), // Serper API limit
                ...(opts?.gl ? { gl: opts.gl } : {}),
                ...(opts?.hl ? { hl: opts.hl } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Serper API error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        // Safety filter
        if (data.organic) {
            data.organic = (data.organic as any[]).filter((r: any) => isSafeUrl(r.link));
        }
        return data as SerperResponse;
    } catch (error) {
        console.error('Error in searchWeb:', error);
        return null;
    }
}

/**
 * Search for images using Serper API
 * @param query Search query
 * @param num Number of images to return (default: 10)
 * @param opts Optional locale options
 * @returns Promise<SerperImageResult[] | null>
 */
export async function searchImages(query: string, num: number = 10, opts?: { gl?: string; hl?: string }): Promise<SerperImageResult[] | null> {
    if (!query || query.trim().length === 0) {
        return null;
    }

    try {
        const viaProxy = await callSerperProxy<any>('images', { q: query.trim(), num, gl: opts?.gl, hl: opts?.hl });
        if (viaProxy && viaProxy.images) {
            const arr = (viaProxy.images as SerperImageResult[]).filter((img) => isSafeUrl(img.imageUrl) && (!img.link || isSafeUrl(img.link)));
            return arr;
        }

        if (!CLIENT_SERPER_API_KEY) return null;
        const response = await fetch(`${SERPER_BASE_URL}/images`, {
            method: 'POST',
            headers: {
                'X-API-KEY': CLIENT_SERPER_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query.trim(),
                num: Math.min(num, 100),
                ...(opts?.gl ? { gl: opts.gl } : {}),
                ...(opts?.hl ? { hl: opts.hl } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Serper Images API error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const images = (data.images || []) as SerperImageResult[];
        return images.filter((img) => isSafeUrl(img.imageUrl) && (!img.link || isSafeUrl(img.link)));
    } catch (error) {
        console.error('Error in searchImages:', error);
        return null;
    }
}

/**
 * Search for videos using Serper API
 * @param query Search query
 * @param num Number of videos to return (default: 10)
 * @param opts Optional locale options
 * @returns Promise<SerperVideoResult[] | null>
 */
export async function searchVideos(query: string, num: number = 10, opts?: { gl?: string; hl?: string }): Promise<SerperVideoResult[] | null> {
    if (!query || query.trim().length === 0) {
        return null;
    }

    try {
        const viaProxy = await callSerperProxy<any>('videos', { q: query.trim(), num, gl: opts?.gl, hl: opts?.hl });
        if (viaProxy && viaProxy.videos) {
            const arr = (viaProxy.videos as SerperVideoResult[]).filter((vid) => isSafeUrl(vid.link));
            return arr;
        }

        if (!CLIENT_SERPER_API_KEY) return null;
        const response = await fetch(`${SERPER_BASE_URL}/videos`, {
            method: 'POST',
            headers: {
                'X-API-KEY': CLIENT_SERPER_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query.trim(),
                num: Math.min(num, 100),
                ...(opts?.gl ? { gl: opts.gl } : {}),
                ...(opts?.hl ? { hl: opts.hl } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Serper Videos API error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const videos = (data.videos || []) as SerperVideoResult[];
        return videos.filter((vid) => isSafeUrl(vid.link));
    } catch (error) {
        console.error('Error in searchVideos:', error);
        return null;
    }
}

/**
 * Combined search for images and videos
 * @param query Search query
 * @param maxImages Maximum number of images (default: 6)
 * @param maxVideos Maximum number of videos (default: 3)
 * @returns Promise<{images: string[], videos: string[]}>
 */
export async function searchImagesAndVideos(
    query: string,
    maxImages: number = 6,
    maxVideos: number = 3
): Promise<{ images: string[]; videos: string[] }> {
    const [imageResults, videoResults] = await Promise.all([
        searchImages(query, maxImages),
        searchVideos(query, maxVideos),
    ]);

    const images = imageResults?.slice(0, maxImages).map(img => img.imageUrl).filter(Boolean) || [];
    const videos = videoResults?.slice(0, maxVideos).map(vid => vid.link).filter(Boolean) || [];

    return { images, videos };
}

/**
 * Search for news using Serper API
 * @param query Search query
 * @param num Number of news results to return (default: 10)
 * @param opts Optional parameters to target country/language
 * @returns Promise<SerperNewsItem[] | null>
 */
export async function searchNews(query: string, num: number = 10, opts?: { gl?: string; hl?: string }): Promise<SerperNewsItem[] | null> {
    if (!query || query.trim().length === 0) {
        return null;
    }

    try {
        const viaProxy = await callSerperProxy<any>('news', { q: query.trim(), num, gl: opts?.gl, hl: opts?.hl });
        if (viaProxy && viaProxy.news) {
            const items = viaProxy.news as any[];
            const normalized: SerperNewsItem[] = items.map((n: any, idx: number) => ({
                title: n.title,
                link: n.link,
                snippet: n.snippet,
                source: n.source,
                date: n.date,
                imageUrl: n.imageUrl,
                position: n.position ?? idx + 1,
            }));
            return normalized.filter((n) => isSafeUrl(n.link));
        }

        if (!CLIENT_SERPER_API_KEY) return null;
        const response = await fetch(`${SERPER_BASE_URL}/news`, {
            method: 'POST',
            headers: {
                'X-API-KEY': CLIENT_SERPER_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: query.trim(),
                num: Math.min(num, 100),
                ...(opts?.gl ? { gl: opts.gl } : {}),
                ...(opts?.hl ? { hl: opts.hl } : {}),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Serper News API error:', response.status, errorText);
            return null;
        }

        const data = await response.json();
        const items = (data.news || []) as any[];
        const normalized: SerperNewsItem[] = items.map((n: any, idx: number) => ({
            title: n.title,
            link: n.link,
            snippet: n.snippet,
            source: n.source,
            date: n.date,
            imageUrl: n.imageUrl,
            position: n.position ?? idx + 1,
        }));
        return normalized.filter((n) => isSafeUrl(n.link));
    } catch (error) {
        console.error('Error in searchNews:', error);
        return null;
    }
}
