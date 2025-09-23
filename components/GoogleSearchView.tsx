import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Logo } from './Logo';
import { SearchIcon, LoadingSpinner, MicrophoneIcon, CameraIcon } from './Icons';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';

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

// .env faylından açarları oxuyuruq (yeniləri ilə geriyə uyğun)
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_CSE_JSON_KEY || import.meta.env.VITE_GOOGLE_API_KEY;
const CX = import.meta.env.VITE_GOOGLE_CSE_CX || import.meta.env.VITE_GOOGLE_CSE_ID;

export const GoogleSearchView: React.FC = () => {
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

  const doSearch = useCallback(async (pageIndex = 1) => {
    if (!query.trim()) {
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
      const start = (pageIndex - 1) * 10 + 1;
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}&start=${start}`;
      
      const resp = await fetch(url);
      const data: SearchResponse = await resp.json();

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(1);
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
        doSearch(1);
      }
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
          <Logo isLarge={true} />
          <form onSubmit={handleSearchSubmit} className="w-full max-w-2xl mx-auto mt-8">
            <div className="relative flex items-center">
              {suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-2 w-full bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-2xl z-20 overflow-hidden">
                  {suggestions.map((sug, idx) => (
                    <button
                      key={sug}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); }}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => { setQuery(sug); setSuggestions([]); setActiveIndex(-1); doSearch(1); }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                      title={sug}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
              {/* Sol lens — şüşə dairə fon və yumşaq parıltı */}
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)]">
                  <SearchIcon className="w-4 h-4 text-white/80" />
                </span>
              </div>
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Axtarış edin və ya yazmağa başlayın..."
                onKeyDown={handleKeyDown}
                className="w-full bg-black/30 rounded-full py-4 pl-14 pr-24 text-white text-lg focus:outline-none focus:ring-2 focus:ring-accent/80 border border-white/20 ring-1 ring-white/10 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-3 text-white/80">
                <button type="button" className="p-2 rounded-full hover:bg-white/10"><MicrophoneIcon className="w-5 h-5" /></button>
                <button type="button" className="p-2 rounded-full hover:bg-white/10"><CameraIcon className="w-5 h-5" /></button>
              </div>
            </div>
          </form>
          <p className="text-2xl font-semibold text-text-main mt-4">Bu gün sizə necə kömək edə bilərəm?</p>
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
                      onClick={() => { setQuery(sug); setSuggestions([]); setActiveIndex(-1); doSearch(1); }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors truncate ${idx === activeIndex ? 'bg-accent/20 text-white' : 'text-white/90 hover:bg-white/15'}`}
                      title={sug}
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              )}
              <div className="absolute left-3 top-1/2 -translate-y-1/2">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20 shadow-[0_0_12px_rgba(255,255,255,0.25)]">
                  <SearchIcon className="w-4 h-4 text-white/80" />
                </span>
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
      {error && <div className="text-center text-red-400 p-4 bg-red-900/50 rounded-lg max-w-2xl mx-auto w-full">{error}</div>}

      {/* Nəticələr Bölməsi */}
      <div className="flex-grow overflow-y-auto pr-2 mt-4">
        {results.length > 0 && (
          <>
            <h2 className="text-xl font-bold mb-4 text-center text-white/80">Axtarış Nəticələri</h2>
            <ul className="space-y-4 max-w-2xl mx-auto">
                {results.map((item, i) => (
                  <li key={i} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-blue-400 hover:underline">
                      {item.title}
                    </a>
                    <p className="text-sm text-text-sub mt-1">{item.snippet}</p>
                    <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-xs text-green-500 mt-2 block truncate hover:underline">
                      {item.link}
                    </a>
                  </li>
                ))}
            </ul>
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