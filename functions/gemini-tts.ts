// Serverless function: Gemini TTS (returns audio/wav)
// Runtime: Node.js (default)
import { GoogleGenAI } from '@google/genai';

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { text, voiceName } = await request.json();
    const t = (text || '').trim();
    const voice = (voiceName || 'Kore').trim();
    if (!t) {
      return new Response(JSON.stringify({ error: "Missing 'text'" }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const API_KEY = process.env.GEMINI_TTS_API_KEY 
      || process.env.VITE_GEMINI_TTS_API_KEY 
      || process.env.GEMINI_API_KEY 
      || process.env.VITE_GEMINI_API_KEY 
      || '';
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const client = new GoogleGenAI({ apiKey: API_KEY });

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [ { parts: [ { text: t } ] } ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    });

    const firstPart: any = response?.candidates?.[0]?.content?.parts?.[0];
    const inline = firstPart?.inlineData;
    if (!inline?.data) {
      return new Response(JSON.stringify({ error: 'No audio data returned' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const mime = inline.mimeType || 'audio/pcm';
    const base64 = inline.data as string; // base64-encoded
    const pcmBytes = Buffer.from(base64, 'base64');

    if (mime.includes('wav')) {
      return new Response(pcmBytes, { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    }

    // Assume PCM, wrap into WAV
    const wav = pcmToWav(pcmBytes);
    return new Response(Buffer.from(wav), { status: 200, headers: { 'Content-Type': 'audio/wav' } });

  } catch (err: any) {
    console.error('Gemini TTS error:', err);
    return new Response(JSON.stringify({ error: 'TTS failed', detail: err?.message || String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

function pcmToWav(pcmData: Uint8Array): Uint8Array {
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  // RIFF
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const wavBytes = new Uint8Array(44 + dataSize);
  wavBytes.set(new Uint8Array(header), 0);
  wavBytes.set(new Uint8Array(pcmData), 44);
  return wavBytes;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
