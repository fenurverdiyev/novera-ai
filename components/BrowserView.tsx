import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { SearchIcon, LoadingSpinner } from './Icons';
import { suggestAutocomplete, detectLocaleForSearch } from '../services/searchService';

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

export const BrowserView: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const debounceRef = useRef<number | null>(null);

  const doSearch = useCallback(async (pageIndex = 1) => {
    if (!query.trim()) {
      setError('Zəhmət olmasa, axtarış üçün sorğu daxil edin.');
      return;
    }
    if (!GOOGLE_API_KEY || !CX) {
      setError('Google Custom Search API açarı və ya CX konfiqurasiya edilməyib.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const start = (pageIndex - 1) * 10 + 1;
      const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${CX}&q=${encodeURIComponent(query)}&start=${start}`;
      const resp = await fetch(url);
      const data: SearchResponse = await resp.json();
      if (resp.ok && data.items) {
        const safe = data.items.filter(it => isSafeUrl(it.link));
        setResults(safe);
        setPage(pageIndex);
        // Auto-select first safe result for preview
        if (pageIndex === 1 && safe.length > 0) setPreviewUrl(safe[0].link);
      } else if (data.error) {
        setError(`Axtarış zamanı xəta: ${data.error.message}`);
        setResults([]);
      } else {
        setError('Axtarış nəticəsi tapılmadı.');
        setResults([]);
      }
    } catch (e) {
      console.error(e);
      setError('Şəbəkə xətası. İnternet bağlantısını yoxlayın.');
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  return (
    <div className="p-4 md:p-6 h-full grid grid-rows-[auto_auto_1fr] grid-cols-1 gap-3 text-text-main bg-bg-main/80 backdrop-blur-sm">
      {/* Search bar */}
      <form onSubmit={(e) => { e.preventDefault(); doSearch(1); }} className="w-full max-w-3xl mx-auto">
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
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/10 ring-1 ring-white/20">
              <SearchIcon className="w-4 h-4 text-white/80" />
            </span>
          </div>
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Vebdə axtarın..."
            onKeyDown={handleKeyDown}
            className="w-full bg-black/30 rounded-full py-3.5 pl-14 pr-6 text-white text-lg focus:outline-none focus:ring-2 focus:ring-accent/80 border border-white/20 ring-1 ring-white/10 backdrop-blur-md"
          />
        </div>
      </form>

      {/* Status */}
      <div className="text-center">
        {loading && <LoadingSpinner className="w-7 h-7 inline-block" />}
        {error && <div className="text-red-400 p-3 bg-red-900/40 rounded-lg max-w-2xl mx-auto">{error}</div>}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full overflow-hidden">
        {/* Results list */}
        <div className="overflow-y-auto pr-2">
          <ul className="space-y-3 max-w-3xl mx-auto">
            {results.map((item, i) => (
              <li key={i} className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                <button
                  className="text-left w-full"
                  onClick={() => setPreviewUrl(item.link)}
                  title={item.title}
                >
                  <div className="text-lg font-semibold text-blue-400 hover:underline">{item.title}</div>
                  <p className="text-sm text-text-sub mt-1">{item.snippet}</p>
                  <div className="text-xs text-green-500 mt-2 truncate">{item.link}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Preview panel */}
        <div className="h-full w-full bg-black/20 rounded-lg border border-white/10 overflow-hidden">
          {previewUrl ? (
            <iframe
              key={previewUrl}
              src={previewUrl}
              title="Səhifə önbaxışı"
              className="w-full h-full"
              sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-text-sub">Göstərmək üçün nəticə seçin</div>
          )}
        </div>
      </div>

      {/* Pagination */}
      {results.length > 0 && (
        <div className="flex justify-center items-center gap-4 mt-2">
          <button
            onClick={() => {
              const newPage = Math.max(1, page - 1);
              setPage(newPage);
              doSearch(newPage);
            }}
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
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
            className="px-4 py-2 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          >
            Növbəti
          </button>
        </div>
      )}
    </div>
  );
};
