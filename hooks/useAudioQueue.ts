import { useCallback, useEffect, useRef, useState } from 'react';
import { textToSpeech } from '../services/elevenLabsService';

export interface QueueItem {
  text: string;
  url?: string;
  isLoaded: boolean;
  isPlaying: boolean;
}

export function useAudioQueue(voiceId?: string, preloadCount: number = 3) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState<number>(-1);
  const urlsRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  const cleanupUrls = useCallback(() => {
    urlsRef.current.forEach((u) => {
      try { if (u && u.startsWith('blob:')) URL.revokeObjectURL(u); } catch {}
    });
    urlsRef.current = [];
  }, []);

  useEffect(() => () => cleanupUrls(), [cleanupUrls]);

  const splitSentences = useCallback((text: string): string[] => {
    return text.match(/[^.!?…]+[.!?…]*|[^.!?…]+$/g)?.map(s => s.trim()).filter(Boolean) || [];
  }, []);

  const enqueueText = useCallback((text: string) => {
    const sentences = splitSentences(text);
    const items: QueueItem[] = sentences.map(s => ({ text: s, isLoaded: false, isPlaying: false }));
    setQueue(items);
    setIndex(-1);
    isPlayingRef.current = false;

    // Preload first N
    const preload = async (i: number) => {
      const item = items[i];
      if (!item) return;
      try {
        const url = await textToSpeech(item.text, voiceId);
        urlsRef.current.push(url);
        setQueue(prev => prev.map((it, idx) => idx === i ? { ...it, url, isLoaded: true } : it));
      } catch {}
    };
    for (let i = 0; i < Math.min(preloadCount, items.length); i++) preload(i);
  }, [splitSentences, voiceId, preloadCount]);

  const playNext = useCallback(async () => {
    if (isPlayingRef.current) return;
    const next = index + 1;
    const item = queue[next];
    if (!item) return;

    setIndex(next);
    isPlayingRef.current = true;

    let url = item.url;
    if (!url && !item.isLoaded) {
      try {
        url = await textToSpeech(item.text, voiceId);
        urlsRef.current.push(url);
        setQueue(prev => prev.map((it, idx) => idx === next ? { ...it, url, isLoaded: true } : it));
      } catch {
        isPlayingRef.current = false;
        return;
      }
    }

    if (url && audioRef.current) {
      audioRef.current.src = url;
      try { await audioRef.current.play(); } catch {}
    }

    // background preload further ahead
    const ahead = next + preloadCount;
    if (queue[ahead] && !queue[ahead].isLoaded) {
      textToSpeech(queue[ahead].text, voiceId).then(u => {
        if (u) {
          urlsRef.current.push(u);
          setQueue(prev => prev.map((it, idx) => idx === ahead ? { ...it, url: u, isLoaded: true } : it));
        }
      }).catch(() => {});
    }
  }, [index, queue, voiceId, preloadCount]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => {
      isPlayingRef.current = false;
      setTimeout(() => playNext(), 120);
    };
    el.addEventListener('ended', onEnded);
    return () => el.removeEventListener('ended', onEnded);
  }, [playNext]);

  const start = useCallback(() => {
    setTimeout(() => playNext(), 200);
  }, [playNext]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      audioRef.current.src = '';
    }
    isPlayingRef.current = false;
    setIndex(-1);
    setQueue([]);
    cleanupUrls();
  }, [cleanupUrls]);

  return { audioRef, queue, index, enqueueText, start, stop, playNext };
}
