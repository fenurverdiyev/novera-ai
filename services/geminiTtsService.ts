function sanitizeAzeriTts(input: string): string {
  try {
    let s = (input || '').normalize('NFC');
    s = s.replace(/[\p{Extended_Pictographic}\p{So}]+/gu, ' ');
    s = s.replace(/[!?]+/g, '.');
    s = s.replace(/\s+([.,…])/g, '$1');
    s = s.replace(/\.{3,}/g, '…');
    s = s.replace(/[“”"\*_/<>|#`~^]+/g, '');
    s = s.replace(/\s+/g, ' ').trim();
    if (s && !/[.!?…]$/.test(s)) s += '.';
    return s;
  } catch { return (input || '').toString(); }
}

// services/geminiTtsService.ts
// Client for the Gemini TTS serverless function.
let ttsCooldownUntil = 0;
let lastKey = '';
let lastKeyAt = 0;

export interface GeminiTTSOptions {
  voiceName?: string; // e.g., 'Kore', 'Lira', etc.
}

/**
 * Converts text to speech using the Gemini TTS serverless function.
 * @param text The text to synthesize.
 * @param opts Configuration options like voiceName.
 * @returns A Blob URL suitable for <audio src>.
 */
export async function geminiTts(text: string, opts: GeminiTTSOptions = {}): Promise<string> {
  if (Date.now() < ttsCooldownUntil) {
    throw new Error('Gemini TTS temporarily unavailable (cooldown).');
  }
  const sText = sanitizeAzeriTts(text);
  const key = `${sText}::${opts.voiceName || 'Kore'}`;
  const now = Date.now();
  if (key === lastKey && (now - lastKeyAt) < 2500) {
    throw new Error('Gemini TTS skipped duplicate');
  }
  lastKey = key;
  lastKeyAt = now;
  const payload = {
    text: sText,
    voice_name: opts.voiceName || 'Kore',
  } as const;

  let endpoints = [
    // Always prefer same-origin /api proxy; this will work both on localhost and ngrok host
    '/api/gemini-tts',
    'http://127.0.0.1:8010/api/gemini-tts',
    'http://localhost:8010/api/gemini-tts',
    'http://0.0.0.0:8010/api/gemini-tts',
    'http://127.0.0.1:8000/api/gemini-tts',
    'http://localhost:8000/api/gemini-tts',
    'http://0.0.0.0:8000/api/gemini-tts'
  ].filter(Boolean);
  try {
    const isHttps = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
    if (isHttps) {
      // Under https (including ngrok), stick to same-origin '/api' and https localhost fallbacks only
      endpoints = endpoints.filter(u => u.startsWith('/') || u.startsWith('https://'));
    }
  } catch {}

  let lastErr: any = null;
  let hadRateLimit = false;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        try {
          const body = await resp.text();
          console.warn('Gemini TTS endpoint error', url, resp.status, body?.slice(0, 256));
        } catch {}
        if (resp.status === 429 || resp.status === 503) {
          // Back off more aggressively to avoid repeated hammering
          ttsCooldownUntil = Date.now() + 30_000;
          if (resp.status === 429) hadRateLimit = true;
          break; // stop trying other endpoints; rely on fallback
        }
        continue;
      }
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch (e) { lastErr = e; }
  }
  // Frontend fallback: direct Gemini REST if client key provided (for dev/testing)
  if (hadRateLimit) {
    throw new Error('Gemini TTS rate-limited; skipping direct fallback during cooldown');
  }
  try {
    const KEY = ((import.meta as any).env?.VITE_GEMINI_TTS_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY || '').toString().trim();
    const MODEL = ((import.meta as any).env?.VITE_GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts').toString();
    if (KEY) {
      const base = 'https://generativelanguage.googleapis.com';
      const primary = `${base}/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY)}`;
      const makeReq = (withMime: boolean) => ({
        contents: [{ role: 'user', parts: [{ text: payload.text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          ...(withMime ? { responseMimeType: 'audio/wav', response_mime_type: 'audio/wav' } : {}),
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: opts.voiceName || payload.voice_name } } },
        },
      });
      const tryFetch = async (url0: string, body: any) => fetch(url0, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      let r = await tryFetch(primary, makeReq(true));
      if (!r.ok) {
        if (r.status === 400) {
          try {
            const txt = await r.text();
            if (/allowed mimetypes|response[_]?mime/i.test(txt)) {
              r = await tryFetch(primary, makeReq(false));
            }
          } catch {}
        }
      }
      if (!r.ok && (r.status === 404 || r.status === 400)) {
        // try alt preview/native-audio models on v1beta
        const altModels = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-native-audio-preview-09-2025'];
        for (const am of altModels) {
          const altUrl = `${base}/v1beta/models/${encodeURIComponent(am)}:generateContent?key=${encodeURIComponent(KEY)}`;
          r = await tryFetch(altUrl, makeReq(true));
          if (!r.ok && r.status === 400) { r = await tryFetch(altUrl, makeReq(false)); }
          if (r.ok) break;
        }
      }
      if (!r.ok) {
        if (r.status === 429 || r.status === 503) { ttsCooldownUntil = Date.now() + 30_000; }
        throw new Error(`Gemini direct error ${r.status}`);
      }
      const data = await r.json();
      const parts = ((data?.candidates?.[0]?.content?.parts) || []) as any[];
      const inline = parts.find(p => p?.inlineData || p?.inline_data)?.inlineData || parts.find(p => p?.inline_data)?.inline_data;
      const mime = (inline?.mimeType || inline?.mime_type || 'audio/wav') as string;
      const b64 = inline?.data as string;
      if (!b64) throw new Error('Gemini direct: no inline audio');
      const byteStr = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const lower = (mime || '').toLowerCase();
      let blob: Blob;
      if (!mime || /pcm|l16|raw/.test(lower)) {
        // Wrap raw PCM into WAV (mono, 24000Hz)
        const channels = 1;
        const rate = 24000;
        const bytesPerSample = 2;
        const blockAlign = channels * bytesPerSample;
        const byteRate = rate * blockAlign;
        const dataSize = bytes.byteLength;
        const header = new ArrayBuffer(44);
        const view = new DataView(header);
        const writeString = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, rate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);
        const wav = new Uint8Array(44 + dataSize);
        wav.set(new Uint8Array(header), 0);
        wav.set(bytes, 44);
        blob = new Blob([wav.buffer], { type: 'audio/wav' });
      } else {
        blob = new Blob([bytes.buffer.slice(0)], { type: mime || 'audio/wav' });
      }
      return URL.createObjectURL(blob);
    }
  } catch (e) { lastErr = e; }
  throw new Error('Gemini TTS: no working endpoint. Last error: ' + (lastErr?.message || lastErr));
}

export function geminiTtsCooldownMsRemaining(): number {
  return Math.max(0, ttsCooldownUntil - Date.now());
}
