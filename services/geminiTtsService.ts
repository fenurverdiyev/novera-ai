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
  const resp = await fetch('/api/gemini-tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voiceName: opts.voiceName || 'Kore', // Default voice
    }),
  });

  if (!resp.ok) {
    let errorDetails = '';
    try {
      const errJson = await resp.json();
      errorDetails = errJson.error || JSON.stringify(errJson);
    } catch (e) {
      errorDetails = await resp.text();
    }
    throw new Error(`Gemini TTS failed: ${resp.status} - ${errorDetails}`);
  }

  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}
