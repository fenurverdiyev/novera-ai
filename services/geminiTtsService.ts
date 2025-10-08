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
    voiceName: opts.voiceName || 'Kore',
  } as const;

  const endpoints = [
    '/api/gemini-tts',
    '/functions/gemini-tts',
    '/.netlify/functions/gemini-tts',
    '/api/gemini-tts.ts',
    '/gemini-tts'
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
