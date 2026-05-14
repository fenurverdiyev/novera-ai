import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon, LoadingSpinner, MicrophoneIcon, CameraIcon, CloseIcon, ArrowLeftIcon, MaximizeIcon, MinimizeIcon, MenuIcon, PlusIcon } from './Icons';
import { ArrowRightIcon, RefreshIcon } from './BrowserIcons';
import { suggestAutocomplete, detectLocaleForSearch, searchImagesAndVideos, searchNews, searchShopping, searchWeb, isLikelyExplicit } from '../services/searchService';
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
  try { new URL(s); return true; } catch { }
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

// Heuristic: is URL pointing to an image resource
const isImageUrlLike = (u: string): boolean => {
  try {
    const s = (u || '').toLowerCase();
    return /\.(png|jpg|jpeg|gif|webp|bmp|svg|ico|tif|tiff)([$?#]|$)/i.test(s);
  } catch { return false; }
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
  const [safeSearchDropdownOpen, setSafeSearchDropdownOpen] = useState(false);
  const [unblurredItems, setUnblurredItems] = useState<Set<string>>(new Set());
  const [blurConfirmation, setBlurConfirmation] = useState<{ url: string; onConfirm: () => void } | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlaySearch, setOverlaySearch] = useState<string>('');
  const [overlayHistory, setOverlayHistory] = useState<string[]>([]);
  const [overlayIndex, setOverlayIndex] = useState<number>(-1);
  const [overlayKey, setOverlayKey] = useState<number>(0);
  const [overlayEmbedMode, setOverlayEmbedMode] = useState<'embed' | 'reader'>('embed');
  const [overlayChromeHidden, setOverlayChromeHidden] = useState(false);
  const [overlayOpenMode, setOverlayOpenMode] = useState<'original' | 'proxy'>('proxy');
  const [overlayLoading, setOverlayLoading] = useState(false);
  const overlayLoadedRef = useRef<boolean>(false);
  const overlayFallbackTimerRef = useRef<number | null>(null);
  const overlayContainerRef = useRef<HTMLDivElement>(null);
  const bodyOverflowPrevRef = useRef<string | null>(null);
  const [isFullscreenActive, setIsFullscreenActive] = useState(false);
  const [overlayMenuOpen, setOverlayMenuOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const [overlayIncognito, setOverlayIncognito] = useState(false);
  const [overlayNotice, setOverlayNotice] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState(false);
  const [overlayShellOpen, setOverlayShellOpen] = useState(false);
  // Desktop home omnibox state (history + suggestions)
  const [hbQuery, setHbQuery] = useState('');
  const [hbSuggestions, setHbSuggestions] = useState<string[]>([]);
  const [hbActiveIndex, setHbActiveIndex] = useState<number>(-1);
  const [hbFocused, setHbFocused] = useState(false);
  const hbDebounceRef = useRef<number | null>(null);
  const [hbHistory, setHbHistory] = useState<string[]>([]);
  useEffect(() => {
    const check = () => {
      try {
        const mq = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
        const ua = navigator.userAgent || '';
        const uaMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua);
        setIsMobile(!!(mq || uaMobile));
      } catch { setIsMobile(false); }
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check as any);
    return () => { window.removeEventListener('resize', check); window.removeEventListener('orientationchange', check as any); };
  }, []);

  // Load history for desktop omnibox
  useEffect(() => {
    try {
      const raw = localStorage.getItem('novEra.search.history');
      const arr = raw ? JSON.parse(raw) : [];
      if (Array.isArray(arr)) setHbHistory(arr as string[]);
    } catch { }
  }, []);

  // Incognito results mode (for desktop header suggestions gating)
  const [incogResultsActive, setIncogResultsActive] = useState<boolean>(false);

  // Suggestions for desktop omnibox (history for <2 chars, autocomplete for >=2)
  useEffect(() => {
    if (!hbFocused) { setHbSuggestions([]); setHbActiveIndex(-1); return; }
    // In Incognito or when viewing results originated from Incognito, never show suggestions/history
    if (overlayIncognito || incogResultsActive) { setHbSuggestions([]); setHbActiveIndex(-1); return; }
    if (hbDebounceRef.current) window.clearTimeout(hbDebounceRef.current);
    const q = hbQuery.trim();
    if (q.length < 2) {
      setHbSuggestions(hbHistory);
      setHbActiveIndex(hbHistory.length ? 0 : -1);
      return;
    }
    const { hl, gl } = detectLocaleForSearch();
    hbDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await suggestAutocomplete(q, { hl, gl });
        const items = (res || []).slice(0, 8);
        setHbSuggestions(items);
        setHbActiveIndex(items.length ? 0 : -1);
      } catch {
        setHbSuggestions([]);
        setHbActiveIndex(-1);
      }
    }, 200);
    return () => { if (hbDebounceRef.current) window.clearTimeout(hbDebounceRef.current); };
  }, [hbQuery, hbFocused, hbHistory, overlayIncognito, incogResultsActive]);

  const submitHeader = useCallback((val?: string) => {
    const q = (val ?? hbQuery).trim();
    if (!q) return;
    // Reflect query in current header tab title (normal/incognito)
    try {
      if (overlayIncognito) {
        setTabsIncog(prev => {
          const id = activeTabIdIncog;
          return prev.map(t => t.id === id ? { ...t, title: q } : t);
        });
      } else {
        setTabsNormal(prev => {
          const id = activeTabIdNormal;
          return prev.map(t => t.id === id ? { ...t, title: q } : t);
        });
      }
    } catch { }
    if (isProbablyUrl(q)) {
      openOverlay(normalizeUrl(q));
    } else {
      doSearch(1, q);
    }
    // persist history (disabled in Incognito and Incognito-originated results)
    if (!(overlayIncognito || incogResultsActive)) {
      try {
        const cleaned = q.slice(0, 200);
        let next = hbHistory.filter(p => p.toLowerCase() !== cleaned.toLowerCase());
        next.unshift(cleaned);
        if (next.length > 20) next = next.slice(0, 20);
        localStorage.setItem('novEra.search.history', JSON.stringify(next));
        setHbHistory(next);
      } catch { }
    }
    setHbQuery('');
    setHbSuggestions([]);
    setHbActiveIndex(-1);
  }, [hbQuery, hbHistory]);

  // No auto-open; keep home screen visible until user navigates or opens incognito

  // Simple overlay tabs (separate sets for normal and incognito)
  interface OverlayTab { id: string; url: string | null; title: string; history: string[]; historyIndex: number; }
  const [tabsNormal, setTabsNormal] = useState<OverlayTab[]>([]);
  const [tabsIncog, setTabsIncog] = useState<OverlayTab[]>([]);
  const [activeTabIdNormal, setActiveTabIdNormal] = useState<string | null>(null);
  const [activeTabIdIncog, setActiveTabIdIncog] = useState<string | null>(null);
  const [showTabSwitcher, setShowTabSwitcher] = useState(false);
  const [tabSearch, setTabSearch] = useState('');

  // Per-tab search state store (so each tab remembers its own results/lobby)
  interface TabSearchState {
    query: string;
    page: number;
    results: SearchItem[];
    imageResults: ImageResult[];
    videoUrls: string[];
    newsItems: NewsArticle[];
    products: ShoppingProduct[];
    resultsHistory: number[];
    resultsIndex: number;
    forwardFromLobby: { query: string; page: number } | null;
    activeTabView: 'web' | 'images' | 'videos' | 'news' | 'shopping';
    hasNextPage: boolean;
    error: string | null;
    fromIncogResults: boolean;
    previewUrl: string;
  }
  const [tabSearchStore, setTabSearchStore] = useState<Record<string, TabSearchState>>({});
  const tabKey = useCallback((inc: boolean, id: string | null) => `${inc ? 'i' : 'n'}:${id || ''}`, []);
  const defaultTabSearch = useCallback((): TabSearchState => ({
    query: '', page: 1, results: [], imageResults: [], videoUrls: [], newsItems: [], products: [],
    resultsHistory: [], resultsIndex: -1, forwardFromLobby: null, activeTabView: 'web',
    hasNextPage: false, error: null, fromIncogResults: false, previewUrl: ''
  }), []);
  const applySearchState = useCallback((st?: TabSearchState) => {
    const s = st || defaultTabSearch();
    setQuery(s.query);
    setPage(s.page);
    setResults(s.results);
    setImageResults(s.imageResults);
    setVideoUrls(s.videoUrls);
    setNewsItems(s.newsItems);
    setProducts(s.products);
    setResultsHistory(s.resultsHistory);
    setResultsIndex(s.resultsIndex);
    setForwardFromLobby(s.forwardFromLobby);
    setActiveTab(s.activeTabView);
    setHasNextPage(s.hasNextPage);
    setError(s.error);
    setFromIncogResults(s.fromIncogResults);
    setPreviewUrl(s.previewUrl);
  }, [defaultTabSearch]);

  const currentOverlayTab = useMemo(() => {
    const list = overlayIncognito ? tabsIncog : tabsNormal;
    const id = overlayIncognito ? activeTabIdIncog : activeTabIdNormal;
    return list.find(t => t.id === id) || null;
  }, [overlayIncognito, tabsNormal, tabsIncog, activeTabIdNormal, activeTabIdIncog]);

  const makeNewTab = useCallback((initialUrl: string | null): OverlayTab => {
    const u = initialUrl || null;
    const title = u ? getHost(u).replace(/^www\./, '') : 'Yeni Tab';
    return { id: Math.random().toString(36).slice(2), url: u, title, history: u ? [u] : [], historyIndex: u ? 0 : -1 };
  }, []);

  useEffect(() => {
    setTabsNormal(prev => {
      if (prev.length > 0) return prev;
      const nt = makeNewTab(null);
      setActiveTabIdNormal(nt.id);
      try { const k = tabKey(false, nt.id); setTabSearchStore(prev => ({ ...prev, [k]: defaultTabSearch() })); } catch { }
      return [nt];
    });
  }, [makeNewTab, tabKey, defaultTabSearch]);

  const setActiveTabCommon = useCallback((tab: OverlayTab | null) => {
    setOverlayUrl((prev) => {
      const next = tab ? tab.url : null;
      if (prev !== next) setOverlayKey(k => k + 1);
      return next;
    });
    setOverlayHistory(tab ? tab.history : []);
    setOverlayIndex(tab ? tab.historyIndex : -1);
  }, []);

  // Per-tab search snapshot helpers (hoisted function declarations)
  function getSearchSnapshot(): TabSearchState {
    return {
      query, page, results, imageResults, videoUrls, newsItems, products,
      resultsHistory, resultsIndex, forwardFromLobby, activeTabView: activeTab,
      hasNextPage, error, fromIncogResults, previewUrl
    };
  }
  function saveCurrentTabSearch() {
    const id = overlayIncognito ? activeTabIdIncog : activeTabIdNormal;
    if (!id) return;
    const k = tabKey(overlayIncognito, id);
    const snap = getSearchSnapshot();
    setTabSearchStore(prev => ({ ...prev, [k]: snap }));
  }

  const openNewTab = useCallback((initialUrl: string | null = null) => {
    try { saveCurrentTabSearch(); } catch { }
    const t = makeNewTab(initialUrl);
    if (overlayIncognito) {
      setTabsIncog(prev => [...prev, t]);
      setActiveTabIdIncog(t.id);
    } else {
      setTabsNormal(prev => [...prev, t]);
      setActiveTabIdNormal(t.id);
    }
    setActiveTabCommon(t);
    // initialize search store for new tab if it's empty
    try {
      const k = tabKey(overlayIncognito, t.id);
      setTabSearchStore(prev => (prev[k] ? prev : { ...prev, [k]: defaultTabSearch() }));
    } catch { }
    setOverlayShellOpen(true);
    setShowTabSwitcher(false);
  }, [overlayIncognito, makeNewTab, setActiveTabCommon, saveCurrentTabSearch, tabKey, defaultTabSearch]);

  // Create tab without opening overlay (used on home header + button)
  const openNewTabLocal = useCallback(() => {
    // Save the current tab's search BEFORE switching active tab
    try { saveCurrentTabSearch(); } catch { }
    const t = makeNewTab(null);
    if (overlayIncognito) {
      setTabsIncog(prev => [...prev, t]);
      setActiveTabIdIncog(t.id);
    } else {
      setTabsNormal(prev => [...prev, t]);
      setActiveTabIdNormal(t.id);
    }
    setActiveTabCommon(t);
    // Initialize the new tab's store and show empty lobby state
    try {
      const k = tabKey(overlayIncognito, t.id);
      setTabSearchStore(prev => ({ ...prev, [k]: defaultTabSearch() }));
      applySearchState(defaultTabSearch());
    } catch { }
    // Return to lobby view (no overlay); keep current mode (normal/incognito)
    setOverlayShellOpen(false);
    setOverlayChromeHidden(false);
    setShowTabSwitcher(false);
  }, [overlayIncognito, makeNewTab, setActiveTabCommon, saveCurrentTabSearch, tabKey, defaultTabSearch, applySearchState]);

  // Listen for global request to create a new tab (from Sidebar '+')
  useEffect(() => {
    const onNewTab = () => { try { openNewTabLocal(); } catch { } };
    window.addEventListener('nov-era-new-tab' as any, onNewTab as any);
    return () => window.removeEventListener('nov-era-new-tab' as any, onNewTab as any);
  }, [openNewTabLocal]);

  // From WebView overlay, opening a new tab should return to the same mode's lobby
  const openHeaderNewTabFromOverlay = useCallback(() => {
    // Save the current tab's search BEFORE switching active tab
    try { saveCurrentTabSearch(); } catch { }
    const t = makeNewTab(null);
    if (overlayIncognito) {
      setTabsIncog(prev => [...prev, t]);
      setActiveTabIdIncog(t.id);
    } else {
      setTabsNormal(prev => [...prev, t]);
      setActiveTabIdNormal(t.id);
    }
    // Initialize new tab lobby search state
    try {
      const k = tabKey(overlayIncognito, t.id);
      setTabSearchStore(prev => ({ ...prev, [k]: defaultTabSearch() }));
      applySearchState(defaultTabSearch());
    } catch { }
    // close overlay shell and reset state (stay in the same mode)
    setActiveTabCommon(t);
    setOverlayShellOpen(false);
    setOverlayUrl(null);
    setOverlayHistory([]);
    setOverlayIndex(-1);
    setOverlayChromeHidden(false);
  }, [makeNewTab, overlayIncognito, saveCurrentTabSearch, tabKey, defaultTabSearch, applySearchState, setActiveTabCommon]);

  const closeTabById = useCallback((id: string) => {
    if (overlayIncognito) {
      setTabsIncog(prev => {
        const idx = prev.findIndex(t => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter(t => t.id !== id);
        let newActive: OverlayTab | null = null;
        if (activeTabIdIncog === id) {
          if (next.length) {
            const pick = Math.max(0, idx - 1);
            setActiveTabIdIncog(next[pick].id);
            newActive = next[pick];
          } else {
            const nt = makeNewTab(null);
            setActiveTabIdIncog(nt.id);
            setTabsIncog([nt]);
            newActive = nt;
            return [nt];
          }
        }
        if (newActive) setActiveTabCommon(newActive);
        return next;
      });
    } else {
      setTabsNormal(prev => {
        const idx = prev.findIndex(t => t.id === id);
        if (idx === -1) return prev;
        const next = prev.filter(t => t.id !== id);
        let newActive: OverlayTab | null = null;
        if (activeTabIdNormal === id) {
          if (next.length) {
            const pick = Math.max(0, idx - 1);
            setActiveTabIdNormal(next[pick].id);
            newActive = next[pick];
          } else {
            const nt = makeNewTab(null);
            setActiveTabIdNormal(nt.id);
            setTabsNormal([nt]);
            newActive = nt;
            return [nt];
          }
        }
        if (newActive) setActiveTabCommon(newActive);
        return next;
      });
    }
  }, [overlayIncognito, activeTabIdIncog, activeTabIdNormal, makeNewTab, setActiveTabCommon]);

  const switchToTab = useCallback((id: string) => {
    if (overlayIncognito) {
      try { saveCurrentTabSearch(); } catch { }
      setActiveTabIdIncog(id);
      const t = tabsIncog.find(x => x.id === id) || null;
      setActiveTabCommon(t);
      // If the selected tab has content, show overlay; otherwise lobby
      setOverlayShellOpen(!!(t && t.url));
      setOverlayChromeHidden(false);
      try { const k = tabKey(true, id); applySearchState(tabSearchStore[k]); } catch { }
    } else {
      try { saveCurrentTabSearch(); } catch { }
      setActiveTabIdNormal(id);
      const t = tabsNormal.find(x => x.id === id) || null;
      setActiveTabCommon(t);
      setOverlayShellOpen(!!(t && t.url));
      setOverlayChromeHidden(false);
      try { const k = tabKey(false, id); applySearchState(tabSearchStore[k]); } catch { }
    }
  }, [overlayIncognito, tabsIncog, tabsNormal, setActiveTabCommon, saveCurrentTabSearch, tabKey, tabSearchStore, applySearchState]);
  // AI analysis state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiText, setAiText] = useState<string>('');
  const [aiSources, setAiSources] = useState<Source[]>([]);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiRendered, setAiRendered] = useState('');
   const [aiUsedImages, setAiUsedImages] = useState<string[]>([]);
  const [aiUsedVideos, setAiUsedVideos] = useState<string[]>([]);
  const [aiImageModalUrl, setAiImageModalUrl] = useState<string | null>(null);
  const [aiShareHint, setAiShareHint] = useState<string | null>(null);
  const aiAnimRef = useRef<number | null>(null);
  const aiQueueRef = useRef<string>('');
  // Hold images selected by user (camera/gallery) until they press Search
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [fromIncogResults, setFromIncogResults] = useState<boolean>(false);
  useEffect(() => { try { setIncogResultsActive(!!fromIncogResults); } catch { } }, [fromIncogResults]);
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
    try { (event.target as HTMLInputElement).value = ''; } catch { }
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
    setOverlayLoading(true);
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
    setOverlayShellOpen(true);
    try { window.scrollTo({ top: 0, behavior: 'auto' as any }); } catch { try { window.scrollTo(0, 0); } catch { } }
    // Update current tab model
    if (overlayIncognito) {
      setTabsIncog(prev => {
        const id = activeTabIdIncog;
        const existing = id ? prev.find(t => t.id === id) : undefined;
        if (!existing) {
          const nt = makeNewTab(url);
          setActiveTabIdIncog(nt.id);
          return [...prev, nt];
        }
        const base = existing.historyIndex >= 0 ? existing.history.slice(0, existing.historyIndex + 1) : existing.history.slice();
        const history = [...base, url];
        const updated = { ...existing, url, title: getHost(url).replace(/^www\./, ''), history, historyIndex: history.length - 1 };
        return prev.map(t => t.id === existing.id ? updated : t);
      });
    } else {
      setTabsNormal(prev => {
        const id = activeTabIdNormal;
        const existing = id ? prev.find(t => t.id === id) : undefined;
        if (!existing) {
          const nt = makeNewTab(url);
          setActiveTabIdNormal(nt.id);
          return [...prev, nt];
        }
        const base = existing.historyIndex >= 0 ? existing.history.slice(0, existing.historyIndex + 1) : existing.history.slice();
        const history = [...base, url];
        const updated = { ...existing, url, title: getHost(url).replace(/^www\./, ''), history, historyIndex: history.length - 1 };
        return prev.map(t => t.id === existing.id ? updated : t);
      });
    }
    setOverlayKey(k => k + 1);
    setOverlayChromeHidden(false);
    // Always start in Web View (proxy) for full-page experience
    setOverlayOpenMode('proxy');
    const openExternal = (_u: string) => { /* disabled by preference: no external redirects */ };
    const startTimer = () => {
      if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; }
      overlayFallbackTimerRef.current = window.setTimeout(() => {
        if (!overlayLoadedRef.current) {
          // Stay in overlay: switch/reload proxy silently
          setOverlayOpenMode('proxy');
          setOverlayKey(k => k + 1);
        }
      }, isMobile ? 1800 : 2500);
    };
    startTimer();
  };
  const closeOverlay = () => {
    // Preserve current tab's search snapshot
    try { saveCurrentTabSearch(); } catch { }
    // Clear overlay chrome state
    setOverlayUrl(null);
    setOverlayHistory([]);
    setOverlayIndex(-1);
    setOverlayShellOpen(false);
    setOverlayLoading(false);
    // Mark current tab as lobby (no active site) so returning shows results
    try {
      if (overlayIncognito) {
        setTabsIncog(prev => {
          const id = activeTabIdIncog;
          if (!id) return prev;
          return prev.map(t => t.id === id ? { ...t, url: null } : t);
        });
      } else {
        setTabsNormal(prev => {
          const id = activeTabIdNormal;
          if (!id) return prev;
          return prev.map(t => t.id === id ? { ...t, url: null } : t);
        });
      }
    } catch { }
    if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; }
    try { onOverlayClosed?.(); } catch { }
  };
  const navigateOverlay = (url: string) => {
    if (!url) return;
    setOverlayLoading(true);
    // Track overlay history also for incognito (UI-only, not persisted)
    setOverlayHistory(prev => {
      const base = overlayIndex >= 0 ? prev.slice(0, overlayIndex + 1) : [];
      const next = [...base, url];
      setOverlayIndex(next.length - 1);
      return next;
    });
    setOverlayUrl(url);
    setOverlayKey(x => x + 1);
    try { window.scrollTo({ top: 0, behavior: 'auto' as any }); } catch { try { window.scrollTo(0, 0); } catch { } }
    overlayLoadedRef.current = false;
    setOverlayNotice(null);
    // Always use Web View (proxy) for subsequent navigations as well
    setOverlayOpenMode('proxy');
    // Update tab model
    if (overlayIncognito) {
      setTabsIncog(prev => {
        const id = activeTabIdIncog;
        const existing = id ? prev.find(t => t.id === id) : undefined;
        if (!existing) return prev;
        const base = existing.historyIndex >= 0 ? existing.history.slice(0, existing.historyIndex + 1) : existing.history.slice();
        const history = [...base, url];
        const updated = { ...existing, url, title: getHost(url).replace(/^www\./, ''), history, historyIndex: history.length - 1 };
        return prev.map(t => t.id === existing.id ? updated : t);
      });
    } else {
      setTabsNormal(prev => {
        const id = activeTabIdNormal;
        const existing = id ? prev.find(t => t.id === id) : undefined;
        if (!existing) return prev;
        const base = existing.historyIndex >= 0 ? existing.history.slice(0, existing.historyIndex + 1) : existing.history.slice();
        const history = [...base, url];
        const updated = { ...existing, url, title: getHost(url).replace(/^www\./, ''), history, historyIndex: history.length - 1 };
        return prev.map(t => t.id === existing.id ? updated : t);
      });
    }
    // We already set proxy mode; keep timer harmless for edge cases
    const openExternal = (_u: string) => { /* disabled by preference: no external redirects */ };
    if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; }
    overlayFallbackTimerRef.current = window.setTimeout(() => {
      if (!overlayLoadedRef.current) {
        // Stay in overlay: switch/reload proxy silently
        setOverlayOpenMode('proxy');
        setOverlayKey(k => k + 1);
      }
    }, isMobile ? 1800 : 2500);
  };
  const goBack = () => {
    if (overlayIndex > 0) {
      const idx = overlayIndex - 1;
      setOverlayIndex(idx);
      const u = overlayHistory[idx];
      setOverlayLoading(true);
      setOverlayUrl(u);
      setOverlayKey(k => k + 1);
      // sync tab model
      if (overlayIncognito) {
        setTabsIncog(prev => {
          const id = activeTabIdIncog; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
          const updated = { ...t, url: u, historyIndex: idx };
          return prev.map(x => x.id === t.id ? updated : x);
        });
      } else {
        setTabsNormal(prev => {
          const id = activeTabIdNormal; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
          const updated = { ...t, url: u, historyIndex: idx };
          return prev.map(x => x.id === t.id ? updated : x);
        });
      }
    } else if (overlayIncognito && overlayIndex <= 0) {
      // From the first incognito page, Back returns to incognito lobby
      setOverlayIndex(-1);
      setOverlayUrl(null);
      setOverlayShellOpen(false);
      setOverlayLoading(false);
      setTabsIncog(prev => {
        const id = activeTabIdIncog; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
        const updated = { ...t, url: null, historyIndex: -1 } as any;
        return prev.map(x => x.id === (t as any).id ? updated : x);
      });
    }
  };
  const goForward = () => {
    if (overlayIndex >= 0 && overlayIndex < overlayHistory.length - 1) {
      const idx = overlayIndex + 1;
      setOverlayIndex(idx);
      const u = overlayHistory[idx];
      setOverlayLoading(true);
      setOverlayUrl(u);
      setOverlayKey(k => k + 1);
      if (overlayIncognito) {
        setTabsIncog(prev => {
          const id = activeTabIdIncog; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
          const updated = { ...t, url: u, historyIndex: idx };
          return prev.map(x => x.id === t.id ? updated : x);
        });
      } else {
        setTabsNormal(prev => {
          const id = activeTabIdNormal; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
          const updated = { ...t, url: u, historyIndex: idx };
          return prev.map(x => x.id === t.id ? updated : x);
        });
      }
    } else if (overlayIncognito && overlayIndex === -1 && overlayHistory.length > 0) {
      // From incognito lobby, Forward opens the first page in history (if any)
      const idx = 0; const u = overlayHistory[0];
      setOverlayIndex(idx);
      setOverlayLoading(true);
      setOverlayUrl(u);
      setOverlayKey(k => k + 1);
      setOverlayShellOpen(true);
      setTabsIncog(prev => {
        const id = activeTabIdIncog; const t = id ? prev.find(x => x.id === id) : undefined; if (!t) return prev;
        const hi = (t.history || []).indexOf(u);
        const newIdx = hi >= 0 ? hi : (t.history && t.history.length ? 0 : -1);
        const updated = { ...t, url: u, historyIndex: newIdx } as any;
        return prev.map(x => x.id === (t as any).id ? updated : x);
      });
    }
  };
  const reloadOverlay = () => { overlayLoadedRef.current = false; setOverlayLoading(true); setOverlayKey(k => k + 1); };

  // If parent asks to open a URL, open overlay immediately
  useEffect(() => {
    if (openOverlayUrl) {
      try { openOverlay(openOverlayUrl); } catch { }
      try { onOpenedOverlay?.(); } catch { }
    }
  }, [openOverlayUrl]);
  // When overlay is open, lock background scroll
  useEffect(() => {
    const wantLock = !!(overlayShellOpen || overlayUrl);
    try {
      if (wantLock) {
        if (bodyOverflowPrevRef.current == null) bodyOverflowPrevRef.current = document.body.style.overflow || '';
        document.body.style.overflow = 'hidden';
      } else {
        if (bodyOverflowPrevRef.current != null) {
          document.body.style.overflow = bodyOverflowPrevRef.current;
          bodyOverflowPrevRef.current = null;
        }
      }
    } catch { }
    return () => {
      try {
        if (bodyOverflowPrevRef.current != null) {
          document.body.style.overflow = bodyOverflowPrevRef.current;
          bodyOverflowPrevRef.current = null;
        }
      } catch { }
    };
  }, [overlayShellOpen, overlayUrl]);

  // Close page (hamburger) menu whenever overlay opens
  useEffect(() => {
    if (overlayShellOpen || overlayUrl) {
      try { setPageMenuOpen(false); } catch { }
    }
  }, [overlayShellOpen, overlayUrl]);
  // Open Incognito mode when requested by parent (do NOT auto-open WebView)
  useEffect(() => {
    if (openIncognito) {
      setOverlayIncognito(true);
      setOverlayUrl(null);
      setOverlayHistory([]);
      setOverlayIndex(-1);
      setOverlaySearch('');
      setOverlayChromeHidden(false);
      setOverlayShellOpen(false);
      setTabsIncog(prev => {
        if (prev.length > 0) return prev;
        const nt = makeNewTab(null);
        setActiveTabIdIncog(nt.id);
        try { const k = tabKey(true, nt.id); setTabSearchStore(prev => ({ ...prev, [k]: defaultTabSearch() })); } catch { }
        return [nt];
      });
      try { onOpenedIncognito?.(); } catch { }
    }
  }, [openIncognito]);
  // ESC toggle fullscreen (overlay chrome hidden)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!overlayUrl) return;
      if (e.key === 'Escape' && e.ctrlKey) { e.preventDefault(); setOverlayChromeHidden(v => !v); }
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
    } catch { }
  }, []);

  const dispatchNav = (view: string) => {
    try { window.dispatchEvent(new CustomEvent('nov-era-nav' as any, { detail: view })); } catch { }
  };
  const dispatchClearAll = () => {
    try { window.dispatchEvent(new Event('nov-era-clear-all' as any)); } catch { }
  };
  const dispatchClearRecent = (minutes: number) => {
    try { window.dispatchEvent(new CustomEvent('nov-era-clear-recent' as any, { detail: minutes })); } catch { }
  };
  // Clear ALL search history (for Browser search bar history)
  const clearSearchHistoryAll = () => {
    try {
      localStorage.removeItem('novEra.search.history');
      localStorage.removeItem('novEra.search.lastQuery');
      localStorage.removeItem('novEra.search.lastPage');
      window.dispatchEvent(new Event('nov-era-search-history-cleared' as any));
    } catch { }
  };
  // Overlay theme for incognito/browser overlay background
  const [overlayTheme, setOverlayTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try { return (localStorage.getItem('nov-era-overlay-theme') as any) || 'system'; } catch { return 'system'; }
  });
  useEffect(() => { try { localStorage.setItem('nov-era-overlay-theme', overlayTheme); } catch { } }, [overlayTheme]);
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
    // Update current header tab title with query
    try {
      if (overlayIncognito) {
        setTabsIncog(prev => {
          const id = activeTabIdIncog;
          return prev.map(t => t.id === id ? { ...t, title: qStr } : t);
        });
      } else {
        setTabsNormal(prev => {
          const id = activeTabIdNormal;
          return prev.map(t => t.id === id ? { ...t, title: qStr } : t);
        });
      }
    } catch { }
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
    setAiUsedVideos([]);
    try {
      const useCSE = !!(GOOGLE_API_KEY && CX);
      const loc = detectLocaleForSearch();
      // CSE build for up to 15 items (max 10 per request)
      const cseStart1 = (pageIndex - 1) * RESULTS_PER_PAGE + 1;
      const cseFirstNum = Math.min(10, RESULTS_PER_PAGE);
      const cseRemain = Math.max(0, RESULTS_PER_PAGE - cseFirstNum);
      const cseStart2 = cseStart1 + cseFirstNum;
      const cseSecondNum = Math.min(10, cseRemain);
      const safeParam = safeSearchMode === 'filter' ? 'active' : 'off';
      const webUrl1 = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&start=${cseStart1}&num=${cseFirstNum}&safe=${safeParam}` : '';
      const webUrl2 = useCSE && cseSecondNum > 0 ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&start=${cseStart2}&num=${cseSecondNum}&safe=${safeParam}` : '';
      const imageUrl = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&searchType=image&num=8&safe=${safeParam}` : '';

      const safeSearch = safeSearchMode === 'filter';
      const [cse1Resp, cse2Resp, imgResp, visuals, nData, sData, serperData] = await Promise.all([
        useCSE ? fetch(webUrl1) : Promise.resolve(null as any),
        useCSE && webUrl2 ? fetch(webUrl2).catch(() => null) : Promise.resolve(null),
        useCSE ? fetch(imageUrl).catch(() => null) : Promise.resolve(null),
        searchImagesAndVideos(qStr, 100, 30, { safeSearch }).catch(() => ({ images: [], videos: [] })),
        searchNews(qStr, 50, { safeSearch }).catch(() => [] as NewsArticle[]),
        searchShopping(qStr, 24, { safeSearch }).catch(() => [] as ShoppingProduct[]),
        searchWeb(qStr, RESULTS_PER_PAGE, { ...loc, page: pageIndex, safeSearch }).catch(() => null),
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
      } catch { }
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

      let finalImages: ImageResult[] = [];
      if (imgResp && imgResp.ok) {
        const imgData: ImageSearchResponse = await imgResp.json();
        if (imgData.items) {
          finalImages = imgData.items;
        }
      }

      if (visuals) {
        setVideoUrls(visuals.videos || []);
        // Merge images if CSE returned none or we want more
        if (visuals.images && visuals.images.length > 0) {
          const serperImgs = visuals.images.map((link) => ({
            link,
            image: { thumbnailLink: link, contextLink: link },
            title: ''
          })) as any;
          
          if (finalImages.length === 0) {
            finalImages = serperImgs;
          } else {
            // Append unique ones
            const existingLinks = new Set(finalImages.map(img => img.link));
            for (const sImg of serperImgs) {
              if (!existingLinks.has(sImg.link)) {
                finalImages.push(sImg);
              }
            }
          }
        }
      }
      setImageResults(finalImages.slice(0, 50));
      if (nData) setNewsItems(nData);
      if (sData) setProducts(sData);
    } catch (e) {
      console.error(e);
      setError('Şəbəkə xətası. İnternet Bağlantısını yoxlayın.');
      setHasNextPage(false);
    } finally {
      setLoading(false);
    }
  }, [query, overlayIncognito, activeTabIdIncog, activeTabIdNormal, safeSearchMode]);

  // Auto-persist current tab's search state on changes
  useEffect(() => {
    try { saveCurrentTabSearch(); } catch { }
  }, [query, page, results, imageResults, videoUrls, newsItems, products, resultsHistory, resultsIndex, forwardFromLobby, activeTab, hasNextPage, error, fromIncogResults, previewUrl, overlayIncognito, activeTabIdIncog, activeTabIdNormal]);

  // Trigger immediate re-search if safeSearchMode changes to/from 'filter'
  useEffect(() => {
    if (results.length > 0 && !loading) {
      doSearch(page);
    }
  }, [safeSearchMode]);

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
      setAiUsedVideos([]);
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

      // Stream AI with grounding and context (Google AI Mode style)
      const contextUrl = overlayUrl || '';
      const analysisPref = [
        'Sizin adınız NovEra-dır. Siz NovEra şirkəti tərəfindən yaradılmış qabaqcıl süni intellekt köməkçisisiniz.',
        'Siz hazırda NovEra Brauzerində "Ağıllı Analiz" rejimindəsiniz.',
        contextUrl ? `İstifadəçi hazırda bu səhifəyə baxır: ${contextUrl}. Analiz zamanı bu səhifənin kontekstini nəzərə al.` : '',
        'Məlumat toplamaq və sualları cavablandırmaq üçün Google Search grounding (veb axtarış) istifadə edin.',
        'Saytlara daxil olun, ən son məlumatları tapın.',
        'VACİB: Cavab mətnində [1], [2] kimi mənbə qeydlərindən istifadə etmə. Mənbələr onsuz da sistem tərəfindən ayrıca göstərilir.',
        'Əgər istifadəçi şəkil və ya video istəsə, vebdən onları tapın və mətndə [image: URL] və ya [video: URL] formatında göstərin.',
        'Cavabı həmişə Azərbaycan dilində verin.',
      ].filter(Boolean).join(' ');

      // Compress images before sending to reduce 413/network errors
      const preparedImages = images && images.length ? await compressAll(images, 1280, 0.82) : [];
      setAiUsedImages(preparedImages || []);
      const srcSet = new Map<string, Source>();
      
      // analysisOnly set to false and forceGrounding set to true to allow grounding/tools
      for await (const chunk of streamChatQuery(`${t || 'Bu şəkli və ya səhifəni analiz et.'}`, [], preparedImages || [], undefined, true, false, analysisPref)) {
        if (chunk.text) {
          aiQueueRef.current += chunk.text;
          startWriter();
        }
        if (chunk.sources) {
          for (const s of chunk.sources) { if (s.uri && !srcSet.has(s.uri)) srcSet.set(s.uri, s); }
          setAiSources(Array.from(srcSet.values()).slice(0, 8));
        }
        if (chunk.images) {
          setAiUsedImages(prev => Array.from(new Set([...prev, ...chunk.images!])));
        }
        if (chunk.videos) {
          setAiUsedVideos(prev => Array.from(new Set([...prev, ...chunk.videos!])));
        }
        if (chunk.toolCalls) {
          const webSearchCalls = chunk.toolCalls.filter((tc: any) => tc.functionCall?.name === 'webSearch');
          if (webSearchCalls.length > 0) {
            for (const call of webSearchCalls) {
              const { query: qry, maxImages } = call.functionCall.args;
              if (qry) {
                // Background fetch for images if the AI requested them
                searchImagesAndVideos(qry, maxImages || 6, 0).then(res => {
                  if (res.images && res.images.length) {
                    setAiUsedImages(prev => Array.from(new Set([...prev, ...res.images])));
                  }
                }).catch(() => {});
              }
            }
          }
        }
      }
      // After stream completes, commit final text
      setAiText(prev => prev || (aiRendered + aiQueueRef.current));
    } catch (e) {
      // Retry once with stronger compression and broader prompt
      try {
        const t2 = (text || '').trim();
        const preparedImages2 = images && images.length ? await Promise.all(images.map((d) => compressDataUrl(d, 1024, 0.7))) : [];
        setAiUsedImages(preparedImages2 || []);
        const srcSet2 = new Map<string, Source>();
        const retryPref = 'Siz NovEra AI-sınız. Veb axtarışdan istifadə edərək sualı cavablandırın.';
        for await (const chunk of streamChatQuery(`${t2 || 'Analiz et.'}`, [], preparedImages2 || [], undefined, false, false, retryPref)) {
          if (chunk.text) { aiQueueRef.current += chunk.text; }
          if (chunk.sources) {
            for (const s of chunk.sources) { if (s.uri && !srcSet2.has(s.uri)) srcSet2.set(s.uri, s); }
            setAiSources(Array.from(srcSet2.values()).slice(0, 8));
          }
        }
        setAiText(prev => prev || (aiRendered + aiQueueRef.current));
      } catch {
        setAiText('AI analizi hazırda mümkün deyil. Zəhmət olmasa internet bağlantınızı və ya sorğunuzu yoxlayın.');
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
  const stopListening = () => { try { recognitionRef.current?.stop(); } catch { } setIsListening(false); };
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
    try { window.dispatchEvent(new Event('nov-era-open-incognito' as any)); } catch { }
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

  // Keep overlay chrome visible on desktop; do not auto-hide when a page opens
  useEffect(() => {
    if (!isMobile) {
      setOverlayChromeHidden(false);
    }
  }, [overlayUrl, overlayIncognito, isMobile]);

  const headerHeight = isMobile ? 120 : 110; // px
  const showGlobalHeader = !overlayShellOpen && hasAnyResults; 
  const isBusy = !!(loading || overlayLoading);
  const mobileTabCount = overlayIncognito ? tabsIncog.length : tabsNormal.length;
  const [mobileTabSearch, setMobileTabSearch] = useState('');
  const [mobileTabOverflowOpen, setMobileTabOverflowOpen] = useState(false);

  return (
    <div className={`relative ${(overlayShellOpen || overlayUrl || overlayIncognito) ? 'p-0' : 'p-4 md:p-6'} min-h-full text-text-main bg-bg-main/80 ${(overlayShellOpen || overlayUrl) ? '' : 'backdrop-blur-sm'}`} style={{ paddingTop: showGlobalHeader ? (headerHeight + 8) : undefined }}>
      {isMobile && !(overlayShellOpen || overlayUrl) && !showGlobalHeader && (
        <>
          <div className="fixed top-2 left-2 z-[20000] pointer-events-auto">
            <button
              onClick={(e) => { e.stopPropagation(); setPageMenuOpen(v => !v); }}
              aria-label="Menyu"
              className="w-10 h-10 rounded-xl border border-white/20 bg-black/60 text-white/90 flex items-center justify-center backdrop-blur-xl shadow-lg active:scale-90 transition-transform pointer-events-auto"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="fixed top-2 right-2 z-[20000] pointer-events-auto">
            <button
              onClick={() => setShowTabSwitcher(true)}
              aria-label="Tablar"
              className="w-9 h-9 rounded-xl border border-white/25 bg-black/50 text-white/90 flex items-center justify-center font-semibold shadow-md backdrop-blur-md"
            >
              {Math.max(1, mobileTabCount || 0)}
            </button>
          </div>
        </>
      )}
      {isMobile && pageMenuOpen && (
        <div className="fixed inset-0 z-[22000] flex items-start justify-start p-4 pointer-events-none animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto" onClick={() => setPageMenuOpen(false)} />
          <div className={`relative w-[280px] rounded-[28px] border border-white/10 bg-[#0f0f13]/95 backdrop-blur-2xl shadow-2xl pointer-events-auto overflow-hidden animate-in slide-in-from-left-4 duration-300 ${showGlobalHeader ? 'mt-14' : 'mt-12'}`}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <Logo isLarge={false} className="w-5 h-5" />
                <span className="font-bold text-sm text-white/90">NovEra Menyu</span>
              </div>
              <button onClick={() => setPageMenuOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/5 text-white/60">
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto no-scrollbar">
              <button onClick={() => { try { window.dispatchEvent(new Event('nov-era-clear-all' as any)); } catch { } setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-bold text-accent bg-accent/10 hover:bg-accent/20 transition-all">
                <PlusIcon className="w-5 h-5" />
                <span>Yeni Söhbət</span>
              </button>

              <div className="my-2 h-px bg-white/5 mx-2" />

              <button onClick={() => { dispatchNav('search'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">✨</span>
                <span>AI Axtarış</span>
              </button>

              <button onClick={() => { dispatchNav('news'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">📰</span>
                <span>Xəbər / Analiz</span>
              </button>

              <button onClick={() => { dispatchNav('translate'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">🔤</span>
                <span>Tərcümə</span>
              </button>

              <button onClick={() => { try { window.dispatchEvent(new Event('nov-era-open-incognito' as any)); } catch { } setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">🕶️</span>
                <span>Anonim Rejim</span>
              </button>

              <div className="my-2 h-px bg-white/5 mx-2" />

              <button onClick={() => { dispatchNav('profile'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">👤</span>
                <span>Profil</span>
              </button>

              <button onClick={() => { dispatchNav('settings'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">⚙️</span>
                <span>Ayarlar</span>
              </button>

              <button onClick={() => { dispatchNav('safe-search'); setPageMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-all">
                <span className="text-xl">🛡️</span>
                <span>SafeSearch</span>
              </button>
            </div>

            <div className="p-4 border-t border-white/5 bg-white/[0.01]">
              <div className="flex items-center justify-between text-[10px] text-white/30 font-bold uppercase tracking-widest">
                <span>Versiya 2.5.0</span>
                <span>© 2026 NovEra</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global top-left hamburger (desktop header only) */}
      {!isMobile && !(overlayShellOpen || overlayUrl) && (
        <div className="fixed left-2 top-2 z-[20000]">
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
                <button onClick={() => { try { window.dispatchEvent(new Event('nov-era-open-incognito' as any)); } catch { } setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
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
                  <span className="px-2 py-0.5 rounded-full bg-white/10 border border-white/20 text-white/70">{overlayIncognito ? 'Saxlanmır' : 'Saxlanılır'}</span>
                </div>
                {!overlayIncognito && (
                  <button onClick={() => { clearSearchHistoryAll(); setPageMenuOpen(false); }} className="w-full text-left px-4 py-3 text-sm text-white/90 hover:bg-white/15 flex items-center gap-2">
                    <span>🗑️</span>
                    <span>Axtarışın hamısını sil</span>
                  </button>
                )}
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
                  {([{ id: 'light', label: 'Ağ rejim' }, { id: 'dark', label: 'Tünd rejim' }, { id: 'system', label: 'Sistem' }] as const).map(opt => (
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
      )}
      {/* Desktop persistent header (omnibox + tabs), floating unified island */}
      {showGlobalHeader && (
        <div className="fixed left-0 right-0 top-2 md:top-4 z-[10000] pointer-events-none">
          <div className="max-w-5xl mx-auto px-2 md:px-4 pointer-events-auto">
            <div className="flex flex-col rounded-[20px] md:rounded-[24px] bg-[#0f0f13]/90 backdrop-blur-3xl border border-white/10 shadow-2xl ring-1 ring-white/5 overflow-hidden transition-all duration-300">
              {/* Branding & Tabs Row */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2 pr-2 border-r border-white/10 shrink-0">
                  {isMobile && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); setPageMenuOpen(v => !v); }}
                      className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 text-white shadow-md active:scale-90 transition-transform border border-white/10 pointer-events-auto"
                      aria-label="Menyu"
                    >
                      <MenuIcon className="w-5 h-5" />
                    </button>
                  )}
                  <Logo isLarge={false} className="w-5 h-5" />
                  {!isMobile && <span className="font-bold text-sm bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">NovEra</span>}
                </div>
                <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {(() => {
                  const list = overlayIncognito ? tabsIncog : tabsNormal;
                  const activeId = overlayIncognito ? activeTabIdIncog : activeTabIdNormal;
                  return list.map(t => {
                    const active = t.id === activeId;
                    const fav = t.url ? `https://www.google.com/s2/favicons?domain=${getHost(t.url)}&sz=32` : '';
                    return (
                      <div key={t.id} className={`group flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-200 cursor-default ${active ? 'bg-white/15 text-white shadow-inner border border-white/10' : 'bg-transparent text-white/60 hover:bg-white/5 hover:text-white border border-transparent'}`}>
                        <button onClick={() => switchToTab(t.id)} className="flex items-center gap-2 min-w-0 flex-1">
                          {t.url ? (
                            <img src={fav} className="w-4 h-4 rounded-full" />
                          ) : (
                            <div className={`relative w-4 h-4 rounded-full flex items-center justify-center ${active ? 'bg-white/20' : 'bg-white/10'}`}>
                              {active && isBusy && (<div className="absolute inset-0 rounded-full border border-white/30 border-t-white animate-spin"></div>)}
                              {overlayIncognito ? (
                                <span className="text-[9px] leading-4 font-bold text-white/90">🕶️</span>
                              ) : (
                                <span className="text-[10px] leading-4 font-bold text-blue-300">N</span>
                              )}
                            </div>
                          )}
                          <span className="text-xs font-medium truncate max-w-[14ch]">{t.title || 'Yeni Tab'}</span>
                        </button>
                        <button onClick={() => closeTabById(t.id)} className={`w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${active ? 'hover:bg-white/20' : 'hover:bg-white/20'}`} title="Bağla">
                          <CloseIcon className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    );
                  });
                })()}
                <button onClick={openNewTabLocal} className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/15 transition-colors border border-white/10 text-white/80" title="Yeni tab">
                  <PlusIcon className="w-3.5 h-3.5" />
                </button>
              </div>

              </div>

              {/* Omnibox / Search Row */}
              <div className="flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-2.5 relative">
                <div className="flex items-center gap-1">
                  {(() => {
                    const backDisabled = overlayUrl ? (overlayIndex <= 0) : (!results.length);
                    const forwardDisabled = overlayUrl ? (overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) : (!results.length ? !forwardFromLobby : (resultsIndex < 0 || resultsIndex >= resultsHistory.length - 1));
                    return (
                      <>
                        <button onClick={handleGlobalBack} disabled={backDisabled} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${backDisabled ? 'text-white/20 cursor-not-allowed' : 'text-white/70 hover:text-white hover:bg-white/10'}`} title="Geri">
                          <ArrowLeftIcon className="w-4 h-4" />
                        </button>
                        <button onClick={handleGlobalForward} disabled={forwardDisabled} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${forwardDisabled ? 'text-white/20 cursor-not-allowed' : 'text-white/70 hover:text-white hover:bg-white/10'}`} title="İrəli">
                          <ArrowRightIcon className="w-4 h-4" />
                        </button>
                        <button disabled={!overlayUrl} onClick={reloadOverlay} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${!overlayUrl ? 'text-white/20 cursor-not-allowed' : 'text-white/70 hover:text-white hover:bg-white/10'}`} title="Yenilə">
                          <RefreshIcon className="w-4 h-4" />
                        </button>
                      </>
                    );
                  })()}
                </div>

                <div className="flex-1 min-w-0 relative flex items-center">
                  <div className="flex-1 flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-white/10 ring-1 ring-black/20 shadow-inner focus-within:ring-accent/50 focus-within:border-accent/40 transition-all">
                    {overlayIncognito ? (
                      <span className="text-white/50 text-sm">🕶️</span>
                    ) : (
                      <SearchIcon className="w-4 h-4 text-white/50" />
                    )}
                    <input
                      type="text"
                      value={hbQuery}
                      onChange={(e) => setHbQuery(e.target.value)}
                      onFocus={() => setHbFocused(true)}
                      onBlur={() => { window.setTimeout(() => setHbFocused(false), 120); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          if (hbActiveIndex >= 0 && hbSuggestions[hbActiveIndex]) { submitHeader(hbSuggestions[hbActiveIndex]); }
                          else { submitHeader(); }
                          e.preventDefault();
                          return;
                        }
                        if (e.key === 'ArrowDown' && hbSuggestions.length > 0) { e.preventDefault(); setHbActiveIndex((i) => (i + 1) % hbSuggestions.length); }
                        else if (e.key === 'ArrowUp' && hbSuggestions.length > 0) { e.preventDefault(); setHbActiveIndex((i) => (i <= 0 ? hbSuggestions.length - 1 : i - 1)); }
                        else if (e.key === 'Escape') { setHbSuggestions([]); setHbActiveIndex(-1); }
                      }}
                      placeholder={overlayIncognito ? "Anonim axtarış..." : "Axtarış və ya URL daxil edin..."}
                      className="flex-1 min-w-0 bg-transparent outline-none text-[15px] font-medium text-white/90 placeholder-white/40"
                    />
                    {hbQuery.trim().length > 0 && (
                      <button onClick={() => { setHbQuery(''); setHbSuggestions([]); setHbActiveIndex(-1); }} className="w-5 h-5 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white/70" title="Təmizlə">
                        <CloseIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  
                  {(hbFocused && hbSuggestions.length > 0) && (
                    <div className="absolute top-[calc(100%+0.75rem)] left-0 right-0 bg-[#16161a]/95 backdrop-blur-3xl rounded-2xl border border-white/10 shadow-2xl z-40 overflow-hidden">
                      <div className="p-2 flex flex-col gap-0.5">
                        {hbSuggestions.map((sug, idx) => {
                          const isActive = idx === hbActiveIndex;
                          const isHistory = hbQuery.trim().length < 2 && hbHistory.some(h => h === sug);
                          return (
                            <div key={sug} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${isActive ? 'bg-accent/20' : 'hover:bg-white/5'}`}>
                              <SearchIcon className="w-4 h-4 text-white/40" />
                              <button
                                onMouseDown={(e) => { e.preventDefault(); }}
                                onClick={() => submitHeader(sug)}
                                className={`flex-1 text-left text-sm font-medium truncate ${isActive ? 'text-white' : 'text-white/80'}`}
                                title={sug}
                              >
                                {sug}
                              </button>
                              {isHistory && (
                                <button
                                  onMouseDown={(e) => { e.preventDefault(); }}
                                  onClick={(e) => { e.stopPropagation(); setHbHistory(prev => { const next = prev.filter(p => p.toLowerCase() !== sug.toLowerCase()); try { localStorage.setItem('novEra.search.history', JSON.stringify(next)); } catch { } return next; }); setHbSuggestions(prev => prev.filter(p => p !== sug)); setHbActiveIndex(-1); }}
                                  className="ml-auto w-6 h-6 flex items-center justify-center rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                  title="Tarixçədən sil"
                                >
                                  <CloseIcon className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* SafeSearch Dropdown */}
                <div className="relative">
                  <button onClick={() => setSafeSearchDropdownOpen(!safeSearchDropdownOpen)} className={`flex items-center justify-center w-10 h-10 rounded-full transition-all border ${safeSearchMode !== 'off' ? 'bg-accent/20 border-accent/40 text-accent' : 'bg-transparent border-transparent text-white/50 hover:bg-white/5 hover:text-white/80'}`} title="SafeSearch">
                    <span className="text-lg leading-none">🛡️</span>
                  </button>
                  {safeSearchDropdownOpen && (
                    <div className="absolute top-[calc(100%+0.5rem)] right-0 w-48 bg-[#16161a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl z-[100] p-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                      {(['filter', 'blur', 'off'] as const).map(m => (
                        <button key={m} onClick={() => { try { window.dispatchEvent(new CustomEvent('nov-era-safe-search-changed', { detail: m })); } catch { } setSafeSearchDropdownOpen(false); }} className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center justify-between ${safeSearchMode === m ? 'bg-accent/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
                          <span>{m === 'filter' ? 'Tam Filtr' : m === 'blur' ? 'Bulanıqlıq' : 'Deaktiv'}</span>
                          {safeSearchMode === m && <span className="text-accent text-lg leading-none">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Local thin scrollbar style */}
            <style>
              {`.no-scrollbar::-webkit-scrollbar{display:none}`}
            </style>
          </div>
        </div>
      )}
      {isMobile && showTabSwitcher && (
        <div className="fixed inset-0 z-[21000] bg-bg-jet text-white flex flex-col animate-in fade-in slide-in-from-bottom duration-300">
          {/* Header */}
          <div className="px-6 pt-[env(safe-area-inset-top)] pb-4 flex items-center justify-between border-b border-white/5 bg-white/2 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${overlayIncognito ? 'bg-white/10 text-white/90' : 'bg-accent/20 text-accent'}`}>
                {overlayIncognito ? '🕶️' : 'N'}
              </div>
              <div>
                <h2 className="text-lg font-bold leading-tight">{overlayIncognito ? 'Anonim Tablar' : 'Tablar'}</h2>
                <p className="text-[11px] text-white/50 uppercase tracking-widest font-bold">{mobileTabCount} AKTİV</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { openNewTabLocal(); setShowTabSwitcher(false); }}
                className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center shadow-lg shadow-accent/20 active:scale-90 transition-transform"
              >
                <PlusIcon className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setShowTabSwitcher(false)}
                className="w-10 h-10 rounded-full bg-white/5 text-white/70 flex items-center justify-center border border-white/10"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Search & Mode Toggle */}
          <div className="px-4 py-4 flex flex-col gap-4">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input 
                value={mobileTabSearch} 
                onChange={(e) => setMobileTabSearch(e.target.value)} 
                placeholder="Tabları axtarın..." 
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>
            
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
              <button 
                onClick={() => setOverlayIncognito(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${!overlayIncognito ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >
                STANDART
              </button>
              <button 
                onClick={() => setOverlayIncognito(true)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${overlayIncognito ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60'}`}
              >
                ANONİM
              </button>
            </div>
          </div>

          {/* Tab Grid */}
          <div className="flex-1 overflow-y-auto px-4 pb-12 scroll-touch">
            {(() => {
              const list = overlayIncognito ? tabsIncog : tabsNormal;
              const q = mobileTabSearch.trim().toLowerCase();
              const filtered = q ? list.filter(t => (t.title || '').toLowerCase().includes(q) || (t.url || '').toLowerCase().includes(q)) : list;
              
              if (!filtered.length) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-40">
                    <div className="text-4xl mb-4">{overlayIncognito ? '🕶️' : '📑'}</div>
                    <p className="text-sm">Heç bir tab tapılmadı</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-2 gap-4">
                  {filtered.map(t => {
                    const active = (overlayIncognito ? activeTabIdIncog : activeTabIdNormal) === t.id;
                    const host = t.url ? getHost(t.url) : '';
                    const favicon = t.url ? `https://www.google.com/s2/favicons?domain=${host}&sz=64` : null;
                    
                    return (
                      <div 
                        key={t.id} 
                        className={`group relative flex flex-col rounded-2xl border overflow-hidden transition-all duration-300 active:scale-95 ${active ? 'border-accent ring-2 ring-accent/20 bg-accent/5' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                        onClick={() => { switchToTab(t.id); setShowTabSwitcher(false); }}
                      >
                        {/* Preview Area */}
                        <div className="aspect-[4/5] bg-black/40 flex flex-col items-center justify-center p-4 relative">
                          {favicon ? (
                            <img src={favicon} alt="" className="w-12 h-12 rounded-xl mb-3 shadow-lg" />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl mb-3">
                              {overlayIncognito ? '🕶️' : 'N'}
                            </div>
                          )}
                          <div className="text-center px-2">
                            <div className="text-xs font-bold text-white/90 line-clamp-1">{t.title || 'Yeni Tab'}</div>
                            <div className="text-[10px] text-white/40 truncate mt-0.5">{host || 'Lobby'}</div>
                          </div>
                          
                          {/* Close Button */}
                          <button 
                            onClick={(e) => { e.stopPropagation(); closeTabById(t.id); }}
                            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white border border-white/20 flex items-center justify-center active:scale-75 transition-transform"
                          >
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          
          {/* Bottom Bar */}
          <div className="px-6 py-4 border-t border-white/5 bg-white/2 backdrop-blur-xl flex items-center justify-between">
            <button 
              onClick={() => { clearAll(); setShowTabSwitcher(false); }}
              className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors"
            >
              HAMISINI BAĞLA
            </button>
            <button 
              onClick={() => setShowTabSwitcher(false)}
              className="px-6 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm font-bold border border-white/10 transition-colors"
            >
              HAZIRDIR
            </button>
          </div>
        </div>
      )}

      {/* Hero center before first search */}
      {!hasAnyResults && !loading ? (
        <div className="relative h-full flex flex-col items-center justify-center text-center px-4">
          {overlayIncognito ? (
            <div className="w-20 h-20 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-3xl text-white/90">🕶️</div>
          ) : (
            <Logo isLarge={true} />
          )}
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
              onVoiceClick={() => { }}
              placeholder={overlayIncognito ? "Anonim rejimdə axtarın..." : "Vebdə axtarın..."}
              enableEmptySubmit={pendingImages.length > 0}
              onImageSelected={(imgs) => setPendingImages(prev => [...prev, ...imgs])}
            />
            {overlayIncognito && (
              <p className="mt-3 text-center text-[13px] text-white/60">
                NovEra Brauzer bu rejimdə axtarışlarınızı saxlamır.
              </p>
            )}
            {pendingImages.length > 0 && (
              <div className="mt-3 flex items-center gap-2 justify-center">
                {pendingImages.slice(0, 3).map((src, i) => (
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
            {!overlayIncognito && (<p className="mt-6 text-xl font-semibold text-text-main">Bu gün sizə NovEra Brauzer necə kömək edə bilər?</p>)}
          </div>
        </div>
      ) : (
        <div>
          {/* Sticky mini nav on results (mobile only): only logo + back/forward - hidden when global header is shown */}
          {isMobile && !showGlobalHeader && (
            <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur border-b border-white/10 -mx-4 md:-mx-6 px-4 md:px-6 py-2">
              <div className="w-full max-w-5xl mx-auto flex items-center gap-2">
                {/* Small clickable logo: Incognito results -> go incognito home; otherwise -> go lobby */}
                <button
                  onClick={() => {
                    if (fromIncogResults) openIncognitoHome(); else clearAll();
                  }}
                  className={`flex items-center gap-2 p-1 rounded-lg hover:bg-white/10`}
                  title={fromIncogResults ? 'Anonim Tab' : 'Əsas səhifə'}
                >
                  {overlayIncognito ? (
                    <div className="w-6 h-6 rounded-full bg-white/10 border border-white/15 flex items-center justify-center">🕶️</div>
                  ) : (
                    <Logo isLarge={false} />
                  )}
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
              </div>
            </div>
          )}
          {/* Re-search bar (mobile only): placed under nav and above categories - hidden when global header is shown */}
          {isMobile && !showGlobalHeader && (
            <div className="-mx-4 md:-mx-6 px-4 md:px-6 py-2">
              <div className="w-full max-w-5xl mx-auto">
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
                  onVoiceClick={() => { }}
                  placeholder={(fromIncogResults || overlayIncognito) ? 'Anonim rejimdə axtarın...' : 'Vebdə axtarın...'}
                  enableEmptySubmit={pendingImages.length > 0}
                  onImageSelected={(imgs) => setPendingImages(prev => [...prev, ...imgs])}
                />
                {pendingImages.length > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    {pendingImages.slice(0, 2).map((src, i) => (
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
          )}
          <div className="grid gap-4 grid-cols-1">
            {/* Results list */}
            <div className="pr-2 pb-24">
              {/* Categories Bar */}
              <div className="flex gap-2 mb-6 sticky top-[env(safe-area-inset-top)] bg-bg-jet/80 backdrop-blur-2xl z-20 p-2 rounded-2xl border border-white/5 shadow-2xl overflow-x-auto no-scrollbar scroll-touch whitespace-nowrap mx-auto w-full max-w-2xl">
                {(
                  [
                    { id: 'web', label: `Veb`, icon: '🌐' },
                    { id: 'images', label: `Şəkillər`, icon: '🖼️' },
                    { id: 'videos', label: `Videolar`, icon: '🎥' },
                    { id: 'news', label: `Xəbərlər`, icon: '📰' },
                    { id: 'shopping', label: `Alış-veriş`, icon: '🛍️' },
                  ] as const
                ).map(t => (
                  <button key={t.id}
                    onClick={() => setActiveTab(t.id as any)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${activeTab === t.id ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'
                      }`}>
                    <span>{t.icon}</span>
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* AI Analysis Panel */}
              <div className="mb-8 p-5 rounded-[28px] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-3xl border border-white/10 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-accent flex items-center justify-center text-white shadow-lg shadow-accent/20">
                      <span className="text-xl">✨</span>
                    </div>
                    <div>
                      <h3 className="text-[15px] font-bold text-white leading-tight">Smart Analiz</h3>
                      <p className="text-[10px] text-accent font-bold uppercase tracking-widest">PRO AKTİV</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAiAnalyze}
                      disabled={aiLoading || !query.trim()}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${aiLoading || !query.trim() ? 'bg-white/5 text-white/20' : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'}`}
                    >
                      {aiLoading ? '...' : 'ANALİZ'}
                    </button>
                    <button
                      onClick={() => setAiExpanded(v => !v)}
                      className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${aiExpanded ? 'bg-accent border-accent text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      {aiExpanded ? '−' : '+'}
                    </button>
                  </div>
                </div>
                <div className={`grid transition-all duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${aiExpanded ? 'grid-rows-[1fr] mt-4 opacity-100' : 'grid-rows-[0fr] opacity-0'} overflow-hidden`}>
                  <div className="min-h-0 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex-1 min-w-0 relative flex items-center bg-black/40 border border-white/10 rounded-xl focus-within:ring-1 focus-within:ring-accent/50 focus-within:border-accent/40 transition-all">
                        <input
                          type="text"
                          value={aiInput}
                          onChange={(e) => setAiInput(e.target.value)}
                          placeholder="Nəyi analiz edim? (məs: xülasə çıxar, fərqləri tap...)"
                          className="w-full bg-transparent px-4 py-3 text-[14px] text-white placeholder-white/40 focus:outline-none"
                        />
                      </div>
                      <button
                        onClick={() => aiFileInputRef.current?.click()}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-colors shrink-0"
                        title="Kamera"
                        type="button"
                      >
                        <CameraIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => aiGalleryInputRef.current?.click()}
                        className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-white/70 hover:text-white transition-colors shrink-0"
                        title="Fayl"
                        type="button"
                      >
                        <span className="text-lg leading-none">📁</span>
                      </button>
                      <button
                        onClick={handleAiSend}
                        disabled={aiLoading || (!aiInput.trim() && pendingImages.length === 0)}
                        className={`px-4 h-11 rounded-xl text-[14px] font-semibold transition-all duration-300 ${aiLoading || (!aiInput.trim() && pendingImages.length === 0) ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/10' : 'bg-accent/60 hover:bg-accent/70 text-white shadow-[0_4px_12px_rgba(var(--accent),0.3)]'}`}
                      >
                        Göndər
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
                              {aiUsedImages.slice(0, 8).map((src, i) => (
                                <button key={i} onClick={() => setAiImageModalUrl(src)} className="focus:outline-none">
                                  <img src={src} alt="analiz şəkli" className="w-14 h-14 rounded-md border border-white/20 object-cover hover:opacity-90 transition-opacity" />
                                </button>
                              ))}
                            </div>
                          )}
                          {/* Show found videos */}
                          {aiUsedVideos && aiUsedVideos.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {aiUsedVideos.slice(0, 3).map((v, i) => (
                                <div key={i} className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/40">
                                  <iframe src={toEmbedUrl(v)} className="w-full h-full" allowFullScreen />
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Typing indicator while loading or animating */}
                          {(aiLoading || (aiText && aiRendered.length < aiText.length)) ? (
                            <div className="flex items-center gap-1 text-white/70">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '120ms' }} />
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce" style={{ animationDelay: '240ms' }} />
                            </div>
                          ) : null}
                          {aiRendered}
                          {aiSources && aiSources.length > 0 && (
                            <div className="mt-2 text-xs text-white/70 flex flex-wrap gap-2">
                              {aiSources.slice(0, 8).map((s, i) => (
                                <button
                                  key={s.uri + i}
                                  onClick={() => { if (s.uri) { try { openOverlay(s.uri); } catch { } } }}
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
                    try { const u = new URL(item.link); domain = u.hostname; isHttp = u.protocol === 'http:'; } catch { }
                    const isSuspicious = isHttp;
                    return (
                      <li key={i} className="group relative py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors rounded-xl px-2">
                        <button
                          className="text-left w-full"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (safeSearchMode === 'filter' && isLikelyExplicit(item.link, item.title, item.snippet)) return null; // Strict hide check
                            const isBlurred = safeSearchMode === 'blur' && !unblurredItems.has(item.link) && (isLikelyExplicit(query) || isLikelyExplicit(item.link + (thumbnail || ''), item.title, item.snippet));
                            if (isBlurred) {
                              setBlurConfirmation({
                                url: item.link,
                                onConfirm: () => {
                                  setUnblurredItems(prev => new Set(prev).add(item.link));
                                  openOverlay(item.link);
                                }
                              });
                              return;
                            }
                            try {
                              if (isHttp) {
                                const ok = window.confirm('Bu sayt HTTPS istifadə etmir (HTTP). Davam etmək istəyirsiniz?');
                                if (!ok) return;
                              }
                            } catch { }
                            openOverlay(item.link);
                          }}
                          title={item.title}
                        >
                          <div className="flex gap-4">
                            {thumbnail && (
                              <img
                                src={thumbnail}
                                alt=""
                                className={`w-20 h-20 object-cover rounded-xl flex-shrink-0 bg-white/5 ${(safeSearchMode === 'blur' && !unblurredItems.has(item.link) && (isLikelyExplicit(query) || isLikelyExplicit(item.link + (thumbnail || ''), item.title, item.snippet))) ? 'blur-2xl' : ''}`}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 opacity-80">
                                <img src={favicon} alt="" className="w-3.5 h-3.5 rounded-sm" />
                                <span className="text-[13px] text-white/60 truncate">{domain}</span>
                                {isSuspicious && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">HTTP</span>
                                )}
                              </div>
                              <div className="text-base font-medium text-blue-300 group-hover:text-blue-200 group-hover:underline line-clamp-2">{item.title}</div>
                              <p className="text-[13px] text-white/50 mt-1.5 line-clamp-2 leading-relaxed">{item.snippet}</p>
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
                    const href = img.link || img.image.contextLink;
                    let domain = '';
                    try { domain = new URL(href).hostname.replace(/^www\./, ''); } catch { }
                    return (
                      <button
                        key={idx}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (safeSearchMode === 'filter' && isLikelyExplicit(href, img.title)) return null;

                          const isBlurred = safeSearchMode === 'blur' && !unblurredItems.has(href) && (isLikelyExplicit(query) || isLikelyExplicit(href, img.title));
                          if (isBlurred) {
                            setBlurConfirmation({
                              url: href,
                              onConfirm: () => {
                                setUnblurredItems(prev => new Set(prev).add(href));
                                openOverlay(href);
                              }
                            });
                            return;
                          }
                          openOverlay(href);
                        }}
                        className="group block rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all shadow-lg hover:shadow-2xl"
                        title={img.title}
                      >
                        <div className="aspect-square overflow-hidden">
                          <img src={img.image.thumbnailLink} alt={img.title} loading="lazy" decoding="async" sizes="(max-width: 640px) 50vw, 33vw" className={`w-full h-full object-cover group-hover:scale-110 transition-transform duration-300 ${(safeSearchMode === 'blur' && !unblurredItems.has(img.link || img.image.contextLink) && (isLikelyExplicit(query) || isLikelyExplicit(img.link || img.image.contextLink || img.image.thumbnailLink, img.title))) ? 'blur-2xl' : ''}`} />
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
                      <div className="flex gap-3">
                        {n.imageUrl && (
                          <img src={n.imageUrl} alt="" className={`w-16 h-16 object-cover rounded-lg border border-white/10 flex-shrink-0 ${(safeSearchMode === 'blur' && !unblurredItems.has(n.url) && (isLikelyExplicit(query) || isLikelyExplicit(n.url + n.imageUrl, n.title, n.summary || ''))) ? 'blur-2xl' : ''}`} />
                        )}
                        <div className="flex-1 min-w-0">
                          <button onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (safeSearchMode === 'filter' && isLikelyExplicit(n.url, n.title, n.summary || '')) return null;
                            const isBlurred = safeSearchMode === 'blur' && !unblurredItems.has(n.url) && (isLikelyExplicit(query) || isLikelyExplicit(n.url + n.imageUrl, n.title, n.summary || ''));
                            if (isBlurred) {
                              setBlurConfirmation({ url: n.url, onConfirm: () => { setUnblurredItems(prev => new Set(prev).add(n.url)); openOverlay(n.url); } });
                              return;
                            }
                            openOverlay(n.url);
                          }} className="text-left text-base font-semibold text-blue-400 hover:underline line-clamp-2">{n.title}</button>
                          <div className="text-xs text-white/60 mt-1">{n.source} · {new Date(n.publishedAt).toLocaleString()}</div>
                          {n.summary && <p className="text-sm text-white/70 mt-1 line-clamp-2">{n.summary}</p>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {products.map((p, i) => (
                    <button key={i} onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (safeSearchMode === 'filter' && isLikelyExplicit(p.link, p.title)) return null;
                      const isBlurred = safeSearchMode === 'blur' && !unblurredItems.has(p.link) && (isLikelyExplicit(query) || isLikelyExplicit(p.link + p.imageUrl, p.title));
                      if (isBlurred) {
                        setBlurConfirmation({ url: p.link, onConfirm: () => { setUnblurredItems(prev => new Set(prev).add(p.link)); openOverlay(p.link); } });
                        return;
                      }
                      openOverlay(p.link);
                    }} className="text-left p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                      {p.imageUrl && (
                        <div className="aspect-square mb-2 overflow-hidden rounded-lg bg-black/20">
                          <img src={p.imageUrl} alt="" className={`w-full h-full object-cover ${(safeSearchMode === 'blur' && !unblurredItems.has(p.link) && (isLikelyExplicit(query) || isLikelyExplicit(p.link + p.imageUrl, p.title))) ? 'blur-2xl' : ''}`} />
                        </div>
                      )}
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
        </div>
      )}

      {/* Full-screen web overlay (kept mounted; hidden when closed) */}
      {typeof document !== 'undefined' && createPortal(
        <div ref={overlayContainerRef} className={`fixed inset-0 z-[10050] flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] overflow-hidden overscroll-none transition-opacity duration-200 ${overlayShellOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} style={{ top: 0 as any, colorScheme: (isLightOverlay ? 'light' : 'dark') as any }}>
          <div className={`absolute inset-0 ${isLightOverlay ? 'bg-white' : 'bg-black'}`} />
          <div className="relative z-50 h-full w-full flex flex-col">{overlayChromeHidden && (<div className="absolute top-2 right-2 z-[60]"><button onClick={() => setOverlayChromeHidden(false)} className={`px-2 py-1 rounded-md text-xs border ${isLightOverlay ? 'bg-black/10 hover:bg-black/15 text-black border-black/20' : 'bg-white/10 hover:bg-white/15 text-white border-white/20'}`}>Paneli göstər</button></div>)}
            {isMobile && !overlayChromeHidden && (
              <button
                onClick={closeOverlay}
                className={`absolute right-2 top-[calc(env(safe-area-inset-top)+6px)] z-[70] w-9 h-9 rounded-full flex items-center justify-center ${isLightOverlay ? 'bg-black/10 text-black hover:bg-black/15 border border-black/20' : 'bg-white/10 text-white hover:bg-white/15 border border-white/20'}`}
                aria-label="Bağla"
                title="Bağla"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
            {!overlayUrl && !overlayIncognito && (
              <div className="absolute inset-0 pointer-events-none select-none" aria-hidden="true">
                <div className="absolute left-8 top-10">
                  <span
                    className={`block leading-none font-extrabold ${isLightOverlay ? 'opacity-[0.08]' : 'opacity-[0.12]'} bg-gradient-to-r from-blue-300 via-white to-white text-transparent bg-clip-text`}
                    style={{ fontSize: 'min(42vw, 24rem)' }}
                  >
                    N
                  </span>
                </div>
              </div>
            )}
            <div className={`flex items-center gap-3 px-3 py-2 max-w-5xl mx-auto mt-4 mb-2 backdrop-blur-3xl rounded-[24px] border shadow-[0_20px_60px_-10px_rgba(0,0,0,0.6)] ring-1 transition-all ${isLightOverlay ? 'bg-white/85 border-black/10 ring-black/5' : 'bg-[#0f0f13]/85 border-white/10 ring-white/5'}`} style={{ display: (overlayChromeHidden || isMobile) ? "none" : undefined }}>
              {/* Left: Hamburger menu for overlay (incognito only) */}
              {false && overlayIncognito && (
                <div className="relative">
                  <button onClick={() => setOverlayMenuOpen(v => !v)} className={`p-2 rounded-lg ${isLightOverlay ? 'bg-black/5 text-black/80 hover:bg-black/10' : 'bg-white/5 text-white/80 hover:bg-white/10'}`} aria-label="Menyu" title="Menyu">
                    <MenuIcon className="w-4 h-4" />
                  </button>
                  {overlayMenuOpen && (
                    <div className={`absolute left-0 top-full mt-2 backdrop-blur-md rounded-2xl shadow-2xl py-2 min-w-[240px] z-[70] overflow-hidden ${isLightOverlay ? 'bg-white/90 border border-black/10' : 'bg-[#16161a]/95 border border-white/10'}`}>
                      <div className={`absolute left-4 -top-1 w-3 h-3 rotate-45 ${isLightOverlay ? 'bg-white border-l border-t border-black/10' : 'bg-[#16161a] border-l border-t border-white/10'}`}></div>
                      <button onClick={() => { setOverlayIncognito(false); closeOverlay(); setOverlayMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${isLightOverlay ? 'text-black/90 hover:bg-black/5' : 'text-white/90 hover:bg-white/5'}`}>
                        <span>⬅️</span>
                        <span>Brauzerə Geri Qayıt</span>
                      </button>
                      <button onClick={() => { dispatchNav('profile'); setOverlayMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${isLightOverlay ? 'text-black/90 hover:bg-black/5' : 'text-white/90 hover:bg-white/5'}`}>
                        <span>👤</span>
                        <span>Profil</span>
                      </button>
                      <button onClick={() => { dispatchNav('safe-search'); setOverlayMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${isLightOverlay ? 'text-black/90 hover:bg-black/5' : 'text-white/90 hover:bg-white/5'}`}>
                        <span>🛡️</span>
                        <span>SafeSearch</span>
                      </button>
                      <button onClick={() => { dispatchNav('settings'); setOverlayMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-sm flex items-center gap-2 ${isLightOverlay ? 'text-black/90 hover:bg-black/5' : 'text-white/90 hover:bg-white/5'}`}>
                        <span>⚙️</span>
                        <span>Ayarlar</span>
                      </button>
                      <div className={`my-1 h-px ${isLightOverlay ? 'bg-black/5' : 'bg-white/5'}`} />
                      {/* Theme selector for incognito overlay */}
                      <div className={`px-4 py-2 text-xs ${isLightOverlay ? 'text-black/50' : 'text-white/50'}`}>Görünüş</div>
                      <div className="px-3 pb-3 flex items-center gap-2">
                        {([
                          { id: 'light', label: 'Ağ rejim' },
                          { id: 'dark', label: 'Tünd rejim' },
                          { id: 'system', label: 'Sistem' },
                        ] as const).map(opt => (
                          <button key={opt.id}
                            onClick={() => setOverlayTheme(opt.id as any)}
                            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${isLightOverlay ? (overlayTheme === opt.id ? 'bg-black/10 text-black border-black/20' : 'bg-transparent text-black/70 hover:bg-black/5 border-transparent') : (overlayTheme === opt.id ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-white/70 hover:bg-white/5 border-transparent')}`}
                          >{opt.label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* Nav */}
              <div className="flex items-center gap-1.5">
                <div className={`flex items-center gap-2 pr-3 mr-1 border-r ${isLightOverlay ? 'border-black/10' : 'border-white/10'}`}>
                  <Logo className={`${isLightOverlay ? 'text-black' : 'text-white'} text-base md:text-xl`} />
                  <div className="leading-none">
                    <div className={`text-[10px] md:text-[11px] font-medium -mt-[1px] ${isLightOverlay ? 'text-black/60' : 'text-white/60'}`}>NovEra Brauzer</div>
                  </div>
                  {overlayIncognito && (
                    <div className="ml-2 w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-white/90 shadow-sm border border-white/5">🕶️</div>
                  )}
                </div>
                <button onClick={goBack} disabled={overlayIndex <= 0} title="Geri" className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isLightOverlay ? 'text-black/70 hover:bg-black/5 hover:text-black' : 'text-white/70 hover:bg-white/5 hover:text-white'} ${overlayIndex <= 0 ? 'opacity-30 cursor-not-allowed' : ''}`}>
                  <ArrowLeftIcon className="w-4 h-4" />
                </button>
                <button onClick={goForward} disabled={overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1} title="İrəli" className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isLightOverlay ? 'text-black/70 hover:bg-black/5 hover:text-black' : 'text-white/70 hover:bg-white/5 hover:text-white'} ${(overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) ? 'opacity-30 cursor-not-allowed' : ''}`}>
                  <ArrowRightIcon className="w-4 h-4" />
                </button>
                <button onClick={reloadOverlay} title="Yenilə" className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isLightOverlay ? 'text-black/70 hover:bg-black/5 hover:text-black' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}>
                  <RefreshIcon className="w-4 h-4" />
                </button>
              </div>
              {/* URL + Search (always visible on overlay) */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {overlayLoading ? (
                  <div className={`relative w-8 h-8 rounded-full flex items-center justify-center font-bold ${isLightOverlay ? 'bg-black/5 border border-black/10' : 'bg-white/5 border border-white/10'}`}>
                    <div className={`absolute inset-0 rounded-full border-2 border-transparent animate-spin ${isLightOverlay ? 'border-t-black/60' : 'border-t-white/80'}`}></div>
                    <span className="text-[14px] bg-gradient-to-r from-blue-400 to-blue-600 text-transparent bg-clip-text">N</span>
                  </div>
                ) : overlayUrl ? (
                  <>
                    <img src={`https://www.google.com/s2/favicons?domain=${(() => { try { return new URL(overlayUrl).hostname; } catch { return 'nov-era.app'; } })()}&sz=32`} className="w-4 h-4" />
                    <button
                      onClick={() => { try { navigator.clipboard.writeText(overlayUrl!); } catch { } }}
                      title="URL-i kopyala"
                      className={`hidden md:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${isLightOverlay ? 'bg-black/5 text-black/80 border-black/10 hover:bg-black/10' : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'}`}
                    >{(() => { try { return new URL(overlayUrl!).hostname.replace(/^www\./, ''); } catch { return 'link'; } })()}</button>
                  </>
                ) : (!isMobile ? (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isLightOverlay ? 'bg-black/5' : 'bg-white/5'}`}>
                    <span className="text-[14px] bg-gradient-to-r from-blue-400 to-blue-600 text-transparent bg-clip-text">N</span>
                  </div>
                ) : null)}
                {!overlayUrl && (
                  <div className={`flex-1 flex items-center gap-2 px-4 py-2 rounded-full border ring-1 transition-all focus-within:ring-accent/50 focus-within:border-accent/40 ${isLightOverlay ? 'bg-black/5 border-black/10 ring-black/5' : 'bg-black/40 border-white/10 ring-black/20 shadow-inner'}`}>
                    {overlayIncognito ? (
                      <span className="text-white/50 text-sm">🕶️</span>
                    ) : (
                      <SearchIcon className={`w-4 h-4 ${isLightOverlay ? 'text-black/40' : 'text-white/50'}`} />
                    )}
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
                      placeholder="Axtarış və ya URL daxil edin..."
                      className={`flex-1 min-w-0 bg-transparent outline-none text-[15px] font-medium ${isLightOverlay ? 'text-black/90 placeholder-black/40' : 'text-white/90 placeholder-white/40'}`}
                    />
                  </div>
                )}
              </div>
              {/* Actions (simplified in Incognito) */}
              <div className="flex items-center gap-1.5">
                <button onClick={openHeaderNewTabFromOverlay} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isLightOverlay ? 'hover:bg-black/5 text-black/70 hover:text-black' : 'hover:bg-white/5 text-white/70 hover:text-white'}`} title="Yeni tab">
                  <PlusIcon className="w-4 h-4" />
                </button>
                <button onClick={toggleFullscreen} className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isLightOverlay ? 'hover:bg-black/5 text-black/70 hover:text-black' : 'hover:bg-white/5 text-white/70 hover:text-white'}`} title={isFullscreenActive ? 'Tam ekrandan çıx' : 'Tam ekran'}>
                  {isFullscreenActive ? <MinimizeIcon className="w-4 h-4" /> : <MaximizeIcon className="w-4 h-4" />}
                </button>
                {overlayUrl && (
                  <div className={`hidden sm:flex items-center p-0.5 rounded-lg border ${isLightOverlay ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                    <button
                      onClick={() => setOverlayOpenMode('original')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${overlayOpenMode === 'original' ? 'bg-white text-black shadow-sm' : (isLightOverlay ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white')}`}
                    >iframe</button>
                    <button
                      onClick={() => setOverlayOpenMode('proxy')}
                      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${overlayOpenMode === 'proxy' ? 'bg-white text-black shadow-sm' : (isLightOverlay ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white')}`}
                    >proxy</button>
                  </div>
                )}
                {overlayUrl && (
                  <a href={overlayUrl} target="_blank" rel="noopener noreferrer" className={`hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ml-1 ${isLightOverlay ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-accent/20 hover:bg-accent/30 text-white border border-accent/30'}`}>Aç ↗</a>
                )}
                <button onClick={closeOverlay} className={`w-9 h-9 flex items-center justify-center rounded-full ml-1 transition-colors ${isLightOverlay ? 'bg-black/5 hover:bg-black/10 text-black' : 'bg-white/10 hover:bg-white/20 text-white'}`} title="Bağla">
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Desktop: Tab strip disabled for overlay; tabs live only on home header */}
            {false && !isMobile && (
              <div className={`px-2 py-1 overflow-x-auto no-scrollbar ${isLightOverlay ? 'bg-black/5' : 'bg-white/5'}`} style={{ display: overlayChromeHidden ? 'none' : undefined }}>
                <div className="flex items-center gap-1">
                  {(overlayIncognito ? tabsIncog : tabsNormal).map((t) => {
                    const isActive = (overlayIncognito ? activeTabIdIncog : activeTabIdNormal) === t.id;
                    const host = t.url ? (() => { try { return new URL(t.url!).hostname; } catch { return 'nov-era.app'; } })() : '';
                    const fav = t.url ? `https://www.google.com/s2/favicons?domain=${host}&sz=32` : '';
                    return (
                      <div key={t.id} className={`group flex items-center gap-2 rounded-t-lg px-3 py-1.5 border ${isActive ? (isLightOverlay ? 'bg-black/15 border-black/25' : 'bg-white/15 border-white/25') : (isLightOverlay ? 'bg-black/5 border-black/15 hover:bg-black/10' : 'bg-white/5 border-white/15 hover:bg-white/10')}`}>
                        <button onClick={() => switchToTab(t.id)} className="flex items-center gap-2 min-w-0">
                          {t.url ? (<img src={fav} className="w-4 h-4" />) : (<div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold ${isLightOverlay ? 'bg-black/20 text-black' : 'bg-white/20 text-white'}`}>N</div>)}
                          <span className={`text-xs truncate max-w-[22ch] ${isLightOverlay ? 'text-black/80' : 'text-white/80'}`}>{t.url ? (t.title || 'Tab') : 'Yeni Tab'}</span>
                        </button>
                        <button onClick={() => closeTabById(t.id)} className={`opacity-70 hover:opacity-100 ${isLightOverlay ? 'text-black/60 hover:text-black' : 'text-white/60 hover:text-white'}`} title="Bağla">×</button>
                      </div>
                    );
                  })}
                  <button onClick={openHeaderNewTabFromOverlay} className={`ml-1 px-2 py-1 rounded-md border ${isLightOverlay ? 'bg-black/5 hover:bg-black/10 text-black/80 border-black/15' : 'bg-white/5 hover:bg-white/10 text-white/80 border-white/15'}`} title="Yeni tab">+</button>
                </div>
              </div>
            )}
            {/* Mobile overlay controls (modern, 2-row) */}
            {isMobile && (
              <div 
                className={`relative z-[60] flex flex-col gap-3 px-4 py-4 ${isLightOverlay ? 'bg-white/80 border-b border-black/5' : 'bg-[#0f0f13]/90 border-b border-white/5'} backdrop-blur-2xl pointer-events-auto shadow-xl`} 
                style={{ display: overlayChromeHidden ? 'none' : undefined }}
              >
                {/* Row 1: Back, Forward, URL/Search, Tabs, Menu */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 border border-white/5">
                    <button 
                      onClick={goBack} 
                      disabled={overlayIndex <= 0}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${overlayIndex <= 0 ? 'opacity-20' : (isLightOverlay ? 'hover:bg-black/5 text-black' : 'hover:bg-white/10 text-white')}`}
                    >
                      <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={goForward} 
                      disabled={overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1}
                      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${(overlayIndex < 0 || overlayIndex >= overlayHistory.length - 1) ? 'opacity-20' : (isLightOverlay ? 'hover:bg-black/5 text-black' : 'hover:bg-white/10 text-white')}`}
                    >
                      <ArrowRightIcon className="w-5 h-5" />
                    </button>
                  </div>

                  <div className={`flex-1 flex items-center gap-2 px-4 py-2.5 rounded-2xl border transition-all ${isLightOverlay ? 'bg-black/5 border-black/10 text-black' : 'bg-white/5 border-white/10 text-white'} focus-within:ring-2 focus-within:ring-accent/50`}>
                    {overlayLoading ? (
                      <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <SearchIcon className="w-4 h-4 opacity-40" />
                    )}
                    <input 
                      type="text"
                      value={overlaySearch || (overlayUrl ? getHost(overlayUrl) : '')}
                      onChange={(e) => setOverlaySearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const v = (overlaySearch || '').trim();
                          if (!v) return;
                          if (isProbablyUrl(v)) { navigateOverlay(normalizeUrl(v)); setOverlaySearch(''); return; }
                          closeOverlay(); doSearch(1, v);
                        }
                      }}
                      placeholder="Axtar və ya URL..."
                      className="flex-1 bg-transparent text-sm font-medium outline-none placeholder:opacity-40"
                    />
                    {overlayUrl && (
                      <button onClick={reloadOverlay} className="p-1 opacity-40 hover:opacity-100">
                        <RefreshIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={() => { setOverlayShellOpen(false); setShowTabSwitcher(true); }}
                    className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm border shadow-sm transition-all active:scale-90 ${isLightOverlay ? 'bg-white border-black/10 text-black' : 'bg-white/10 border-white/10 text-white'}`}
                  >
                    {Math.max(1, mobileTabCount || 0)}
                  </button>
                </div>

                {/* Row 2: Secondary actions (SafeSearch, Mode, More) */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setSafeSearchDropdownOpen(!safeSearchDropdownOpen)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-2 border transition-colors ${safeSearchMode !== 'off' ? 'bg-accent/20 border-accent/30 text-accent' : 'bg-white/5 border-white/10 text-white/60'}`}
                    >
                      🛡️ {safeSearchMode === 'off' ? 'SİXİLİ' : safeSearchMode.toUpperCase()}
                    </button>
                    
                    {overlayUrl && (
                      <button 
                        onClick={() => setOverlayOpenMode(overlayOpenMode === 'proxy' ? 'original' : 'proxy')}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${isLightOverlay ? 'bg-black/5 border-black/10 text-black/60' : 'bg-white/5 border-white/10 text-white/60'}`}
                      >
                        {overlayOpenMode.toUpperCase()}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setPageMenuOpen(!pageMenuOpen)}
                      className={`p-2 rounded-lg ${isLightOverlay ? 'text-black/60' : 'text-white/60'}`}
                    >
                      <MenuIcon className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={closeOverlay}
                      className="w-10 h-10 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 active:scale-90 transition-transform"
                    >
                      <CloseIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* SafeSearch Dropdown Mobile */}
                {safeSearchDropdownOpen && (
                  <div className={`absolute top-full left-4 mt-2 w-48 rounded-2xl shadow-2xl border p-1 z-[70] animate-in fade-in zoom-in duration-200 ${isLightOverlay ? 'bg-white border-black/10' : 'bg-[#1a1a1f] border-white/10'}`}>
                    {(['filter', 'blur', 'off'] as const).map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          try { window.dispatchEvent(new CustomEvent('nov-era-safe-search-changed', { detail: m })); } catch { }
                          setSafeSearchDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-3 text-xs font-bold rounded-xl transition-colors ${safeSearchMode === m ? 'bg-accent/20 text-accent' : (isLightOverlay ? 'text-black/70 hover:bg-black/5' : 'text-white/70 hover:bg-white/5')}`}
                      >
                        {m === 'filter' ? 'FİLTRLƏ' : m === 'blur' ? 'BULANIQ' : 'DEAKTİV'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
              <>
                {overlayNotice && (
                  <div className="px-3 py-2 bg-amber-500/15 text-amber-200 text-xs border-b border-amber-400/30">{overlayNotice}</div>
                )}
                <div className="relative flex-1 w-full">
                  {(tabsIncog.length > 0) && tabsIncog.map(t => {
                    const visible = (t.id === activeTabIdIncog) && !!t.url;
                    const isImg = !!(t.url && isImageUrlLike(t.url));
                    if (isImg) {
                      return (
                        <img
                          key={t.id}
                          src={t.url!}
                          style={{ display: visible ? 'block' : 'none' }}
                          className={`absolute inset-0 w-full h-full object-contain ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                          alt="şəkil"
                          onLoad={() => { if (t.id === activeTabIdIncog) { overlayLoadedRef.current = true; setOverlayLoading(false); if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } } }}
                        />
                      );
                    }
                    const src = t.url ? (overlayOpenMode === 'proxy' ? toProxyUrl(t.url) : toEmbedUrl(t.url)) : '';
                    return (
                      <iframe
                        key={t.id}
                        src={src}
                        style={{ display: visible ? 'block' : 'none' }}
                        className={`absolute inset-0 w-full h-full ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                        referrerPolicy="no-referrer-when-downgrade"
                        allow="autoplay; fullscreen; clipboard-read; clipboard-write; geolocation; microphone; camera; display-capture; accelerometer; gyroscope; payment; magnetometer; midi; encrypted-media; picture-in-picture; web-share"
                        allowFullScreen
                        onLoad={() => { if (t.id === activeTabIdIncog) { overlayLoadedRef.current = true; setOverlayLoading(false); if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } } }}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              (() => {
                return (
                  <>
                    {overlayNotice && (
                      <div className="px-3 py-2 bg-amber-500/15 text-amber-200 text-xs border-b border-amber-400/30">{overlayNotice}</div>
                    )}
                    <div className="relative flex-1 w-full">
                      {(tabsNormal.length > 0) && tabsNormal.map(t => {
                        const visible = (t.id === activeTabIdNormal) && !!t.url;
                        const isImg = !!(t.url && isImageUrlLike(t.url));
                        if (isImg) {
                          return (
                            <img
                              key={t.id}
                              src={t.url!}
                              style={{ display: visible ? 'block' : 'none' }}
                              className={`absolute inset-0 w-full h-full object-contain ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                              alt="şəkil"
                              onLoad={() => { if (t.id === activeTabIdNormal) { overlayLoadedRef.current = true; setOverlayLoading(false); if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } } }}
                            />
                          );
                        }
                        const src = t.url ? (overlayOpenMode === 'proxy' ? toProxyUrl(t.url) : toEmbedUrl(t.url)) : '';
                        return (
                          <iframe
                            key={t.id}
                            src={src}
                            style={{ display: visible ? 'block' : 'none' }}
                            className={`absolute inset-0 flex-1 w-full h-full ${isLightOverlay ? 'bg-white' : 'bg-black'}`}
                            referrerPolicy="no-referrer-when-downgrade"
                            allow="autoplay; fullscreen; clipboard-read; clipboard-write; geolocation; microphone; camera; display-capture; accelerometer; gyroscope; payment; magnetometer; midi; encrypted-media; picture-in-picture; web-share"
                            allowFullScreen
                            onLoad={() => { if (t.id === activeTabIdNormal) { overlayLoadedRef.current = true; setOverlayLoading(false); if (overlayFallbackTimerRef.current) { window.clearTimeout(overlayFallbackTimerRef.current); overlayFallbackTimerRef.current = null; } } }}
                          />
                        );
                      })}
                    </div>
                  </>
                );
              })()
            )
            }
          </div>
        </div>, document.body)}

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
      {blurConfirmation && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200 mx-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-accent/20 text-accent flex items-center justify-center text-2xl mb-4">
                🛡️
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">SafeSearch Xəbərdarlığı</h3>
              <p className="text-white/70 text-sm mb-6">
                Bu məzmun SafeSearch tərəfindən bulanıqlaşdırılıb. Açmaq istədiyinizə əminsiniz?
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setBlurConfirmation(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 font-medium transition-colors border border-white/5"
                >
                  Belə saxla
                </button>
                <button
                  onClick={() => {
                    blurConfirmation.onConfirm();
                    setBlurConfirmation(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-accent hover:bg-accent/80 text-white font-medium transition-colors shadow-lg shadow-accent/20"
                >
                  Bulanıqlığı aç
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default BrowserView;
