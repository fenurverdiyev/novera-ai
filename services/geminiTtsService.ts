// services/geminiTtsService.ts
// Client for the Gemini TTS serverless function.

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
  const payload = {
    text,
    voice_name: opts.voiceName || 'Kore',
  } as const;

  const ORIGIN = (import.meta as any).env?.VITE_BACKEND_ORIGIN || (import.meta as any).env?.VITE_TTS_BACKEND_URL || '';
  const abs = ORIGIN ? [`${ORIGIN.replace(/\/$/, '')}/api/gemini-tts`] : [];
  const endpoints = [
    ...abs,
    '/api/gemini-tts',
    '/functions/gemini-tts',
    '/.netlify/functions/gemini-tts',
    '/api/gemini-tts.ts',
    '/gemini-tts',
    'http://localhost:8000/api/gemini-tts',
    'http://localhost:8001/api/gemini-tts',
    'http://127.0.0.1:8000/api/gemini-tts',
    'http://0.0.0.0:8000/api/gemini-tts'
  ];

  let lastErr: any = null;
  for (const url of endpoints) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        try { console.warn('Gemini TTS endpoint error', url, resp.status, await resp.text()); } catch {}
        continue;
      }
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch (e) { lastErr = e; }
  }
  throw new Error('Gemini TTS: no working endpoint. Last error: ' + (lastErr?.message || lastErr));
}
