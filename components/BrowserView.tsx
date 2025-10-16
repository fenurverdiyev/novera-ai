import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { SearchIcon, LoadingSpinner, MicrophoneIcon, CameraIcon, CloseIcon, ArrowLeftIcon, MaximizeIcon, MinimizeIcon, MenuIcon } from './Icons';
import { ArrowRightIcon, RefreshIcon } from './BrowserIcons';
import { suggestAutocomplete, detectLocaleForSearch, searchImagesAndVideos, searchNews, searchShopping, searchWeb } from '../services/searchService';
import { answerWithGroundedSearch, streamChatQuery } from '../services/geminiService';
import { Logo } from './Logo';
import { HeroSearchBar } from './HeroSearchBar';
import type { NewsArticle, ShoppingProduct, Source } from '../types';

interface SearchItem {
  title: string;
  link: string;
  snippet: string;
  pagemap?: {
    cse_thumbnail?: Array<{ src: string }>;
    metatags?: Array<{ [key: string]: string }>;
  };
}

interface ImageResult {
  link: string;
  image: {
    thumbnailLink: string;
    contextLink: string;
  };
  title: string;
}

interface SearchResponse {
  items?: SearchItem[];
  queries?: {
    nextPage?: Array<{ startIndex: number }>;
    previousPage?: Array<{ startIndex: number }>;
  };
  error?: { message: string };
}

interface ImageSearchResponse {
  items?: ImageResult[];
  error?: { message: string };
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_JSON_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const CX = import.meta.env.VITE_GOOGLE_CSE_CX || import.meta.env.VITE_GOOGLE_CSE_ID;
const RESULTS_PER_PAGE = 15;
// Proxy all pages through a worker/domain to bypass frame restrictions.
// The user can supply either:
//  - VITE_CF_WORKER_PROXY (origin), optionally containing a {url} placeholder
//  - VITE_CF_WORKER_PROXY_TEMPLATE (full template string containing {url})
// Supported forms include:
//  - https://your-proxy.example/?url={url}
//  - https://your-proxy.example/proxy?url={url}
//  - https://your-proxy.example/{url}
//  - https://your-proxy.example/https://{url} (path-style)
const RAW_PROXY_ORIGIN = (import.meta.env.VITE_CF_WORKER_PROXY || '').toString().trim();
const PROXY_ORIGIN = (RAW_PROXY_ORIGIN || 'https://novera.zachkingrespect.workers.dev').replace(/\/$/, '');
const PROXY_TEMPLATE = (import.meta.env.VITE_CF_WORKER_PROXY_TEMPLATE || '').toString().trim();

// Prefer Azerbaijani content when possible via proxy param (if supported by proxy)
const ACCEPT_LANGUAGE = 'az-AZ,az;q=1,tr;q=0.8,en;q=0.7';

const denyDomains = [
  'porn', 'xxx', 'sex', 'nsfw', 'adult', 'redtube', 'xvideos', 'xnxx', 'youporn', 'pornhub',
];
const isSafeUrl = (u: string): boolean => {
  try {
    if (!u) return false;
    const lower = u.toLowerCase().trim();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('blob:')) return false;
    const url = new URL(lower);
    const host = url.hostname.toLowerCase();
    if (!/^https?:$/.test(url.protocol)) return false;
    if (denyDomains.some(d => host.includes(d))) return false;
    return true;
  } catch { return false; }
};

const getHost = (u: string): string => { try { return new URL(u).hostname; } catch { return u; } };

// Many sites block iframes via X-Frame-Options / frame-ancestors.
// Default to Reader mode for external domains. Allow embed only for local/ngrok dev or trusted hosts.
const embedAllowlist = [
  'localhost', '127.0.0.1',
  // Private LAN ranges (startsWith checks will be applied)
  '192.168.', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.',
  // Ngrok
  'ngrok-free.dev',
  // Some commonly embeddable hosts
  'vercel.app', 'netlify.app', 'github.io', 'wikipedia.org'
];
const canEmbed = (u: string): boolean => {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    // Localhost or private IPs
    if (embedAllowlist.some(p => host === p || host.endsWith('.' + p) || host.startsWith(p))) return true;
    return false;
  } catch { return false; }
};
const toReader = (u: string): string => {
  try {
    const url = new URL(u);
    const scheme = url.protocol === 'https:' ? 'https' : 'http';
    return `https://r.jina.ai/${scheme}://${url.hostname}${url.pathname}${url.search}`;
  } catch { return u; }
};

// Heuristic: is value likely a URL (supports bare domains and www.)
const isProbablyUrl = (val: string): boolean => {
  const s = (val || '').trim();
  if (!s) return false;
  try { new URL(s); return true; } catch {}
  // bare domain or www.
  if (/^www\.[^\s/]+\.[^\s]{2,}/i.test(s)) return true;
  if (/^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return true;
  return false;
};

const normalizeUrl = (val: string): string => {
  let s = (val || '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).href; } catch { return s; }
};

// Wrap target URL with proxy origin. Prefer embedding variants first (e.g., YouTube), then proxy.
const toProxyUrl = (u: string): string => {
  const target = (() => { try { return toEmbedUrl(u); } catch { return u; } })();
  const origin = PROXY_ORIGIN;
  const tpl = PROXY_TEMPLATE || '';
  const al = encodeURIComponent(ACCEPT_LANGUAGE);

  // If explicit template provided and contains {url}, honor it (supports {origin} too)
  if (tpl && tpl.includes('{url}')) {
    let out = tpl
      .replace('{origin}', origin)
      .replace('{url}', encodeURIComponent(target));
    if (out.includes('{al}')) out = out.replace('{al}', al);
    // If template doesn't expose {al}, try to append as query param
    if (!/[?&]al=/.test(out)) out += (out.includes('?') ? '&' : '?') + `al=${al}`;
    return out;
  }

  // If origin itself already has a {url} placeholder, use it directly
  if (origin.includes('{url}')) {
    let out = origin.replace('{url}', encodeURIComponent(target));
    if (out.includes('{al}')) out = out.replace('{al}', al);
    if (!/[?&]al=/.test(out)) out += (out.includes('?') ? '&' : '?') + `al=${al}`;
    return out;
  }

  // If origin already contains a query part, append url param smartly
  if (origin.includes('?')) {
    const sep = /[?&]$/.test(origin) ? '' : (origin.includes('?') ? '&' : '?');
    return `${origin}${sep}url=${encodeURIComponent(target)}&al=${al}`;
  }

  // Try common path-style forms. If origin appears to end with a path directive (e.g., /proxy or /go), add ?url=
  if (/\/(proxy|fetch|go|wrap|open|p|u)$/i.test(origin)) {
    return `${origin}?url=${encodeURIComponent(target)}&al=${al}`;
  }

  // Fallback: default query style
  return `${origin}/?url=${encodeURIComponent(target)}&al=${al}`;
};

// Convert well-known hosts to embeddable URLs (e.g., YouTube/Vimeo)
const toEmbedUrl = (u: string): string => {
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    // YouTube
    if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('m.youtube.com') || host.includes('music.youtube.com')) {
      let id: string | null = null;
      if (host === 'youtu.be') {
        id = url.pathname.replace(/^\//, '') || null;
      } else if (url.searchParams.get('v')) {
        id = url.searchParams.get('v');
      } else if (url.pathname.startsWith('/shorts/')) {
        id = url.pathname.split('/')[2] || null;
      } else if (url.pathname.startsWith('/live/')) {
        id = url.pathname.split('/')[2] || null;
      } else if (url.pathname.startsWith('/embed/')) {
        id = url.pathname.split('/')[2] || null;
      }
      // Playlist
      const list = url.searchParams.get('list');
      if (!id && list && url.pathname.startsWith('/playlist')) {
        const lang = (navigator.language || 'az-AZ').split('-')[0] || 'az';
        const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
        return `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(list)}&hl=${encodeURIComponent(lang)}&rel=0&modestbranding=1&playsinline=1${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
      }
      if (id) {
        const t = url.searchParams.get('t') || url.searchParams.get('time_continue') || '';
        const tParam = t ? `&start=${parseInt(t, 10) || 0}` : '';
        const lang = (navigator.language || 'az-AZ').split('-')[0] || 'az';
        const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
        return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&hl=${encodeURIComponent(lang)}${tParam}${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
      }
    }
    // Vimeo
    if (host.includes('vimeo.com')) {
      const m = url.pathname.match(/\/(\d+)/);
      if (m && m[1]) return `https://player.vimeo.com/video/${m[1]}`;
    }
    return u;
  } catch { return u; }
};

interface BrowserViewProps {
  onVisualQuery?: (query: string, images: string[]) => void;
  openOverlayUrl?: string;
  onOpenedOverlay?: () => void;
  onOverlayClosed?: () => void;
  safeSearchMode?: 'off' | 'blur' | 'filter';
  openIncognito?: boolean;
  onOpenedIncognito?: () => void;
  incomingSearch?: { query: string; fromIncognito?: boolean };
  onConsumedIncomingSearch?: () => void;
}

export const BrowserView: React.FC<BrowserViewProps> = ({ onVisualQuery, openOverlayUrl, onOpenedOverlay, onOverlayClosed, safeSearchMode = 'off', openIncognito, onOpenedIncognito, incomingSearch, onConsumedIncomingSearch }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [imageResults, setImageResults] = useState<ImageResult[]>([]);
  const [showImages, setShowImages] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any | null>(null);
  const sttBaseTextRef = useRef<string>('');
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  // Camera/image picking is handled by HeroSearchBar using native pickers
  const [activeTab, setActiveTab] = useState<'web' | 'images' | 'videos' | 'news' | 'shopping'>('web');
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>([]);
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlaySearch, setOverlaySearch] = useState<string>('');
  const [overlayHistory, setOverlayHistory] = useState<string[]>([]);
  const [overlayIndex, setOverlayIndex] = useState<number>(-1);
  const [overlayKey, setOverlayKey] = useState<number>(0);
  const [overlayEmbedMode, setOverlayEmbedMode] = useState<'embed' | 'reader'>('embed');
  const [overlayChromeHidden, setOverlayChromeHidden] = useState(false);
  const [overlayOpenMode, setOverlayOpenMode] = useState<'original' | 'proxy'>('proxy');
  const overlayLoadedRef = useRef<boolean>(false);
  const overlayFallbackTimerRef = useRef<number | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [overlayIncognito, setOverlayIncognito] = useState(false);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  // AI analysis state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string>('');
  const [aiSources, setAiSources] = useState<Source[]>([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiRendered, setAiRendered] = useState('');
  const [aiUsedImages, setAiUsedImages] = useState<string[]>([]);
  const [aiImageModalUrl, setAiImageModalUrl] = useState<string | null>(null);
  const [aiShareHint, setAiShareHint] = useState<string | null>(null);
  const aiAnimRef = useRef<number | null>(null);
  const aiQueueRef = useRef<string>('');
  // Hold images selected by user (camera/gallery) until they press Search
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [fromIncogResults, setFromIncogResults] = useState<boolean>(false);
  // AI analysis attachments: inputs
  const aiFileInputRef = useRef<HTMLInputElement>(null);
  const aiGalleryInputRef = useRef<HTMLInputElement>(null);
  // Handle AI panel file uploads (camera/gallery/file)
  const handleAiFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Image = e.target?.result as string;
      setPendingImages((prev) => [...prev, base64Image]);
    };
    reader.readAsDataURL(file);
    try { (event.target as HTMLInputElement).value = ''; } catch {}
  };
  // Derive a short text query from selected images (no UI streaming)
  const extractQueryFromImages = useCallback(async (fallbackText = 'Bu şəkil haqqında məlumat') => {
    try {
      const imgs = pendingImages;
      if (!imgs || imgs.length === 0) return (fallbackText || '').trim();
      let out = '';
      const prompt = 'Bu şəkildən 3-6 çox qısa açar söz çıxart, vergüllə ayır, əlavə şərh yazma.';
      for await (const chunk of streamChatQuery(prompt, [], imgs)) {
        if (chunk.text) out += chunk.text;
      }
      // Normalize to a compact query
      const q = (out || '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').replace(/^[,:\s]+|[,:\s]+$/g, '').slice(0, 120).trim();
      return q || (fallbackText || '').trim();
    } catch {
      return (fallbackText || '').trim();
    }
  }, [pendingImages]);
  // Results page history (for header < > when overlay is closed)
  const [resultsHistory, setResultsHistory] = useState<number[]>([]);
  const [resultsIndex, setResultsIndex] = useState<number>(-1);
  const [forwardFromLobby, setForwardFromLobby] = useState<{ query: string; page: number } | null>(null);
  const restoringRef = useRef(false);
  const currentQueryRef = useRef<string>('');
  const openOverlay = (url: string) => {
    setOverlaySearch('');
    setOverlayHistory(prev => {
      const base = overlayIndex >= 0 ? prev.slice(0, overlayIndex + 1) : [];
      const next = [...base, url];
      setOverlayIndex(next.length - 1);
      return next;
    });
    overlayLoadedRef.current = false;
    setOverlayNotice(null);
    if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; }
    // Try original first; if it doesn't load (likely X-Frame-Options), fallback by opening in new tab
    // Speed up fallback for known frame-busting hosts without embeddable id
    const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
    const embedCandidate = toEmbedUrl(url);
    const quickFallback = (host.includes('youtube.com') || host === 'youtu.be') && embedCandidate === url;
    setOverlayUrl(url);
    setOverlayKey(k => k + 1);
    setOverlayChromeHidden(false);
  };
  const closeOverlay = () => {
    setOverlayUrl(null);
    setOverlayHistory([]);
    setOverlayIndex(-1);
    setOverlayIncognito(false);
    if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; }
    try { onOverlayClosed?.(); } catch {}
  };
  const navigateOverlay = (url: string) => {
    if (!url) return;
    if (!overlayIncognito) {
      setOverlayHistory(prev => {
        const base = overlayIndex >= 0 ? prev.slice(0, overlayIndex + 1) : [];
        const next = [...base, url];
        setOverlayIndex(next.length - 1);
        return next;
      });
    }
    setOverlayUrl(url);
    setOverlayKey(x => x + 1);
    overlayLoadedRef.current = false;
    setOverlayNotice(null);
  };
  const goBack = () => {
    if (overlayIndex > 0) {
      const idx = overlayIndex - 1;
      setOverlayIndex(idx);
      const u = overlayHistory[idx];
      setOverlayUrl(u);
      setOverlayKey(k => k + 1);
    }
  };
  const goForward = () => {
    if (overlayIndex >= 0 && overlayIndex < overlayHistory.length - 1) {
      const idx = overlayIndex + 1;
      setOverlayIndex(idx);
      const u = overlayHistory[idx];
      setOverlayUrl(u);
      setOverlayKey(k => k + 1);
    }
  };
  const reloadOverlay = () => { overlayLoadedRef.current = false; setOverlayKey(k => k + 1); };

  // If parent asks to open a URL, open overlay immediately
  useEffect(() => {
    if (openOverlayUrl) {
      try { openOverlay(openOverlayUrl); } catch {}
      try { onOpenedOverlay?.(); } catch {}
    }
  }, [openOverlayUrl]);
  // Open Incognito overlay when requested by parent
  useEffect(() => {
    if (openIncognito) {
      setOverlayIncognito(true);
      setOverlayUrl(null);
      setOverlayHistory([]);
      setOverlayIndex(-1);
      setOverlaySearch('');
      setOverlayChromeHidden(false);
      try { onOpenedIncognito?.(); } catch {}
    }
  }, [openIncognito]);
  // ESC toggle fullscreen (overlay chrome hidden)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!overlayUrl) return;
      if (e.key === 'Escape') { e.preventDefault(); setOverlayChromeHidden(v => !v); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [overlayUrl]);

  // Real fullscreen toggle
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (overlayContainerRef.current && (overlayContainerRef.current as any).requestFullscreen) {
          await (overlayContainerRef.current as any).requestFullscreen();
        } else {
          await document.documentElement.requestFullscreen();
        }
        setOverlayChromeHidden(true);
      } else {
        await document.exitFullscreen();
        setOverlayChromeHidden(false);
      }
    } catch {
      setOverlayChromeHidden(v => !v);
    }
  };
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreenActive(!!document.fullscreenElement);
      if (!document.fullscreenElement) {
        setOverlayChromeHidden(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Load account info for overlay hamburger
  useEffect(() => {
    try {
      setAuthEmail(localStorage.getItem('nov-era-auth'));
      setAvatar(localStorage.getItem('nov-era-avatar'));
    } catch {}
  }, []);

  const dispatchNav = (view: string) => {
    try { window.dispatchEvent(new CustomEvent('nov-era-nav' as any, { detail: view })); } catch {}
  };
  const dispatchClearAll = () => {
    try { window.dispatchEvent(new Event('nov-era-clear-all' as any)); } catch {}
  };
  const dispatchClearRecent = (minutes: number) => {
    try { window.dispatchEvent(new CustomEvent('nov-era-clear-recent' as any, { detail: minutes })); } catch {}
  };
  // Clear ALL search history (for Browser search bar history)
  const clearSearchHistoryAll = () => {
    try {
      localStorage.removeItem('novEra.search.history');
      localStorage.removeItem('novEra.search.lastQuery');
      localStorage.removeItem('novEra.search.lastPage');
      window.dispatchEvent(new Event('nov-era-search-history-cleared' as any));
    } catch {}
  };
  // Overlay theme for incognito/browser overlay background
  const [overlayTheme, setOverlayTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try { return (localStorage.getItem('nov-era-overlay-theme') as any) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => { try { localStorage.setItem('nov-era-overlay-theme', overlayTheme); } catch {} }, [overlayTheme]);
  const isLightOverlay = useMemo(() => {
    try {
      const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const mode = overlayTheme === 'system' ? (sysDark ? 'dark' : 'light') : overlayTheme;
      return mode === 'light';
    } catch { return overlayTheme === 'light'; }
  }, [overlayTheme]);

  // React to external theme changes (Sidebar menu)
  useEffect(() => {
    const onTheme = (e: any) => {
      const v = (e?.detail || '').toString();
      if (v === 'light' || v === 'dark' || v === 'system') setOverlayTheme(v);
    };
    window.addEventListener('nov-era-overlay-theme-changed' as any, onTheme as any);
    return () => window.removeEventListener('nov-era-overlay-theme-changed' as any, onTheme as any);
  }, []);

  const doSearch = useCallback(async (pageIndex = 1, qOverride?: string) => {
    const qStr = (qOverride ?? query).trim();
    if (!qStr) {
      setError('Zəhmət olmasa, axtarış üçün sorğu daxil edin.');
      return;
    }
    // Note: If CSE creds yoxdursa, Serper fallback istifadə olunacaq
    setLoading(true);
    setError(null);
    // Always default to Web tab on new search
    setActiveTab('web');
    // Reset AI analysis on new search
    setAiText('');
    setAiSources([]);
    setAiExpanded(false);
    setAiInput(qStr);
    setAiRendered('');
    try {
      const useCSE = !!(GOOGLE_API_KEY && CX);
      const loc = detectLocaleForSearch();
      // CSE build for up to 15 items (max 10 per request)
      const cseStart1 = (pageIndex - 1) * RESULTS_PER_PAGE + 1;
      const cseFirstNum = Math.min(10, RESULTS_PER_PAGE);
      const cseRemain = Math.max(0, RESULTS_PER_PAGE - cseFirstNum);
      const cseStart2 = cseStart1 + cseFirstNum;
      const cseSecondNum = Math.min(10, cseRemain);
      const safeParam = safeSearchMode === 'off' ? 'off' : 'active';
      const webUrl1 = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&start=${cseStart1}&num=${cseFirstNum}&safe=${safeParam}` : '';
      const webUrl2 = useCSE && cseSecondNum > 0 ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&start=${cseStart2}&num=${cseSecondNum}&safe=${safeParam}` : '';
      const imageUrl = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&searchType=image&num=8&safe=${safeParam}` : '';

      const [cse1Resp, cse2Resp, imgResp, visuals, nData, sData, serperData] = await Promise.all([
        useCSE ? fetch(webUrl1) : Promise.resolve(null as any),
        useCSE && webUrl2 ? fetch(webUrl2).catch(() => null) : Promise.resolve(null),
        useCSE ? fetch(imageUrl).catch(() => null) : Promise.resolve(null),
        searchImagesAndVideos(qStr, 100, 30).catch(() => ({ images: [], videos: [] })),
        searchNews(qStr, 50).catch(() => [] as NewsArticle[]),
        searchShopping(qStr, 24).catch(() => [] as ShoppingProduct[]),
        searchWeb(qStr, RESULTS_PER_PAGE, { ...loc, page: pageIndex }).catch(() => null),
      ]);

      // Prefer Serper results for richer coverage
      let merged: SearchItem[] = [];
      let nextAvailable = false;
      if (serperData && serperData.organic) {
        const mapped = serperData.organic
          .filter((r: any) => isSafeUrl(r.link))
          .map((r: any) => ({ title: r.title, link: r.link, snippet: r.snippet })) as SearchItem[];
        merged = mapped.slice(0, RESULTS_PER_PAGE);
        const serperCap = Math.min(RESULTS_PER_PAGE, 10);
        nextAvailable = mapped.length >= serperCap;
      }

      // Supplement with CSE if needed
      const seen = new Set(merged.map(m => m.link));
      const addCseItems = async (resp: any) => {
        if (!resp || !resp.ok) return { hasNext: false };
        const data: SearchResponse = await resp.json();
        const items = (data.items || []).filter(it => isSafeUrl(it.link));
        for (const it of items) {
          if (merged.length >= RESULTS_PER_PAGE) break;
          if (!seen.has(it.link)) { merged.push(it); seen.add(it.link); }
        }
        return { hasNext: !!(data.queries && data.queries.nextPage && data.queries.nextPage.length) };
      };
      if (useCSE && merged.length < RESULTS_PER_PAGE) {
        const a = await addCseItems(cse1Resp);
        const b = await addCseItems(cse2Resp);
        nextAvailable = nextAvailable || a.hasNext || b.hasNext;
      }

      setResults(merged);
      setPage(pageIndex);
      if (qOverride !== undefined) setQuery(qStr);
      setHasNextPage(!!nextAvailable);
      try {
        localStorage.setItem('novEra.search.lastQuery', qStr);
        localStorage.setItem('novEra.search.lastPage', String(pageIndex));
      } catch {}
      // Update results history
      if (!restoringRef.current) {
        if (currentQueryRef.current !== qStr) {
          currentQueryRef.current = qStr;
          setResultsHistory([pageIndex]);
          setResultsIndex(0);
          setForwardFromLobby(null);
        } else {
          setResultsHistory((prev) => {
            const next = prev.length ? [...prev.slice(0, resultsIndex + 1), pageIndex] : [pageIndex];
            setResultsIndex(next.length - 1);
            return next;
          });
        }
      }
      setError(null);
      
      // Image results
      if (imgResp && imgResp.ok) {
        const imgData: ImageSearchResponse = await imgResp.json();
        if (imgData.items) {
          setImageResults(imgData.items);
        }
      }

      // Videos / News / Shopping
      if (visuals) {
        setVideoUrls(visuals.videos || []);
        // Merge images if CSE returned none
        if ((imageResults || []).length === 0 && (visuals.images || []).length) {
          setImageResults(visuals.images.map((link) => ({ link, image: { thumbnailLink: link, contextLink: link }, title: '' })) as any);
        }
      }
      if (nData) setNewsItems(nData);
      if (sData) setProducts(sData);
    } catch (e) {
      console.error(e);
      setError('Şəbəkə xətası. İnternet Bağlantısını yoxlayın.');
      setHasNextPage(false);
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Run AI analysis (shared)
  // Helper: compress data URL image on client (max 1280px, q=0.82 by default)
  const compressDataUrl = async (dataUrl: string, maxSize = 1280, quality = 0.82): Promise<string> => {
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('img load error'));
        img.src = dataUrl;
      });
      const canvas = document.createElement('canvas');
      let { width, height } = img as HTMLImageElement;
      if (width > height) {
        if (width > maxSize) { height = Math.round((height * maxSize) / width); width = maxSize; }
      } else {
        if (height > maxSize) { width = Math.round((width * maxSize) / height); height = maxSize; }
      }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return dataUrl;
      ctx.drawImage(img as HTMLImageElement, 0, 0, width, height);
      const out = canvas.toDataURL('image/jpeg', quality);
      return out || dataUrl;
    } catch {
      return dataUrl;
    }
  };
  const compressAll = async (list: string[], size = 1280, q = 0.82) => Promise.all(list.map(d => compressDataUrl(d, size, q)));

  const runAi = async (text: string, images?: string[]) => {
    const t = (text || '').trim();
    if ((!t && (!images || images.length === 0)) || aiLoading) return;
    setAiLoading(true);
    try {
      // Reset render state
      setAiText('');
      setAiSources([]);
      setAiRendered('');
      aiQueueRef.current = '';
      setAiExpanded(true);
      // Start writer if not running
      const startWriter = () => {
        if (aiAnimRef.current) return;
        const tick = () => {
          const q = aiQueueRef.current;
          if (!q.length) { aiAnimRef.current = null; return; }
          const nextChar = q.slice(0, 1);
          aiQueueRef.current = q.slice(1);
          setAiRendered(prev => prev + nextChar);
          const delay = nextChar === '.' ? 55 : nextChar === ',' ? 42 : (nextChar === ' ' ? 10 : 18);
          aiAnimRef.current = window.setTimeout(tick, delay);
        };
        aiAnimRef.current = window.setTimeout(tick, 18);
      };
      startWriter();

      // Stream AI (analysis-only; no image generation)
      const analysisPref = [
        'VACİB: Yalnız ŞƏKİL ANALİZİ et. Yeni şəkil yaratma/yüzdə dəyişiklik etmə (no image generation).',
        'Veb axtarış etmə, yalnız verilən şəkil(lər) və mətnə əsaslan.',
        'Cavabı Azərbaycan dilində ver. Mətn və ya ehtiyac varsa JSON formatında nəticə qaytara bilərsən.',
      ].join(' ');
      // Compress images before sending to reduce 413/network errors
      const preparedImages = images && images.length ? await compressAll(images, 1280, 0.82) : [];
      setAiUsedImages(preparedImages || []);
      const srcSet = new Map<string, Source>();
      for await (const chunk of streamChatQuery(`${analysisPref}\n\n${t || 'Bu şəkli analiz et.'}`, [], preparedImages || [], undefined, undefined, true)) {
        if (chunk.text) {
          aiQueueRef.current += chunk.text;
          startWriter();
        }
        if (chunk.sources) {
          for (const s of chunk.sources) { if (s.uri && !srcSet.has(s.uri)) srcSet.set(s.uri, s); }
          setAiSources(Array.from(srcSet.values()).slice(0, 8));
        }
      }
      // After stream completes, commit final text
      setAiText(prev => prev || (aiRendered + aiQueueRef.current));
    } catch (e) {
      // Retry once with stronger compression
      try {
        const t2 = (text || '').trim();
        const preparedImages2 = images && images.length ? await Promise.all(images.map((d) => compressDataUrl(d, 1024, 0.7))) : [];
        setAiUsedImages(preparedImages2 || []);
        const srcSet2 = new Map<string, Source>();
        for await (const chunk of streamChatQuery(`Yenidən cəhd: ${t2 || 'Bu şəkli analiz et.'}`, [], preparedImages2 || [], undefined, undefined, true)) {
          if (chunk.text) { aiQueueRef.current += chunk.text; }
          if (chunk.sources) {
            for (const s of chunk.sources) { if (s.uri && !srcSet2.has(s.uri)) srcSet2.set(s.uri, s); }
            setAiSources(Array.from(srcSet2.values()).slice(0, 8));
          }
        }
        setAiText(prev => prev || (aiRendered + aiQueueRef.current));
      } catch {
        setAiText('AI analizi alınmadı. Şəbəkə və ya API açarı və ya şəkil ölçüsü problemi ola bilər. Xahiş olunur ki, bir az sonra yenidən cəhd edəsiniz.');
      }
    } finally {
      setAiLoading(false);
    }
  };
  // Analyze current query directly
  const handleAiAnalyze = async () => { await runAi(query, pendingImages.length ? pendingImages : undefined); };
  // Analyze custom input
  const handleAiSend = async () => { await runAi(aiInput, pendingImages.length ? pendingImages : undefined); };

  // Do NOT restore last search on mount; show lobby first by default

  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const { hl, gl } = detectLocaleForSearch();
    debounceRef.current = window.setTimeout(async () => {
      const res = await suggestAutocomplete(q, { hl, gl });
      const items = res.slice(0, 8);
      setSuggestions(items);
      setActiveIndex(items.length ? 0 : -1);
    }, 220);
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }
    if (e.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        e.preventDefault();
        const sug = suggestions[activeIndex];
        setQuery(sug);
        setSuggestions([]);
        setActiveIndex(-1);
        doSearch(1);
      }
    }
    if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  // STT: Web Speech API
  const startListening = () => {
    const SpeechRec: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Səsdən mətnə çevirmə bu brauzerdə dəstəklənmir.');
      return;
    }
    try {
      const rec: any = new SpeechRec();
      rec.lang = (navigator.language || 'az-AZ');
      rec.continuous = true;
      rec.interimResults = true;
      sttBaseTextRef.current = query.trim();
      rec.onresult = (ev: any) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) {
            sttBaseTextRef.current = (sttBaseTextRef.current + ' ' + txt).trim();
            setQuery(sttBaseTextRef.current);
          } else {
            interim += txt + ' ';
          }
        }
        if (interim) setQuery((sttBaseTextRef.current + ' ' + interim).trim());
      };
      rec.onerror = () => { setIsListening(false); };
      rec.onend = () => { setIsListening(false); recognitionRef.current = null; };
      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };
  const stopListening = () => { try { recognitionRef.current?.stop(); } catch {} setIsListening(false); };
  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

  // Upload handlers
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Image = e.target?.result as string;
      const analysisQuery = (query.trim() || 'Bu şəkli analiz et.');
      if (onVisualQuery) {
        onVisualQuery(analysisQuery, [base64Image]);
      } else {
        setError('Şəkil AI-a göndərilə bilmədi. Zəhmət olmasa əsas axtarış bölümünə qayıdın.');
      }
      setShowUploadMenu(false);
      // keep query blank after upload
      setQuery('');
    };
    reader.readAsDataURL(file);
  };

  // No custom camera overlay in BrowserView; HeroSearchBar triggers native camera/gallery

  const clearAll = () => {
    setResults([]);
    setImageResults([]);
    setVideoUrls([]);
    setNewsItems([]);
    setProducts([]);
    setPreviewUrl('');
    setOverlayUrl(null);
    setQuery('');
    setPage(1);
    setError(null);
    setFromIncogResults(false);
  };

  // Helper: go back to Incognito home view
  const openIncognitoHome = () => {
    try { window.dispatchEvent(new Event('nov-era-open-incognito' as any)); } catch {}
  };

  // Global back/forward: if overlay is open use overlay history, else paginate results
  const handleGlobalBack = () => {
    if (overlayUrl) {
      if (overlayIndex <= 0) return;
      goBack();
      return;
    }
    // If results came from Incognito, always return to Incognito home
    if (fromIncogResults) {
      openIncognitoHome();
      return;
    }
    // Results view
    if (resultsHistory.length === 0) {
      // No history, return to lobby if there are results
      if (results.length) { setForwardFromLobby({ query: currentQueryRef.current || query, page }); clearAll(); }
      return;
    }
    if (resultsIndex > 0) {
      const prevPage = resultsHistory[resultsIndex - 1];
      restoringRef.current = true;
      setResultsIndex(resultsIndex - 1);
      doSearch(prevPage, currentQueryRef.current || query).finally(() => { restoringRef.current = false; });
    } else {
      // At first page in history -> go lobby, enable forward to return
      setForwardFromLobby({ query: currentQueryRef.current || query, page: resultsHistory[resultsIndex] || 1 });
      clearAll();
    }
  };
  const handleGlobalForward = () => {
    if (overlayUrl) {
      if (overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) return;
      goForward();
      return;
    }
    // If came back to lobby, allow going forward to the stored results
    if (!results.length && forwardFromLobby) {
      const { query: q, page: p } = forwardFromLobby;
      setForwardFromLobby(null);
      restoringRef.current = true;
      doSearch(p, q).finally(() => { restoringRef.current = false; });
      return;
    }
    if (resultsIndex >= 0 && resultsIndex < resultsHistory.length - 1) {
      const nextPage = resultsHistory[resultsIndex + 1];
      restoringRef.current = true;
      setResultsIndex(resultsIndex + 1);
      doSearch(nextPage, currentQueryRef.current || query).finally(() => { restoringRef.current = false; });
    }
  };

  // Bottom pagination handlers that work with resultsHistory
  const goPrevPageBtn = () => {
    if (page <= 1) return;
    if (resultsIndex > 0) {
      const prevPage = resultsHistory[resultsIndex - 1];
      restoringRef.current = true;
      setResultsIndex(resultsIndex - 1);
      doSearch(prevPage, currentQueryRef.current || query).finally(() => { restoringRef.current = false; });
      return;
    }
    // Fallback if history missing: compute page-1
    const newPage = Math.max(1, page - 1);
    restoringRef.current = true;
    doSearch(newPage, currentQueryRef.current || query).finally(() => { restoringRef.current = false; });
  };

  // Remove a single pending image by index
  const removePendingAt = (idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  };

  const goNextPageBtn = () => {
    if (!hasNextPage) return;
    if (resultsIndex >= 0 && resultsIndex < resultsHistory.length - 1) {
      const nextPage = resultsHistory[resultsIndex + 1];
      restoringRef.current = true;
      setResultsIndex(resultsIndex + 1);
      doSearch(nextPage, currentQueryRef.current || query).finally(() => { restoringRef.current = false; });
      return;
    }
    // Advance to new page; let doSearch append to history
    const newPage = page + 1;
    setPage(newPage);
    doSearch(newPage);
  };

  const hasAnyResults = results.length > 0 || imageResults.length > 0 || videoUrls.length > 0 || newsItems.length > 0 || products.length > 0;

  // Consume incoming search (e.g., from Incognito view) and run it here
  useEffect(() => {
    if (incomingSearch && incomingSearch.query) {
      const q = (incomingSearch.query || '').trim();
      if (q) {
        setQuery(q);
        setFromIncogResults(!!incomingSearch.fromIncognito);
        doSearch(1, q);
      }
      onConsumedIncomingSearch && onConsumedIncomingSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingSearch?.query]);

  return (
    <div className="relative p-4 md:p-6 h-full text-text-main bg-bg-main/80 backdrop-blur-sm">
      {/* Global top-left hamburger for Browser view */}
      <div className="absolute left-2 top-2 z-30">
        <div className="relative">
          <button onClick={() => setPageMenuOpen(v => !v)} className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 border border-white/15" aria-label="Menyu" title="Menyu">
            <MenuIcon className="w-4 h-4" />
          </button>
          {pageMenuOpen && (
            <div className="absolute left-0 top-full mt-2 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 py-2 min-w-[220px] z-[60] overflow-hidden">
              <div className="absolute left-3 -top-1 w-3 h-3 rotate-45 bg-white/10 border-l border-t border-white/20"></div>
              <button onClick={() => { dispatchNav('profile'); setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                <span>👤</span>
                <span>Profil</span>
              </button>
              <button onClick={() => { try { window.dispatchEvent(new Event('nov-era-open-incognito' as any)); } catch {} setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                <span>🕶️</span>
                <span>Anonim Tab</span>
              </button>
              <button onClick={() => { dispatchNav('safe-search'); setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                <span>🛡️</span>
                <span>SafeSearch</span>
              </button>
              <button onClick={() => { dispatchNav('settings'); setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                <span>⚙️</span>
                <span>Ayarlar</span>
              </button>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-4 py-2 text-xs text-white/70 flex items-center justify-between">
                <span>Axtarış tarixçəsi</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/70">Saxlanılır</span>
              </div>
              <button onClick={() => { clearSearchHistoryAll(); setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                <span>🗑️</span>
                <span>Axtarışın hamısını sil</span>
              </button>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-white/20 flex items-center justify-center text-white/80">
                  {avatar ? <img src={avatar} alt="avatar" className="w-full h-full object-cover" /> : <span>🙂</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-white/80 truncate">{authEmail || 'Hesab yoxdur'}</div>
                  <button onClick={() => { dispatchNav('profile'); setPageMenuOpen(false); }} className="text-[11px] text-white/70 hover:text-white">Hesabı idarə et</button>
                </div>
              </div>
              <div className="my-1 h-px bg-white/10" />
              <div className="px-4 py-2 text-xs text-white/70">Görünüş</div>
              <div className="px-3 pb-2 flex items-center gap-2">
                {([ {id:'light',label:'Ağ rejim'}, {id:'dark',label:'Tünd rejim'}, {id:'system',label:'Sistem'} ] as const).map(opt => (
                  <button key={opt.id}
                    onClick={() => { setOverlayTheme(opt.id as any); }}
                    className={`px-3 py-1.5 rounded-full text-xs border ${overlayTheme === opt.id ? 'bg-white/20 text-white border-white/40' : 'bg-white/5 text-white/80 hover:bg-white/10 border-white/20'}`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Hero center before first search */}
      {!hasAnyResults && !loading ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-4">
          <Logo isLarge={true} />
          <div className="w-full max-w-3xl mx-auto mt-6">
            <HeroSearchBar
              onSend={async (q) => {
                const imgs = pendingImages;
                if (imgs && imgs.length) {
                  const term = (q && q.trim()) ? q.trim() : await extractQueryFromImages();
                  setPendingImages([]);
                  setPreviewUrl('');
                  doSearch(1, term || '');
                } else {
                  const qq = (q || '').trim();
                  setPreviewUrl('');
                  if (isProbablyUrl(qq)) {
                    const url = normalizeUrl(qq);
                    openOverlay(url);
                  } else {
                    doSearch(1, qq);
                  }
                }
              }}
              isLoading={loading}
              onVoiceClick={() => {}}
              placeholder="Vebdə axtarın..."
              enableEmptySubmit={pendingImages.length > 0}
              onImageSelected={(imgs) => setPendingImages(prev => [...prev, ...imgs])}
            />
            {pendingImages.length > 0 && (
              <div className="mt-3 flex items-center gap-2 justify-center">
                {pendingImages.slice(0,3).map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt="seçilmiş" className="w-10 h-10 rounded-md border border-white/20 object-cover" />
                    <button
                      onClick={() => removePendingAt(i)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white/90 text-[10px] leading-4 flex items-center justify-center border border-white/30 opacity-80 group-hover:opacity-100"
                      title="Sil"
                      aria-label="Şəkli sil"
                      type="button"
                    ></button>
                  </div>
                ))}
                <button onClick={() => setPendingImages([])} className="px-2 py-1 text-xs rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white/80">Hamısını sil</button>
              </div>
            )}
            <p className="mt-6 text-xl font-semibold text-text-main">Bu gün sizə NovEra Brauzer necə kömək edə bilər?</p>
          </div>
        </div>
      ) : (
        <>
        {/* Sticky mini search on results */}
        <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur border-b border-white/10 -mx-4 md:-mx-6 px-4 md:px-6 py-2">
          <div className="w-full max-w-5xl mx-auto flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Small clickable logo: Incognito results -> go incognito home; otherwise -> go lobby */}
            <button
              onClick={() => {
                if (fromIncogResults) openIncognitoHome(); else clearAll();
              }}
              className={`flex items-center gap-2 p-1 rounded-lg ${fromIncogResults ? 'hover:bg-white/10' : 'hover:bg-white/10'}`}
              title={fromIncogResults ? 'Anonim Tab' : 'Əsas səhifə'}
            >
              <Logo isLarge={false} />
            </button>
            {/* Back/Forward global */}
            <div className="flex items-center gap-2">
              {(() => {
                const backDisabled = overlayUrl ? (overlayIndex <= 0) : (!results.length);
                const forwardDisabled = overlayUrl ? (overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) : (!results.length ? !forwardFromLobby : (resultsIndex < 0 || resultsIndex >= resultsHistory.length - 1));
                return (
                  <>
                    <button
                      onClick={handleGlobalBack}
                      disabled={backDisabled}
                      title="Geri"
                      className={`p-2 rounded-lg ${backDisabled ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
                    >
                      <ArrowLeftIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleGlobalForward}
                      disabled={forwardDisabled}
                      title="İrəli"
                      className={`p-2 rounded-lg ${forwardDisabled ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
                    >
                      <ArrowRightIcon className="w-4 h-4" />
                    </button>
                  </>
                );
              })()}
            </div>
            <div className="flex-1 min-w-[160px] sm:min-w-[220px]">
              <HeroSearchBar
                onSend={async (q) => {
                  const imgs = pendingImages;
                  if (imgs && imgs.length) {
                    const term = (q && q.trim()) ? q.trim() : await extractQueryFromImages();
                    setPendingImages([]);
                    setPreviewUrl('');
                    doSearch(1, term || '');
                  } else {
                    const qq = (q || '').trim();
                    setPreviewUrl('');
                    if (isProbablyUrl(qq)) {
                      const url = normalizeUrl(qq);
                      openOverlay(url);
                    } else {
                      doSearch(1, qq);
                    }
                  }
                }}
                isLoading={loading}
                onVoiceClick={() => {}}
                placeholder="Vebdə axtarın..."
                enableEmptySubmit={pendingImages.length > 0}
                onImageSelected={(imgs) => setPendingImages(prev => [...prev, ...imgs])}
              />
            </div>
            {pendingImages.length > 0 && (
              <div className="flex items-center gap-2">
                {pendingImages.slice(0,2).map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt="seçilmiş" className="w-8 h-8 rounded-md border border-white/20 object-cover" />
                    <button
                      onClick={() => removePendingAt(i)}
                      className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-black/70 text-white/90 text-[9px] leading-3.5 flex items-center justify-center border border-white/30 opacity-80 group-hover:opacity-100"
                      title="Sil"
                      aria-label="Şəkli sil"
                      type="button"
                    ></button>
                  </div>
                ))}
                <button onClick={() => setPendingImages([])} className="px-2 py-1 text-[11px] rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white/80">Hamısını sil</button>
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 h-full overflow-hidden grid-cols-1">
        {/* Results list */}
        <div className="overflow-y-auto pr-2 pb-24 browser-scroll">
          {/* Tabs: Web / Images / Videos / News / Shopping */}
          <div className="flex gap-2 mb-3 sticky top-0 bg-bg-main/95 backdrop-blur z-10 p-2 rounded-lg border border-white/10 overflow-x-auto no-scrollbar scroll-touch whitespace-nowrap">
            {(
              [
                { id: 'web', label: `Veb ${results.length ? `(${results.length})` : ''}` },
                { id: 'images', label: `Şəkillər ${imageResults.length ? `(${imageResults.length})` : ''}` },
                { id: 'videos', label: `Videolar ${videoUrls.length ? `(${videoUrls.length})` : ''}` },
                { id: 'news', label: `Xəbərlər ${newsItems.length ? `(${newsItems.length})` : ''}` },
                { id: 'shopping', label: `Shopping ${products.length ? `(${products.length})` : ''}` },
              ] as const
            ).map(t => (
              <button key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === t.id ? 'bg-accent/20 text-white ring-1 ring-accent/50' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          {/* AI Analysis compact panel (modern, animated) */}
          <div className="mb-3 p-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 via-white/4 to-white/6 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,.25)] transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Logo isLarge={false} />
                <span className="text-sm font-semibold text-white/90">AI Analizi</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleAiAnalyze}
                  disabled={aiLoading || !query.trim()}
                  className={`px-3 py-1.5 rounded-lg text-sm ${aiLoading || !query.trim() ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-accent/60 hover:bg-accent/70 text-white shadow-md shadow-accent/20'}`}
                >
                  {aiLoading ? 'Analiz edilir...' : 'AI Analiz Et'}
                </button>
                <button
                  onClick={() => setAiExpanded(v => !v)}
                  className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white/80 text-xs"
                  title={aiExpanded ? 'Yığ' : 'Aç'}
                >
                  {aiExpanded ? 'Yığ' : 'Aç'}
                </button>
                {/* N avatar */}

                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/40 to-accent/10 border border-accent/40 text-[11px] font-semibold flex items-center justify-center text-white/90">N</div>
              </div>
            </div>
            <div className={`grid transition-all duration-300 ${aiExpanded ? 'grid-rows-[1fr] mt-3' : 'grid-rows-[0fr]'} overflow-hidden`}>
              <div className="min-h-0 space-y-3">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="Nəyi analiz edim? (default: cari axtarış)"
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/40 text-white placeholder-white/60 border border-white/15 focus:outline-none focus:ring-2 focus:ring-accent/60"
                  />
                  <button
                    onClick={handleAiSend}
                    disabled={aiLoading || (!aiInput.trim() && pendingImages.length === 0)}
                    className={`px-3 py-2 rounded-lg text-sm ${aiLoading || (!aiInput.trim() && pendingImages.length === 0) ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-accent/60 hover:bg-accent/70 text-white shadow-md shadow-accent/20'}`}
                  >
                    Göndər
                  </button>
                  {/* Inline camera and file buttons instead of dropdown */}
                  <button
                    onClick={() => aiFileInputRef.current?.click()}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 shrink-0"
                    title="Kamera"
                    type="button"
                  >
                    <CameraIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button
                    onClick={() => aiGalleryInputRef.current?.click()}
                    className="p-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 shrink-0"
                    title="Fayl"
                    type="button"
                  >
                    📁
                  </button>
                </div>
                {pendingImages.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {pendingImages.slice(0, 4).map((src, i) => (
                      <div key={i} className="relative group">
                        <img src={src} alt="seçilmiş" className="w-12 h-12 rounded-md border border-white/20 object-cover" />
                        <button
                          onClick={() => removePendingAt(i)}
                          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-black/70 text-white/90 text-[10px] leading-4 flex items-center justify-center border border-white/30 opacity-80 group-hover:opacity-100"
                          title="Sil"
                          aria-label="Şəkli sil"
                          type="button"
                        ></button>
                      </div>
                    ))}
                    {pendingImages.length > 4 && (
                      <span className="text-xs text-white/70">+{pendingImages.length - 4}</span>
                    )}
                    <button onClick={() => setPendingImages([])} className="ml-2 px-2 py-1 text-xs rounded-md bg-white/10 hover:bg-white/15 border border-white/20 text-white/80">Hamısını sil</button>
                  </div>
                )}
                {/* Message bubble */}
                {(aiLoading || aiText) && (
                  <div className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/40 to-accent/10 border border-accent/40 flex items-center justify-center text-[11px] font-semibold text-white/90 flex-shrink-0">N</div>
                    <div className="flex-1 p-3 rounded-2xl bg-white/8 border border-white/10 text-sm text-white/90 whitespace-pre-wrap">
                      {/* Show analyzed image thumbnails */}
                      {aiUsedImages && aiUsedImages.length > 0 && (
                        <div className="mb-2 flex items-center gap-2 flex-wrap">
                          {aiUsedImages.slice(0, 4).map((src, i) => (
                            <button key={i} onClick={() => setAiImageModalUrl(src)} className="focus:outline-none">
                              <img src={src} alt="analiz şəkli" className="w-12 h-12 rounded-md border border-white/20 object-cover hover:opacity-90" />
                            </button>
                          ))}
                          {aiUsedImages.length > 4 && (
                            <span className="text-xs text-white/70">+{aiUsedImages.length - 4}</span>
                          )}
                        </div>
                      )}
                      {/* Typing indicator while loading or animating */}
                      { (aiLoading || (aiText && aiRendered.length < aiText.length)) ? (
                        <div className="flex items-center gap-1 text-white/70">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '120ms' }} />
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '240ms' }} />
                        </div>
                      ) : null }
                      {aiRendered}
                      {aiSources && aiSources.length > 0 && (
                        <div className="mt-2 text-xs text-white/70 flex flex-wrap gap-2">
                          {aiSources.slice(0, 8).map((s, i) => (
                            <button
                              key={s.uri + i}
                              onClick={() => { if (s.uri) { try { openOverlay(s.uri); } catch {} } }}
                              className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 border border-white/15"
                              title={s.uri || ''}
                              type="button"
                            >
                              [{s.index ?? i + 1}] {s.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {/* Hidden AI attachment inputs */}
          <input ref={aiFileInputRef} type="file" onChange={handleAiFileUpload} className="hidden" accept="image/*" capture="environment" />
          <input ref={aiGalleryInputRef} type="file" onChange={handleAiFileUpload} className="hidden" accept="image/*" capture={false} />

          {activeTab === 'web' ? (
            <ul className="space-y-3 max-w-3xl mx-auto">
              {results.map((item, i) => {
                const host = getHost(item.link);
                const favicon = `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
                const thumbnail = item.pagemap?.cse_thumbnail?.[0]?.src;
                let domain = host;
                let isHttp = false;
                try { const u = new URL(item.link); domain = u.hostname; isHttp = u.protocol === 'http:'; } catch {}
                const isSuspicious = isHttp;
                return (
                  <li key={i} className={`group relative p-4 bg-white/5 rounded-xl border ${
                    isSuspicious ? 'border-red-500/40' : 'border-white/10'
                  } hover:bg-white/10 hover:border-white/20 transition-all shadow-lg hover:shadow-xl`}>
                    <button
                      className="text-left w-full"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          if (isHttp) {
                            const ok = window.confirm('Bu sayt HTTPS istifadə etmir (HTTP). Davam etmək istəyirsiniz?');
                            if (!ok) return;
                          }
                        } catch {}
                        openOverlay(item.link);
                      }}
                      title={item.title}
                    >
                      <div className="flex gap-3">
                        {thumbnail && (
                          <img
                            src={thumbnail}
                            alt=""
                            className="w-20 h-20 object-cover rounded-lg border border-white/10 flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <img src={favicon} alt="" className="w-4 h-4" />
                            <span className="text-xs text-green-400 truncate">{domain}</span>
                            {isSuspicious && (
                              <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full border border-red-500/40">🔓 HTTPS yoxdur</span>
                            )}
                          </div>
                          <div className="text-lg font-semibold text-blue-400 group-hover:underline line-clamp-2">{item.title}</div>
                          <p className="text-sm text-text-sub mt-1 line-clamp-2">{item.snippet}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : activeTab === 'images' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {imageResults.map((img, idx) => {
                const href = img.image.contextLink;
                let domain = '';
                try { domain = new URL(href).hostname.replace(/^www\./,''); } catch {}
                return (
                  <button
                    key={idx}
                    onClick={() => { openOverlay(href); }}
                    className="group block rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all shadow-lg hover:shadow-2xl"
                    title={img.title}
                  >
                    <div className="aspect-square overflow-hidden">
                      <img src={img.image.thumbnailLink} alt={img.title} loading="lazy" decoding="async" sizes="(max-width: 640px) 50vw, 33vw" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                    </div>
                    <div className="p-2 text-left bg-black/30 border-t border-white/10">
                      <div className="text-[11px] text-green-400 truncate">{domain}</div>
                      <div className="text-xs text-white/90 line-clamp-2">{img.title || href}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : activeTab === 'videos' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {videoUrls.map((url, i) => (
                <button key={i} onClick={(e) => { e.preventDefault(); e.stopPropagation(); openOverlay(url); }} className="text-left p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors truncate">
                  <div className="text-sm text-blue-300 underline">Videonu aç</div>
                  <div className="text-xs text-white/60 truncate mt-1">{url}</div>
                </button>
              ))}
            </div>
          ) : activeTab === 'news' ? (
            <ul className="space-y-3 max-w-3xl mx-auto">
              {newsItems.map((n, idx) => (
                <li key={idx} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all">
                  <button onClick={() => { const u = n.url; openOverlay(u); }} className="text-left text-base font-semibold text-blue-400 hover:underline">{n.title}</button>
                  <div className="text-xs text-white/60 mt-1">{n.source} · {new Date(n.publishedAt).toLocaleString()}</div>
                  {n.summary && <p className="text-sm text-white/70 mt-1 line-clamp-2">{n.summary}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {products.map((p, i) => (
                <button key={i} onClick={(e) => { e.preventDefault(); e.stopPropagation(); const u = p.link; openOverlay(u); }} className="text-left p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                  <div className="text-sm font-medium text-white/90 line-clamp-2">{p.title}</div>
                  {p.price && <div className="text-xs text-green-400 mt-1">{p.price}</div>}
                  {p.source && <div className="text-[11px] text-white/60 mt-1">{p.source}</div>}
                </button>
              ))}
            </div>
          )}

          {/* Sticky pagination at bottom of scroller (Web tab only) */}
          {activeTab === 'web' && results.length > 0 && (
            <div className="sticky bottom-0 left-0 right-0 mt-3 pt-2 pb-2 safe-bottom bg-bg-main/80 backdrop-blur border-t border-white/10 flex items-center justify-center gap-3 sm:gap-4">
              <button
                onClick={goPrevPageBtn}
                disabled={page <= 1}
                className={`px-3 sm:px-4 py-2 rounded-md text-sm transition-colors ${page <= 1 ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              >
                Əvvəlki
              </button>
              <span className="text-text-sub text-sm sm:text-base">Səhifə {page}</span>
              <button
                onClick={goNextPageBtn}
                disabled={!hasNextPage}
                className={`px-3 sm:px-4 py-2 rounded-md text-sm transition-colors ${!hasNextPage ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              >
                Növbəti
              </button>
            </div>
          )}
        </div>

        {/* No side preview; pages open in full overlay or new tab */}
      </div>
      </>
      )}

      {/* Full-screen web overlay */}
      {(overlayUrl || overlayIncognito) && (
        <div ref={overlayContainerRef} className="fixed inset-0 z-[9999] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" style={{ colorScheme: (isLightOverlay ? 'light' : 'dark') as any }}>
          <div className={`absolute inset-0 ${isLightOverlay ? 'bg-white/80' : 'bg-black/80'}`} />
          <div className="relative z-50 h-full w-full flex flex-col">{overlayChromeHidden && (<div className="absolute top-2 right-2 z-[60]"><button onClick={() => setOverlayChromeHidden(false)} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white text-xs border border-white/20">Paneli göstər</button></div>)}
            <div className="flex items-center gap-2 px-2 py-1.5 md:px-3 md:py-2 bg-white/10 backdrop-blur border-b border-white/15" style={{ display: overlayChromeHidden ? "none" : undefined }}>
              {/* Left: Hamburger menu for overlay (incognito only) */}
              {overlayIncognito && (
                <div className="relative">
                  <button onClick={() => setOverlayMenuOpen(v => !v)} className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15" aria-label="Menyu" title="Menyu">
                    <MenuIcon className="w-4 h-4" />
                  </button>
                  {overlayMenuOpen && (
                    <div className="absolute left-0 top-full mt-2 bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl border border-white/20 py-2 min-w-[240px] z-[70] overflow-hidden">
                      <div className="absolute left-4 -top-1 w-3 h-3 rotate-45 bg-white/10 border-l border-t border-white/20"></div>
                      <button onClick={() => { setOverlayIncognito(false); closeOverlay(); setOverlayMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                        <span>⬅️</span>
                        <span>Brauzerə Geri Qayıt</span>
                      </button>
                      <button onClick={() => { dispatchNav('profile'); setOverlayMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                        <span>👤</span>
                        <span>Profil</span>
                      </button>
                      <button onClick={() => { dispatchNav('safe-search'); setOverlayMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                        <span>🛡️</span>
                        <span>SafeSearch</span>
                      </button>
                      <button onClick={() => { dispatchNav('settings'); setOverlayMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                        <span>⚙️</span>
                        <span>Ayarlar</span>
                      </button>
                      <div className="my-1 h-px bg-white/10" />
                      {/* Theme selector for incognito overlay */}
                      <div className="px-4 py-2 text-xs text-white/70">Görünüş</div>
                      <div className="px-3 pb-3 flex items-center gap-2">
                        {([
                          { id: 'light', label: 'Ağ rejim' },
                          { id: 'dark', label: 'Tünd rejim' },
                          { id: 'system', label: 'Sistem' },
                        ] as const).map(opt => (
                          <button key={opt.id}
                            onClick={() => setOverlayTheme(opt.id as any)}
                            className={`px-3 py-1.5 rounded-full text-xs border ${overlayTheme === opt.id ? 'bg-white/20 text-white border-white/40' : 'bg-white/5 text-white/80 hover:bg-white/10 border-white/20'}`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Nav */}
              <div className="flex items-center gap-3">
                {overlayIncognito ? (
                  <div className="flex items-center gap-2 pr-3 mr-1 border-r border-white/10">
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white">🕶️</div>
                    <div className="leading-none">
                      <div className="text-sm text-white font-semibold">Anonim Tab</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 pr-3 mr-1 border-r border-white/10">
                    <Logo className="text-white text-xl" />
                    <div className="leading-none">
                      <div className="text-[10px] text-white/70 -mt-[2px]">NovEra Brauzer</div>
                    </div>
                  </div>
                )}
                <button onClick={goBack} disabled={overlayIndex <= 0} title="Geri" className={`p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 ${overlayIndex <= 0 ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>
                <button onClick={goForward} disabled={overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1} title="İrəli" className={`p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15 ${(overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) ? 'opacity-40 cursor-not-allowed' : ''}`}>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button onClick={reloadOverlay} title="Yenilə" className="p-2 rounded-lg bg-white/10 text-white/80 hover:bg-white/15">
                  <RefreshIcon className="w-4 h-4" />
                </button>
              </div>
              {/* URL + Search (hidden in Incognito for cleaner look) */}
              {!overlayIncognito && (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {overlayUrl ? (
                    <>
                      <img src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(overlayUrl).hostname; } catch { return 'nov-era.app'; } })()}&sz=32`} className="w-4 h-4" />
                      <span className="text-xs text-white/80 truncate max-w-[24vw] hidden md:block">{overlayUrl}</span>
                    </>
                  ) : null}
                  <input
                    type="text"
                    value={overlaySearch}
                    onChange={(e) => setOverlaySearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = (overlaySearch || '').trim();
                        if (!v) return;
                        if (isProbablyUrl(v)) { navigateOverlay(normalizeUrl(v)); setOverlaySearch(''); return; }
                        closeOverlay(); doSearch(1, v);
                      }
                    }}
                    placeholder="Axtar..."
                    className="flex-1 min-w-0 text-base px-4 py-2 rounded-full bg-black/60 text-white placeholder-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-accent/70"
                  />
                  <button onClick={() => {
                    const v = (overlaySearch || '').trim();
                    if (!v) return;
                    if (isProbablyUrl(v)) { navigateOverlay(normalizeUrl(v)); setOverlaySearch(''); return; }
                    closeOverlay(); doSearch(1, v);
                  }} className="px-3 md:px-4 py-2 rounded-full bg-accent/50 text-white hover:bg-accent/60 text-sm">Axtar</button>
                </div>
              )}
              {/* Actions (simplified in Incognito) */}
              <div className="flex items-center gap-2">
                <button onClick={toggleFullscreen} className="p-2 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 border border-white/20" title={isFullscreenActive ? 'Tam ekrandan çıx' : 'Tam ekran'}>
                  {isFullscreenActive ? <MinimizeIcon className="w-4 h-4" /> : <MaximizeIcon className="w-4 h-4" />}
                </button>
                {!overlayIncognito && (
                  <>
                    <button
                      onClick={() => setOverlayOpenMode('original')}
                      className={`inline-flex text-xs px-3 py-1 rounded-lg transition-colors ${overlayOpenMode === 'original' ? 'bg-accent/40 text-white' : 'bg-white/10 hover:bg-white/15 text-white/80'} border border-white/20`}
                    >{overlayOpenMode === 'original' ? '✓ iframe' : 'iframe'}</button>
                    <button
                      onClick={() => setOverlayOpenMode('proxy')}
                      className={`inline-flex text-xs px-3 py-1 rounded-lg transition-colors ${overlayOpenMode === 'proxy' ? 'bg-accent/40 text-white' : 'bg-white/10 hover:bg-white/15 text-white/80'} border border-white/20`}
                    >{overlayOpenMode === 'proxy' ? '✓ orginal' : 'orginal'}</button>
                    <a href={overlayUrl} target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex text-xs px-3 py-1 bg-accent/30 text-white rounded-lg hover:bg-accent/40 transition-colors">Yeni pəncərədə aç ↗</a>
                  </>
                )}
                <button onClick={closeOverlay} className="p-1.5 rounded-lg hover:bg-white/10 text-white/80" title="Bağla">
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Incognito landing or web iframe */}
            {overlayIncognito && !overlayUrl ? (
              <div className="flex-1 w-full flex items-center justify-center p-6">
                <div className="max-w-2xl w-full rounded-3xl border border-white/15 bg-white/5 backdrop-blur p-8 text-center shadow-2xl">
                  <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white/90 text-2xl">🕶️</div>
                  <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Anonim Rejim</h2>
                  <p className="text-white/70 mb-6 text-sm md:text-base">Bu rejimdə axtarış tarixçəsi, kukilər və form məlumatları NovEra daxilində saxlanmır.</p>
                  <div className="flex items-center gap-2 max-w-xl mx-auto">
                    <input
                      type="text"
                      value={overlaySearch}
                      onChange={(e) => setOverlaySearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { const v = (overlaySearch || '').trim(); if (!v) return; if (isProbablyUrl(v)) { navigateOverlay(normalizeUrl(v)); setOverlaySearch(''); return; } const q = 'https://www.google.com/search?q=' + encodeURIComponent(v); navigateOverlay(q); } }}
                      placeholder="Ünvanı və ya sorğunu yazın..."
                      className="flex-1 min-w-0 text-base px-4 py-3 rounded-full bg-black/60 text-white placeholder-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-accent/70"
                    />
                    <button onClick={() => { const v = (overlaySearch || '').trim(); if (!v) return; if (isProbablyUrl(v)) { navigateOverlay(normalizeUrl(v)); setOverlaySearch(''); return; } const q = 'https://www.google.com/search?q=' + encodeURIComponent(v); navigateOverlay(q); }} className="px-4 py-3 rounded-full bg-accent/50 text-white hover:bg-accent/60 text-sm">Davam et</button>
                  </div>
                  <div className="text-xs text-white/50 mt-4">Qeyd: Saytların özləri brauzer səviyyəsində cookies yarada bilər; NovEra bu sessiyanı yadda saxlamır.</div>
                </div>
              </div>
            ) : overlayIncognito ? (
              <div className="flex-1 w-full overflow-auto p-3 md:p-6">
                {overlayNotice && (
                  <div className="mx-auto max-w-6xl mb-3 px-3 py-2 bg-amber-500/15 text-amber-200 text-xs border border-amber-400/30 rounded-xl">{overlayNotice}</div>
                )}
                <div className="mx-auto w-full max-w-6xl h-[72vh] md:h-[80vh] rounded-3xl border border-white/15 bg-white/5 backdrop-blur overflow-hidden shadow-2xl">
                  <iframe
                    key={`${(overlayOpenMode === 'proxy' ? toProxyUrl(overlayUrl!) : overlayUrl) ?? ''}-${overlayKey}`}
                    src={overlayUrl ? (overlayOpenMode === 'proxy' ? toProxyUrl(overlayUrl) : overlayUrl) : ''}
                    className={`w-full h-full ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                    referrerPolicy="no-referrer-when-downgrade"
                    allow="autoplay; fullscreen; clipboard-read; clipboard-write; geolocation; microphone; camera; display-capture; accelerometer; gyroscope; payment; magnetometer; midi; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                    onLoad={() => { overlayLoadedRef.current = true; if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } }}
                  />
                </div>
              </div>
            ) : (
              (() => {
                const src = overlayUrl ? (overlayOpenMode === 'proxy' ? toProxyUrl(overlayUrl) : overlayUrl) : '';
                return (
                  <>
                    {overlayNotice && (
                      <div className="px-3 py-2 bg-amber-500/15 text-amber-200 text-xs border-b border-amber-400/30">{overlayNotice}</div>
                    )}
                    <iframe
                      key={`${src}-${overlayKey}`}
                      src={src}
                      className={`flex-1 w-full ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                      referrerPolicy="no-referrer-when-downgrade"
                      allow="autoplay; fullscreen; clipboard-read; clipboard-write; geolocation; microphone; camera; display-capture; accelerometer; gyroscope; payment; magnetometer; midi; encrypted-media; picture-in-picture; web-share"
                      allowFullScreen
                      onLoad={() => { overlayLoadedRef.current = true; if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } }}
                    />
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* AI Analysis: Image Zoom Modal */}
      {aiImageModalUrl && (
        <div className="fixed inset-0 z-[9998] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setAiImageModalUrl(null)}>
          <div className="relative max-w-5xl w-full max-h-[90vh] bg-black/40 border border-white/20 rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setAiImageModalUrl(null)} className="absolute top-2 right-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Bağla</button>
            <div className="w-full h-full flex items-center justify-center p-3">
              <img src={aiImageModalUrl} alt="şəkil" className="max-w-full max-h-[72vh] object-contain rounded-lg" />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <div className="text-xs text-white/70">Şəkil önizləmə</div>
              <div className="flex items-center gap-2">
                <a href={aiImageModalUrl} download className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Yüklə</a>
                <button
                  onClick={async () => {
                    try {
                      if (navigator.share && /^https?:/i.test(aiImageModalUrl)) {
                        await navigator.share({ title: 'Şəkil', url: aiImageModalUrl });
                        setAiShareHint('Paylaşıldı');
                        setTimeout(() => setAiShareHint(null), 1400);
                        return;
                      }
                      await navigator.clipboard.writeText(aiImageModalUrl);
                      setAiShareHint('Link kopyalandı');
                      setTimeout(() => setAiShareHint(null), 1400);
                    } catch {
                      setAiShareHint('Paylaşmaq alınmadı');
                      setTimeout(() => setAiShareHint(null), 1600);
                    }
                  }}
                  className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20"
                >Paylaş</button>
                <a href={aiImageModalUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-md bg-white/10 hover:bg-white/15 text-white/90 text-sm border border-white/20">Yeni tab</a>
              </div>
            </div>
            {aiShareHint && <div className="absolute left-3 bottom-3 text-xs text-white/80 bg-white/10 rounded-md px-2 py-1 border border-white/20">{aiShareHint}</div>}
          </div>
        </div>
      )}

      {/* Transparent scrollbars for results */}
      <style>
        {`
          .browser-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.2) transparent; }
          .browser-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
          .browser-scroll::-webkit-scrollbar-thumb { background-color: rgba(255,255,255,.22); border-radius: 8px; }
          .browser-scroll::-webkit-scrollbar-track { background: transparent; }
          .browser-scroll { -webkit-overflow-scrolling: touch; }
          .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          .scroll-touch { -webkit-overflow-scrolling: touch; }
          .safe-bottom { padding-bottom: calc(env(safe-area-inset-bottom) + 0.5rem); }
        `}
      </style>

      {/* No in-app camera UI here; HeroSearchBar uses native camera/gallery pickers */}
    </div>
  );
};
export default BrowserView;
