/**
 * hooks/useAuth.ts
 * Mərkəzi auth hook — Google OAuth + JWT + history sync
 */
import { useState, useEffect, useCallback } from 'react';
import type { Message } from '../types';

// Use relative URL for mobile compatibility (via Vite proxy)
const VERTEX_URL = '';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
  provider: 'google' | 'local';
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isGuest: boolean;
  isLoading: boolean;
}

const TOKEN_KEY = 'nov-era-google-token';
const USER_KEY  = 'nov-era-google-user';

function loadStored(): { user: AuthUser | null; token: string | null } {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    const u = localStorage.getItem(USER_KEY);
    if (t && u) return { user: JSON.parse(u), token: t };
  } catch {}
  return { user: null, token: null };
}

export function useAuth() {
  const stored = loadStored();
  const [user, setUser]     = useState<AuthUser | null>(stored.user);
  const [token, setToken]   = useState<string | null>(stored.token);
  const [isLoading, setIsLoading] = useState(false);

  const isGuest = !user;

  // ─── Google login callback (GoogleLoginButton-dan gəlir) ──────────────────
  const loginWithGoogle = useCallback((data: { user: any; token: string }) => {
    const u: AuthUser = {
      id:       data.user.id || data.user.sub || '',
      name:     data.user.name || '',
      email:    data.user.email || '',
      picture:  data.user.picture || '',
      provider: 'google',
    };
    setUser(u);
    setToken(data.token);
    try {
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      // Profil məlumatlarını da sinxronlaşdır
      localStorage.setItem('nov-era-auth', u.email);
      localStorage.setItem('nov-era-profile', JSON.stringify({ name: u.name, email: u.email }));
      if (u.picture) localStorage.setItem('nov-era-avatar', u.picture);
    } catch {}
  }, []);

  // ─── Çıxış ────────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem('nov-era-auth');
      localStorage.removeItem('nov-era-profile');
    } catch {}
  }, []);

  // ─── Tarixçəni backend-ə saxla ────────────────────────────────────────────
  const saveHistoryToCloud = useCallback(async (messages: Message[]) => {
    const t = token;
    if (!t || !messages.length) return;
    try {
      await fetch(`${VERTEX_URL}/api/history/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${t}`,
        },
        body: JSON.stringify({ history: messages }),
      });
    } catch { /* silent fail */ }
  }, [token]);

  // ─── Tarixçəni backend-dən yüklə ─────────────────────────────────────────
  const loadHistoryFromCloud = useCallback(async (): Promise<Message[]> => {
    const t = token;
    if (!t) return [];
    setIsLoading(true);
    try {
      const r = await fetch(`${VERTEX_URL}/api/history/load`, {
        headers: { 'Authorization': `Bearer ${t}` },
      });
      if (!r.ok) return [];
      const data = await r.json();
      return (data.history || []) as Message[];
    } catch {
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  return {
    user,
    token,
    isGuest,
    isLoading,
    loginWithGoogle,
    logout,
    saveHistoryToCloud,
    loadHistoryFromCloud,
  };
}
