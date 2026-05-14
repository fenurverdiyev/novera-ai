import React, { useEffect, useState, useRef } from 'react';
import type { AppView, Message } from '../types';
import { SearchIcon, NewsIcon, WeatherIcon, TranslateIcon, SettingsIcon, UserIcon, PlusIcon, SparklesIcon, BookmarkIcon, CloseIcon, GlobeIcon } from './Icons';
import { Logo } from './Logo';
import { getTranslation, Language } from '../utils/translations';

interface SidebarProps {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  themeColor?: string;
  onNewChat?: () => void;
  onOpenSession?: (messages: Message[]) => void;
  language: Language;
}

const navItems = [
  { id: 'google-search', icon: GlobeIcon, label: 'browser' },
  { id: 'search', icon: SparklesIcon, label: 'ai' },
  { id: 'news', icon: NewsIcon, label: 'news' },
  { id: 'weather', icon: WeatherIcon, label: 'weather' },
  { id: 'translate', icon: TranslateIcon, label: 'translate' },
  { id: 'profile', icon: UserIcon, label: 'profile' },
  { id: 'settings', icon: SettingsIcon, label: 'settings' },
] as const;

type Session = { id: number; title: string; time: number; messages: Message[] };

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, themeColor, onNewChat, onOpenSession, language }) => {
  const t = (key: any) => getTranslation(language, key);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [contextId, setContextId] = useState<number | null>(null);
  const [contextPos, setContextPos] = useState<{ x: number; y: number } | null>(null);
  
  const longPressRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      setAccountEmail(localStorage.getItem('nov-era-auth'));
      setAvatar(localStorage.getItem('nov-era-avatar'));
    } catch {}
  }, []);

  

  const refreshSessions = () => {
    try {
      const raw = localStorage.getItem('nov-era-sessions');
      const list: Session[] = raw ? JSON.parse(raw) : [];
      setSessions(list);
    } catch { setSessions([]); }
  };

  

  useEffect(() => {
    refreshSessions();
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'nov-era-sessions') refreshSessions();
    };
    window.addEventListener('storage', onStorage);
    const onCustom = () => refreshSessions();
    // same-document updates won't trigger 'storage' event; listen to a custom event
    window.addEventListener('nov-era-sessions-updated' as any, onCustom as any);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('nov-era-sessions-updated' as any, onCustom as any);
    };
  }, []);

  const handleLongPressStart = (e: React.PointerEvent, id: number) => {
    const { clientX, clientY } = e;
    if (longPressRef.current) window.clearTimeout(longPressRef.current);
    longPressRef.current = window.setTimeout(() => {
      setContextId(id);
      setContextPos({ x: clientX + 6, y: clientY + 6 });
    }, 1200); // ~2s long press
  };
  const clearLongPress = () => {
    if (longPressRef.current) {
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const closeContext = () => { setContextId(null); setContextPos(null); };
  const openSession = (s: Session) => { onOpenSession?.(s.messages); closeContext(); };
  const deleteSession = (id: number) => {
    try {
      const raw = localStorage.getItem('nov-era-sessions');
      const list: Session[] = raw ? JSON.parse(raw) : [];
      const next = list.filter(s => s.id !== id);
      localStorage.setItem('nov-era-sessions', JSON.stringify(next));
      setSessions(next);
    } catch {}
    closeContext();
  };

  return (
    <nav className="w-60 bg-bg-slate/90 backdrop-blur-sm flex flex-col py-4 border-r border-white/10">
      <div className="px-4 mb-4 flex items-center justify-between gap-2">
        <Logo />
        <button
          onClick={() => {
            if (onNewChat) {
              onNewChat();
              setActiveView('search');
            }
          }}
          className="p-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors ring-1 ring-accent/40 shadow-[0_0_8px_rgba(88,166,255,0.35)]"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mt-2">
        <div className="px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all relative ${
                  isActive 
                    ? 'text-white bg-white/10 border border-white/10 shadow-lg shadow-black/20' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
                aria-label={t(item.label)}
                aria-current={isActive ? 'page' : undefined}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span className="text-sm font-semibold">{t(item.label)}</span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-400 rounded-r-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* History section under nav */}
        <div className="mt-4 pt-3 border-t border-white/10 px-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-slate-500">
              {t('history')}
            </div>
            <button
              onClick={() => { try { window.dispatchEvent(new Event('nov-era-clear-all' as any)); } catch {} }}
              className="text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 border border-white/5 transition-colors"
              title={t('clearAll')}
            >
              {t('clearAll')}
            </button>
          </div>
          <div className="mt-2 space-y-1">
            {sessions.slice(0, 8).map(s => (
              <button
                key={s.id}
                onClick={() => openSession(s)}
                onPointerDown={(e) => handleLongPressStart(e, s.id)}
                onPointerUp={clearLongPress}
                onPointerLeave={clearLongPress}
                className="group w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 text-white/80 hover:text-white transition-colors"
                title={new Date(s.time).toLocaleString()}
              >
                <div className="truncate text-sm">{s.title || 'Adsız söhbət'}</div>
                <div className="text-[10px] text-white/50 group-hover:text-white/60">{new Date(s.time).toLocaleDateString()}</div>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="px-3 py-2 text-xs text-white/50">Hələ keçmiş yoxdur</div>
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pt-3 border-t border-white/10">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
          <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10 border border-white/20 flex items-center justify-center">
            {avatar ? (
              <img src={avatar} alt="Profil" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-5 h-5 text-white/80" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-xs text-white/60">Hesab</div>
            <div className="text-sm text-white/90 truncate">{accountEmail || 'Qonaq'}</div>
          </div>
        </div>
      </div>

      {/* Context menu for history (fixed position) */}
      {contextId && contextPos && (
        <div className="fixed z-50" style={{ left: contextPos.x, top: contextPos.y }} onMouseLeave={closeContext}>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
            <button onClick={() => {
              const s = sessions.find(ss => ss.id === contextId);
              if (s) openSession(s);
            }} className="w-full text-left px-4 py-2 text-sm hover:bg-white/15 text-white/90">Aç</button>
            <button onClick={() => deleteSession(contextId)} className="w-full text-left px-4 py-2 text-sm hover:bg-white/15 text-rose-300">Sil</button>
            <button onClick={closeContext} className="w-full text-left px-4 py-2 text-sm hover:bg-white/15 text-white/70 flex items-center gap-2"><CloseIcon className="w-4 h-4" />Bağla</button>
          </div>
        </div>
      )}
    </nav>
  );
}