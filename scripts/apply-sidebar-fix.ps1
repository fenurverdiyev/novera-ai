param()
$ErrorActionPreference = 'Stop'

$content = @'
import React, { useEffect, useState, useRef } from 'react';
import type { AppView, Message } from '../types';
import { SearchIcon, NewsIcon, WeatherIcon, TranslateIcon, SettingsIcon, UserIcon, PlusIcon, SparklesIcon, BookmarkIcon, CloseIcon, GlobeIcon } from './Icons';
import { Logo } from './Logo';

interface SidebarProps {
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  themeColor?: string;
  onNewChat?: () => void;
  onOpenSession?: (messages: Message[]) => void;
}

const navItems = [
  { id: 'google-search', icon: GlobeIcon, label: 'Brauzer' },
  { id: 'search', icon: SparklesIcon, label: 'Al' },
  { id: 'news', icon: NewsIcon, label: 'Xəbərlər' },
  { id: 'weather', icon: WeatherIcon, label: 'Hava' },
  { id: 'translate', icon: TranslateIcon, label: 'Tərcümə' },
  { id: 'profile', icon: UserIcon, label: 'Profil' },
  { id: 'settings', icon: SettingsIcon, label: 'Ayarlar' },
] as const;

type Session = { id: number; title: string; time: number; messages: Message[] };

export const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView, themeColor, onNewChat, onOpenSession }) => {
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

  const clearAll = () => {
    try {
      localStorage.removeItem('nov-era-sessions');
      localStorage.removeItem('nov-era-chat-history');
      setSessions([]);
      try { window.dispatchEvent(new Event('nov-era-sessions-updated' as any)); } catch {}
      try { window.dispatchEvent(new Event('nov-era-clear-chat-now' as any)); } catch {}
    } catch {}
  };

  return (
    <nav className="w-60 bg-bg-slate/90 backdrop-blur-sm flex flex-col py-4 border-r border-white/10">
      <div className="px-4 mb-4 flex items-center justify-between gap-2">
        <Logo />
        <button
          onClick={onNewChat}
          className="p-2 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-colors ring-1 ring-accent/40 shadow-[0_0_8px_rgba(88,166,255,0.35)]"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto mt-2">
        <div className="px-2 space-y-1">
          {navItems.map((item) => {
            const isActive = activeView === item.id as AppView;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id as AppView)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors relative ${
                  isActive ? 'text-white bg-accent/20 ring-1 ring-accent/50 shadow-[0_0_12px_rgba(88,166,255,0.5)] translate-y-px' : 'text-text-sub hover:text-text-main hover:bg:white/5'
                }`}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                style={isActive && themeColor ? { boxShadow: `0 0 12px ${themeColor}` } : undefined}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* History section under nav */}
        <div className="mt-4 pt-3 border-t border-white/10 px-2">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
              <BookmarkIcon className="w-4 h-4" />
              Keçmiş
            </div>
            {sessions.length > 0 && (
              <button onClick={clearAll} className="text-[11px] text-white/60 hover:text-white/80 px-2 py-1 rounded hover:bg-white/10">
                Hamısını sil
              </button>
            )}
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
        <div className="flex items-center gap-3 p-2 rounded-lg bg:white/5">
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
};
'@

Set-Content -LiteralPath 'd:\NovEra\NovEra\components\Sidebar.tsx' -Value $content -Encoding UTF8
Write-Host 'Sidebar.tsx rewritten with Clear All.'
