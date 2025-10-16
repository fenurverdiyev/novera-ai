import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { HeroSearchBar } from './HeroSearchBar';
import { SearchIcon, LoadingSpinner, MicrophoneIcon, CameraIcon } from './Icons';
import { suggestAutocomplete, detectLocaleForSearch, searchImagesAndVideos, searchNews, searchShopping } from '../services/searchService';
import type { NewsArticle, ShoppingProduct } from '../types';

// Axtarış nəticələrinin tipləri
interface SearchItem {
  title: string;
  link: string;
  snippet: string;
}

interface SearchResponse {
  items?: SearchItem[];
  queries?: {
    nextPage?: Array<{ startIndex: number }>;
    previousPage?: Array<{ startIndex: number }>;
  };
  error?: {
    message: string;
  };
}

interface ImageItem {
  link: string;
  image: { thumbnailLink: string; contextLink: string };
  title: string;
}
interface ImageSearchResponse { items?: ImageItem[]; error?: { message: string } }

// .env faylından açarları oxuyuruq (yeniləri ilə geriyə uyğun)
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_JSON_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const CX = import.meta.env.VITE_GOOGLE_CSE_CX || import.meta.env.VITE_GOOGLE_CSE_ID;

interface Props { isIncognito?: boolean }

const isProbablyUrl = (val: string): boolean => {
  const s = (val || '').trim();
  if (!s) return false;
  try { new URL(s); return true; } catch {}
  if (/^www\.[^\s/]+\.[^\s]{2,}/i.test(s)) return true;
  if (/^[^\s/]+\.[a-z]{2,}(\/.*)?$/i.test(s)) return true;
  return false;
};
const normalizeUrl = (val: string): string => {
  let s = (val || '').trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { return new URL(s).toString(); } catch { return s; }
};

export const GoogleSearchView: React.FC<Props> = ({ isIncognito = false }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const debounceRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [activeTab, setActiveTab] = useState<'web' | 'images'>('web');
  const [imageResults, setImageResults] = useState<ImageItem[]>([]);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [newsItems, setNewsItems] = useState<NewsArticle[]>([]);
  const [products, setProducts] = useState<ShoppingProduct[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);

  const dispatchOpenUrl = (url: string) => { try { window.dispatchEvent(new CustomEvent('nov-era-open-url' as any, { detail: url })); } catch {} };
  const dispatchBrowserSearch = (q: string, fromIncognito = false) => {
    try { window.dispatchEvent(new CustomEvent('nov-era-browser-search' as any, { detail: { query: q, fromIncognito } })); } catch {}
  };
  const dispatchAiAnalyze = (q: string) => { try { window.dispatchEvent(new CustomEvent('nov-era-ai-analyze' as any, { detail: (q || '').trim() })); } catch {} };

  const doSearch = useCallback(async (pageIndex = 1, qOverride?: string) => {
    const q = (qOverride ?? query).trim();
    if (!q) {
      setError("Zəhmət olmasa, axtarış üçün bir sorğu daxil edin.");
      return;
    }
    if (!GOOGLE_API_KEY) {
        setError("Axtarış API açarı konfiqurasiya edilməyib. Zəhmət olmasa .env faylını yoxlayın.");
        return;
    }

    setLoading(true);
    setError(null);
    // Axtarış başlayanda nəticələri sıfırlayırıq ki, köhnə nəticələr görünsün
    // setResults([]); 

    try {
      const safePref = (() => { try { const v = localStorage.getItem('nov-era-safe-search'); return (v === 'off') ? 'off' : 'active'; } catch { return 'off'; } })();
      const start = (pageIndex - 1) * 10 + 1;
      if (qOverride !== undefined) setQuery(q);
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(q)}&start=${start}&safe=${safePref}`;
      const imgUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(q)}&searchType=image&num=24&safe=${safePref}`;
      
      const [resp, imgResp, vis, news, shop] = await Promise.all([
        fetch(url),
        fetch(imgUrl).catch(() => null as any),
        searchImagesAndVideos(q, 0, 6).catch(() => null),
        searchNews(q, 10).catch(() => [] as NewsArticle[]),
        searchShopping(q, 12).catch(() => [] as ShoppingProduct[]),
      ]);
      const data: SearchResponse = await resp.json();
      if (imgResp) {
        try {
          const idata: ImageSearchResponse = await imgResp.json();
          setImageResults(idata.items || []);
        } catch { setImageResults([]); }
      } else { setImageResults([]); }
      if (vis && (vis as any).videos) setVideoUrls((vis as any).videos || []); else setVideoUrls([]);
      setNewsItems(Array.isArray(news) ? news : []);
      setProducts(Array.isArray(shop) ? shop : []);

      if (resp.ok && data.items) {
        setResults(data.items);
        setHasNextPage(!!data.queries?.nextPage);
        setHasPrevPage(!!data.queries?.previousPage);
        setPage(pageIndex);
      } else if (data.error) {
        setError(`Axtarış zamanı xəta baş verdi: ${data.error.message}`);
        setResults([]);
      } else {
        setError('Axtarış nəticəsi tapılmadı.');
        setResults([]);
      }
    } catch (e) {
      console.error(e);
      setError('Axtarış zamanı şəbəkə xətası baş verdi. İnternet bağlantınızı yoxlayın.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const runSearch = () => {
    const q = query.trim();
    if (isIncognito) {
      if (isProbablyUrl(q)) { window.open(normalizeUrl(q), '_blank'); return; }
      setSuggestions([]); setActiveIndex(-1);
      dispatchBrowserSearch(q, true);
      setResults([]);
      return;
    }
    setSuggestions([]); setActiveIndex(-1);
    doSearch(1, q);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch();
  };

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
        if (isIncognito) {
          dispatchBrowserSearch(sug, true);
          setResults([]);
        } else {
          doSearch(1, sug);
        }
      } else {
        handleSearchSubmit(e as any);
      }
      return;
    }
    if (e.key === 'Tab' && suggestions.length > 0 && activeIndex >= 0) {
      const sug = suggestions[activeIndex];
      setQuery(sug);
      setTimeout(() => setSuggestions([]), 0);
    }
    if (e.key === 'Escape') {
      setSuggestions([]);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col text-text-main bg-bg-main/80 backdrop-blur-sm">
      
      {/* Axtarışdan sonra bu başlığı göstər */}
      {results.length > 0 && (
        <h1 className="text-2xl font-bold mb-4 text-center">Axtarış Nəticələri</h1>
      )}

      {/* Mərkəzi hero + kapsul axtarış (nəticə yoxdursa) */}
      {results.length === 0 && !loading ? (
        <div className="flex-grow flex flex-col items-center justify-center text-center mt-10 md:mt-12">
          {isIncognito ? (
            <div className="mb-4 flex flex-col items-center gap-2">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-3xl">🕶️</div>
              <div className="text-2xl md:text-3xl font-bold text-white">Anonim Tab</div>
            </div>
          ) : (
            <Logo isLarge={true} />
          )}
          <div className="w-full max-w-3xl mx-auto mt-8">
            <HeroSearchBar
              onSend={(q) => {
                const qq = (q || '').trim();
                if (isIncognito) {
                  if (isProbablyUrl(qq)) { window.open(normalizeUrl(qq), '_blank'); }
                  else { dispatchBrowserSearch(qq, true); setResults([]); }
                  return;
                }
                doSearch(1, qq);
              }}
              isLoading={loading}
              onVoiceClick={() => {}}
              placeholder="Axtarış edin və ya yazmağa başlayın..."
              disableHistory={isIncognito}
            />
          </div>
          {!isIncognito && (
            <p className="text-2xl font-semibold text-text-main mt-4">Bu gün sizə necə kömək edə bilərəm?</p>
          )}
        </div>
      ) : (
        <>
          {/* Axtarış forması üst hissədə (nəticələr var ikən) */}
          <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl mx-auto mb-4">
            <div className="relative flex items-center">
              {suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-hidden">
                  {suggestions.map((sug, idx) => (
                    <button
                      key={sug}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => {
                        setQuery(sug); setSuggestions([]); setActiveIndex(-1);
                        if (isIncognito) {
                          if (isProbablyUrl(sug)) { window.open(normalizeUrl(sug), '_blank'); }
                          else { dispatchBrowserSearch(sug, true); setResults([]); }
                        } else { doSearch(1, sug); }
                      }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                      title={sug}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <button type="button" onClick={runSearch} className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)] hover:bg-white/15">
                  <SearchIcon className="w-4 h-4 text-white/80" />
                </button>
              </div>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Axtarış edin və ya yazmağa başlayın..."
                onKeyDown={handleKeyDown}
                className="w-full bg-black/30 rounded-full py-3.5 pl-14 pr-24 text-white text-lg focus:outline-none focus:ring-2 focus:ring-accent/80 border border-white/20 ring-1 ring-white/10 backdrop-blur-md"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3 text-white/80">
                <button type="button" className="p-2 rounded-full hover:bg-white/10"><MicrophoneIcon className="w-5 h-5" /></button>
                <button type="button" className="p-2 rounded-full hover:bg-white/10"><CameraIcon className="w-5 h-5" /></button>
              </div>
            </div>
          </form>
        </>
      )}

      {loading && <div className="text-center"><LoadingSpinner className="w-8 h-8 inline-block" /></div>}
      {/* AI Analysis compact panel */}
      {results.length > 0 && (
        <div className="mb-3 p-3 rounded-2xl border border-white/10 bg-gradient-to-br from-white/6 via-white/4 to-white/6 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,.25)] transition-all max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Logo isLarge={false} />
              <span className="text-sm font-semibold text-white/90">AI Analizi</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { if (!query.trim()) return; setAiLoading(true); dispatchAiAnalyze(query); setTimeout(() => setAiLoading(false), 400); }}
                disabled={aiLoading || !query.trim()}
                className={`px-3 py-1.5 rounded-lg text-sm ${aiLoading || !query.trim() ? 'bg-white/5 text-white/40 cursor-not-allowed' : 'bg-accent/60 hover:bg-accent/70 text-white shadow-md shadow-accent/20'}`}
              >{aiLoading ? 'Analiz edilir...' : 'AI Analiz Et'}</button>
              <button onClick={() => setAiExpanded(v => !v)} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-white/80 text-xs" title={aiExpanded ? 'Yığ' : 'Aç'}>{aiExpanded ? 'Yığ' : 'Aç'}</button>
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent/40 to-accent/10 border border-accent/40 text-[11px] font-semibold flex items-center justify-center text-white/90">N</div>
            </div>
          </div>
          {aiExpanded && (
            <div className="mt-2 text-sm text-white/80">Sorğunu AI ilə təhlil etmək üçün yuxarıdakı düymədən istifadə edin.</div>
          )}
        </div>
      )}
      {error && <div className="text-center text-red-400 p-4 bg-red-900/50 rounded-lg max-w-2xl mx-auto w-full">{error}</div>}

      {/* Nəticələr Bölməsi */}
      <div className="flex-grow overflow-y-auto pr-2 mt-4">
        {results.length > 0 && (
          <>
            <h2 className="text-xl font-bold mb-2 text-center text-white/80">Axtarış Nəticələri</h2>
            {/* Tabs */}
            <div className="flex gap-2 justify-center mb-3">
              {([
                { id: 'web', label: 'Veb' },
                { id: 'images', label: `Şəkillər ${imageResults.length ? `(${imageResults.length})` : ''}` },
                { id: 'videos', label: `Videolar ${videoUrls.length ? `(${videoUrls.length})` : ''}` },
                { id: 'news', label: `Xəbərlər ${newsItems.length ? `(${newsItems.length})` : ''}` },
                { id: 'shopping', label: `Shopping ${products.length ? `(${products.length})` : ''}` },
              ] as const).map(t => (
                <button key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? 'bg-accent/20 text-white ring-1 ring-accent/50' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >{t.label}</button>
              ))}
            </div>
            {activeTab === 'web' ? (
              <ul className="space-y-4 max-w-2xl mx-auto">
                  {results.map((item, i) => (
                    <li key={i} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                      <button onClick={() => dispatchOpenUrl(item.link)} className="text-left text-lg font-semibold text-blue-400 hover:underline w-full">
                        {item.title}
                      </button>
                      <p className="text-sm text-text-sub mt-1">{item.snippet}</p>
                      <button onClick={() => dispatchOpenUrl(item.link)} className="text-xs text-green-500 mt-2 block truncate hover:underline text-left">
                        {item.link}
                      </button>
                    </li>
                  ))}
              </ul>
            ) : activeTab === 'images' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-w-3xl mx-auto">
                {imageResults.map((img, idx) => {
                  const href = img.image.contextLink;
                  let domain = '';
                  try { domain = new URL(href).hostname.replace(/^www\./,''); } catch {}
                  return (
                    <button key={idx} onClick={() => dispatchOpenUrl(href)} className="group block rounded-xl overflow-hidden border border-white/10 hover:border-white/30 transition-all shadow-lg hover:shadow-2xl text-left" title={img.title}>
                      <div className="aspect-square overflow-hidden">
                        <img src={img.image.thumbnailLink} alt={img.title} loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
                {videoUrls.map((url, i) => (
                  <button key={i} onClick={() => dispatchOpenUrl(url)} className="text-left p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors truncate">
                    <div className="text-sm text-blue-300 underline">Videonu aç</div>
                    <div className="text-xs text-white/60 truncate mt-1">{url}</div>
                  </button>
                ))}
              </div>
            ) : activeTab === 'news' ? (
              <ul className="space-y-3 max-w-3xl mx-auto">
                {newsItems.map((n, idx) => (
                  <li key={idx} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all">
                    <button onClick={() => dispatchOpenUrl(n.url)} className="text-left text-base font-semibold text-blue-400 hover:underline">{n.title}</button>
                    <div className="text-xs text-white/60 mt-1">{n.source} · {new Date(n.publishedAt).toLocaleString()}</div>
                    {n.summary && <p className="text-sm text-white/70 mt-1 line-clamp-2">{n.summary}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl mx-auto">
                {products.map((p, i) => (
                  <button key={i} onClick={() => dispatchOpenUrl(p.link)} className="text-left p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
                    <div className="text-sm font-medium text-white/90 line-clamp-2">{p.title}</div>
                    {p.price && <div className="text-xs text-green-400 mt-1">{p.price}</div>}
                    {p.source && <div className="text-[11px] text-white/60 mt-1">{p.source}</div>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Səhifələmə */}
      {results.length > 0 && (
        <div className="flex justify-center items-center gap-4 mt-4 max-w-2xl mx-auto w-full">
          {hasPrevPage && <button onClick={() => doSearch(page - 1)} className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors">Əvvəlki</button>}
          <span className="text-text-sub">Səhifə {page}</span>
          {hasNextPage && <button onClick={() => doSearch(page + 1)} className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors">Növbəti</button>}
        </div>
      )}
    </div>
  );
};