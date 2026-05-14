import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { XIcon } from './Icons';

interface ProxyBrowserOverlayProps {
  url: string;
  open: boolean;
  onClose: () => void;
}

export const ProxyBrowserOverlay: React.FC<ProxyBrowserOverlayProps> = ({ url, open, onClose }) => {
  const [theme, setTheme] = useState<'glass' | 'dark' | 'light'>('glass');
  const [input, setInput] = useState('');
  const [src, setSrc] = useState(url);
  const [mode, setMode] = useState<'original' | 'proxy'>('proxy');

  const proxyBase = useMemo(() => {
    try { return new URL(url).origin; } catch { return url; }
  }, [url]);

  const toProxy = useCallback((target: string) => {
    const base = proxyBase; // already origin without trailing path
    const encoded = encodeURIComponent(target);
    return `${base}/?url=${encoded}`;
  }, [proxyBase]);

  // On open, default to Google homepage via Worker so istifadəçi dərhal axtarış edə bilsin
  useEffect(() => {
    if (open) {
      setSrc(toProxy('https://www.google.com/'));
      setInput('');
    }
  }, [open, toProxy]);

  const openWorkerHome = () => setSrc(toProxy('https://www.google.com/'));
  const openGoogleHome = () => setSrc(toProxy('https://www.google.com/'));
  const goTo = () => {
    const v = input.trim();
    if (!v) return;
    if (v.startsWith('http://') || v.startsWith('https://')) {
      setSrc(toProxy(v)); setMode('proxy');
    } else {
      const q = encodeURIComponent(v);
      setSrc(toProxy(`https://www.google.com/search?q=${q}`)); setMode('proxy');
    }
  };

  const normalize = (v: string) => {
    const s = v.trim();
    if (!s) return '';
    if (s.startsWith('http://') || s.startsWith('https://')) return s;
    return `https://www.google.com/search?q=${encodeURIComponent(s)}`;
  };

  const isProxied = (u: string) => {
    try {
      const x = new URL(u);
      if (x.origin !== proxyBase) return false;
      return !!x.searchParams.get('url');
    } catch {
      return false;
    }
  };

  const extractOriginal = (u: string) => {
    try {
      const x = new URL(u);
      if (x.origin === proxyBase) {
        const p = x.searchParams.get('url');
        if (p) return decodeURIComponent(p);
      }
    } catch {}
    return u;
  };

  const openIframeOriginal = () => {
    const typed = normalize(input);
    if (typed) { setSrc(typed); return; }
    // No input: switch current src to original if it's proxied; otherwise keep as is
    const original = isProxied(src) ? extractOriginal(src) : src;
    setSrc(original); setMode('original');
  };

  const openProxied = () => {
    const typed = normalize(input);
    if (typed) { setSrc(toProxy(typed)); setMode('proxy'); return; }
    // No input: proxy current src if not already proxied
    const target = isProxied(src) ? src : toProxy(src);
    setSrc(target); setMode('proxy');
  };

  if (!open) return null;

  const shellCls = theme === 'glass' ? 'bg-black/70 backdrop-blur-sm' : theme === 'dark' ? 'bg-black' : 'bg-white';
  const barCls = theme === 'light' ? 'bg-white/70 text-black border-black/10' : 'bg-black/40 text-white border-white/10';
  const iconColor = theme === 'light' ? 'text-black' : 'text-white';
  const inputCls = theme === 'light' ? 'bg-white/80 text-black placeholder-black/50' : 'bg-white/10 text-white placeholder-white/50';
  const btnCls = theme === 'light' ? 'hover:bg-black/5' : 'hover:bg-white/10';

  return (
    <div className={`fixed inset-0 z-[9999] ${shellCls} flex flex-col`}>
      <div className={`h-12 flex items-center gap-2 px-3 border-b ${barCls}`}>
        <div className="text-sm font-medium select-none">Novera Brauzer</div>
        <button onClick={openWorkerHome} className={`px-2 h-8 rounded ${btnCls}`}>Home</button>
        <button onClick={openGoogleHome} className={`px-2 h-8 rounded ${btnCls}`}>Google</button>
        <div className={`flex items-center gap-2 flex-1`}>
          <input
            className={`w-full h-9 px-3 rounded-md outline-none border border-white/10 ${inputCls}`}
            placeholder="URL və ya Google axtarış"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') goTo(); }}
          />
          <button onClick={goTo} className={`px-3 h-9 rounded-md ${btnCls}`}>Get</button>
          <button onClick={openIframeOriginal} className={`px-3 h-9 rounded-md ${btnCls}`}>{mode === 'original' ? '✓ iframe' : 'iframe'}</button>
          <button onClick={openProxied} className={`px-3 h-9 rounded-md ${btnCls}`}>{mode === 'proxy' ? '✓ orginal' : 'orginal'}</button>
        </div>
        <select
          className={`h-9 px-2 rounded-md border border-white/10 ${inputCls}`}
          value={theme}
          onChange={(e) => setTheme(e.target.value as any)}
        >
          <option value="glass">Glass</option>
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
        <button onClick={onClose} className={`w-9 h-9 rounded-md flex items-center justify-center ${btnCls}`}>
          <XIcon className={`w-5 h-5 ${iconColor}`} />
        </button>
      </div>
      <div className="flex-1">
        <iframe src={src} className="w-full h-full border-0" allow="autoplay; microphone; camera; fullscreen; clipboard-read; clipboard-write" title="Novera Browser" />
      </div>
    </div>
  );
};
