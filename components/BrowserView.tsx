import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { SearchIcon, LoadingSpinner, MicrophoneIcon, PlusIcon, CameraIcon, CloseIcon, ArrowLeftIcon } from './Icons';
import { ArrowRightIcon, RefreshIcon } from './BrowserIcons';
import { HeroSearchBar } from './HeroSearchBar';
import { suggestAutocomplete, detectLocaleForSearch, searchImagesAndVideos, searchNews, searchShopping, searchWeb } from '../services/searchService';
import { CameraCapture } from './CameraCapture';
import { Logo } from './Logo';
import type { NewsArticle, ShoppingProduct } from '../types';

interface SearchItem {
  title: string;
  link: string;
  snippet: string;
  pagemap?: {
    cse_thumbnail?: Array<{ src: string }>;
    metatags?: Array<{ [key: string]: string }>;
  };
}
const getHost = (u: string): string => { try { return new URL(u).hostname; } catch { return u; } };

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

// Some sites disallow embedding in iframes (X-Frame-Options/CSP). Fallback to new tab.
const nonEmbeddableHosts = [
  'youtube.com', 'www.youtube.com', 'youtu.be',
  'twitter.com', 'x.com', 'www.twitter.com', 'www.x.com',
  'facebook.com', 'www.facebook.com', 'instagram.com', 'www.instagram.com',
  'accounts.google.com', 'mail.google.com', 'docs.google.com', 'drive.google.com',
];
const canEmbed = (u: string): boolean => {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return !nonEmbeddableHosts.some(h => host === h || host.endsWith('.' + h));
  } catch { return false; }
};
const toReader = (u: string): string => {
  try {
    const url = new URL(u);
    return `https://r.jina.ai/http://${url.hostname}${url.pathname}${url.search}`;
  } catch { return u; }
};

interface BrowserViewProps {
  onVisualQuery?: (query: string, images: string[]) => void;
}

export const BrowserView: React.FC<BrowserViewProps> = ({ onVisualQuery }) => {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [hasCaptured, setHasCaptured] = useState(false);
  const [activeTab, setActiveTab] = useState<'web' | 'images' | 'videos' | 'news' | 'shopping'>('web');
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>([]);
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [overlaySearch, setOverlaySearch] = useState<string>('');
  const [overlayHistory, setOverlayHistory] = useState<string[]>([]);
  const [overlayIndex, setOverlayIndex] = useState<number>(-1);
  const [overlayKey, setOverlayKey] = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
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
    setOverlayUrl(url);
    setOverlayKey(k => k + 1);
  };
  const closeOverlay = () => setOverlayUrl(null);
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
  const reloadOverlay = () => setOverlayKey(k => k + 1);

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
    try {
      const start = (pageIndex - 1) * 10 + 1;
      const useCSE = !!(GOOGLE_API_KEY && CX);
      // Build URLs
      const webUrl = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&start=${start}` : '';
      const imageUrl = useCSE ? `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(qStr)}&searchType=image&num=8` : '';

      const [webResp, imgResp, visuals, nData, sData] = await Promise.all([
        useCSE ? fetch(webUrl) : Promise.resolve(null as any),
        useCSE ? fetch(imageUrl).catch(() => null) : Promise.resolve(null),
        searchImagesAndVideos(qStr, 8, 6).catch(() => ({ images: [], videos: [] })),
        searchNews(qStr, 8).catch(() => [] as NewsArticle[]),
        searchShopping(qStr, 8).catch(() => [] as ShoppingProduct[]),
      ]);
      
      let gotWeb = false;
      if (webResp) {
        const data: SearchResponse = await webResp.json();
        if (webResp.ok && data.items) {
          const safe = data.items.filter(it => isSafeUrl(it.link));
          setResults(safe);
          setPage(pageIndex);
          if (qOverride !== undefined) setQuery(qStr);
          setHasNextPage(!!(data.queries && data.queries.nextPage && data.queries.nextPage.length));
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
          gotWeb = true;
        } else if ((data as any)?.error) {
          setError(`Axtarış zamanı xəta: ${(data as any).error.message}`);
        }
      }
      // Fallback to Serper if CSE missing/fails or no items
      if (!gotWeb) {
        const loc = detectLocaleForSearch();
        const serper = await searchWeb(qStr, 10, loc).catch(() => null);
        if (serper && serper.organic && serper.organic.length) {
          const mapped = serper.organic
            .filter((r) => isSafeUrl(r.link))
            .map((r) => ({ title: r.title, link: r.link, snippet: r.snippet })) as SearchItem[];
          setResults(mapped);
          setPage(pageIndex);
          setHasNextPage(mapped.length >= 10); // heuristic
          gotWeb = true;
          setError(null);
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
        } else {
          setResults([]);
          setError('Axtarış nəticəsi tapılmadı.');
        }
      }
      
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
      setError('Şəbəkə xətası. İnternet bağlantısını yoxlayın.');
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const openCamera = () => {
    setHasCaptured(false);
    setIsCameraOpen(true);
    setShowUploadMenu(false);
  };

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
  };

  // Global back/forward: if overlay is open use overlay history, else paginate results
  const handleGlobalBack = () => {
    if (overlayUrl) {
      if (overlayIndex <= 0) return;
      goBack();
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

  const hasAnyResults = results.length > 0 || imageResults.length > 0 || videoUrls.length > 0 || newsItems.length > 0 || products.length > 0;

  return (
    <div className="p-4 md:p-6 h-full text-text-main bg-bg-main/80 backdrop-blur-sm">
      {/* Hero center before first search */}
      {!hasAnyResults && !loading ? (
        <div className="h-full flex flex-col items-center justify-center text-center px-4">
          <Logo isLarge={true} />
          <div className="w-full max-w-3xl mx-auto mt-6">
            <HeroSearchBar
              onSend={(q, imgs) => {
                if (imgs && imgs.length) {
                  const analysisQuery = (q && q.trim()) ? q.trim() : 'Bu şəkli analiz et.';
                  if (onVisualQuery) onVisualQuery(analysisQuery, imgs);
                  else setError('Şəkil AI-a göndərilə bilmədi.');
                } else {
                  doSearch(1, q || '');
                }
              }}
              isLoading={loading}
              onVoiceClick={() => {}}
              placeholder="Vebdə axtarın..."
            />
          </div>
        </div>
      ) : (
        <>
        {/* Sticky mini search on results */}
        <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur border-b border-white/10 -mx-4 md:-mx-6 px-4 md:px-6 py-2">
          <div className="w-full max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
            {/* Small clickable logo to go lobby */}
            <button onClick={clearAll} className="flex items-center gap-2 p-1 rounded-lg hover:bg-white/10">
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
            <div className="flex-1 min-w-[220px]">
              <HeroSearchBar
                onSend={(q, imgs) => {
                  if (imgs && imgs.length) {
                    const analysisQuery = (q && q.trim()) ? q.trim() : 'Bu şəkli analiz et.';
                    if (onVisualQuery) onVisualQuery(analysisQuery, imgs);
                    else setError('Şəkil AI-a göndərilə bilmədi.');
                  } else {
                    setPreviewUrl('');
                    doSearch(1, q || '');
                  }
                }}
                isLoading={loading}
                onVoiceClick={() => {}}
                placeholder="Vebdə axtarın..."
              />
            </div>
          </div>
        </div>

        <div className="grid gap-4 h-full overflow-hidden grid-cols-1">
        {/* Results list */}
        <div className="overflow-y-auto pr-2 pb-24 browser-scroll">
          {/* Tabs: Web / Images / Videos / News / Shopping */}
          <div className="flex flex-wrap gap-2 mb-3 sticky top-0 bg-bg-main/95 backdrop-blur z-10 p-2 rounded-lg border border-white/10">
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
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === t.id ? 'bg-accent/20 text-white ring-1 ring-accent/50' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {imageResults.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => { const u = img.image.contextLink; openOverlay(u); }}
                  className="group block aspect-square overflow-hidden rounded-xl border border-white/10 hover:border-white/30 transition-all shadow-lg hover:shadow-2xl"
                  title={img.title}
                >
                  <img src={img.image.thumbnailLink} alt={img.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                </button>
              ))}
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
                  <div className="text-xs text-white/60 mt-1">{n.source} — {new Date(n.publishedAt).toLocaleString()}</div>
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

          {/* Sticky pagination at bottom of scroller */}
          {results.length > 0 && (
            <div className="sticky bottom-0 left-0 right-0 mt-3 pt-2 pb-2 bg-bg-main/80 backdrop-blur border-t border-white/10 flex items-center justify-center gap-4">
              <button
                onClick={() => {
                  const newPage = Math.max(1, page - 1);
                  if (newPage === page) return;
                  setPage(newPage);
                  doSearch(newPage);
                }}
                disabled={page <= 1}
                className={`px-4 py-2 rounded-md transition-colors ${page <= 1 ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-white/10 hover:bg-white/20 text-white'}`}
              >
                Əvvəlki
              </button>
              <span className="text-text-sub">Səhifə {page}</span>
              <button
                onClick={() => {
                  const newPage = page + 1;
                  setPage(newPage);
                  doSearch(newPage);
                }}
                className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
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
      {overlayUrl && (
        <div className="fixed inset-0 z-[9999] flex flex-col">
          <div className="absolute inset-0 bg-black/70" onClick={closeOverlay} />
          <div className="relative z-50 h-full w-full flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/10 backdrop-blur border-b border-white/15">
              {/* Nav */}
              <div className="flex items-center gap-2">
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
              {/* URL + Search */}
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <img src={`https://www.google.com/s2/favicons?domain=${new URL(overlayUrl).hostname}&sz=32`} className="w-4 h-4" />
                <span className="text-xs text-white/80 truncate max-w-[24vw] hidden md:block">{overlayUrl}</span>
                <input
                  type="text"
                  value={overlaySearch}
                  onChange={(e) => setOverlaySearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { closeOverlay(); doSearch(1, overlaySearch); } }}
                  placeholder="Axtar..."
                  className="flex-1 min-w-0 text-base px-4 py-2 rounded-full bg-black/60 text-white placeholder-white/70 border border-white/20 focus:outline-none focus:ring-2 focus:ring-accent/70"
                />
                <button onClick={() => { closeOverlay(); doSearch(1, overlaySearch); }} className="px-4 py-2 rounded-full bg-accent/50 text-white hover:bg-accent/60 text-sm">Axtar</button>
              </div>
              {/* Actions */}
              <div className="flex items-center gap-2">
                <a href={overlayUrl} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 bg-accent/30 text-white rounded-lg hover:bg-accent/40 transition-colors">Yeni pəncərədə aç ↗</a>
                <button onClick={closeOverlay} className="p-1.5 rounded-lg hover:bg-white/10 text-white/80" title="Bağla">
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            {/* Reader fallback if embedding is blocked */}
            {(() => {
              const src = overlayUrl ? (canEmbed(overlayUrl) ? overlayUrl : toReader(overlayUrl)) : '';
              const isReader = overlayUrl ? !canEmbed(overlayUrl) : false;
              return (
                <>
                  {isReader && (
                    <div className="px-3 py-2 bg-amber-500/15 text-amber-200 text-xs border-b border-amber-400/30">Bu sayt iframedə açıla bilmir. Sadələşdirilmiş oxuyucu rejimi göstərilir. Orijinalını “Yeni pəncərədə aç” ilə açın.</div>
                  )}
                  <iframe key={`${src}-${overlayKey}`} src={src} className="flex-1 w-full bg-white" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" />
                </>
              );
            })()}
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
        `}
      </style>

      {/* Hidden inputs for uploads */}
      <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />
      {/* Gallery should not force camera; no capture attribute here */}
      <input ref={galleryInputRef} type="file" onChange={handleFileUpload} className="hidden" accept="image/*" />

      {/* Camera overlay */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setIsCameraOpen(false)} />
          <div className="relative z-50 w-[92vw] max-w-[680px] h-[60vh] bg-bg-slate/95 backdrop-blur-md border border-white/15 rounded-2xl shadow-2xl p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <div className="text-white/80 text-sm">Kamera</div>
              <button onClick={() => setIsCameraOpen(false)} className="p-2 rounded-lg hover:bg-white/10 text-white/80">
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 relative rounded-lg overflow-hidden">
              <CameraCapture
                isActive={true}
                captureInterval={1200}
                onError={(msg) => setError(msg)}
                onImageCaptured={(img) => {
                  if (hasCaptured) return;
                  setHasCaptured(true);
                  setIsCameraOpen(false);
                  const analysisQuery = (query.trim() || 'Bu şəkli analiz et.');
                  if (onVisualQuery) {
                    onVisualQuery(analysisQuery, [img.dataUrl]);
                  } else {
                    setError('Şəkil AI-a göndərilə bilmədi. Zəhmət olmasa əsas axtarış bölümünə qayıdın.');
                  }
                  setQuery('');
                }}
              />
            </div>
            <div className="pt-3 text-center text-xs text-white/70">Şəkil avtomatik çəkilib axtarışa göndəriləcək</div>
          </div>
        </div>
      )}
    </div>
  );
};
