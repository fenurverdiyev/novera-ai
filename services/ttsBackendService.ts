// services/ttsBackendService.ts
// Tiny client for the FastAPI TTS backend. Keeps API keys on the server.

import type { VoiceOption } from '../types';

const BACKEND_URL = (import.meta.env.VITE_TTS_BACKEND_URL || '').replace(/\/$/, '');

function buildCandidates(path: string): string[] {
  const list: string[] = [];
  if (BACKEND_URL) list.push(`${BACKEND_URL}${path}`);
  list.push(path); // relative -> Vite proxy (ngrok-friendly)
  return list;
}

export interface TTSOptions {
  voiceId?: string;
  outputFormat?: string; // e.g. mp3_44100_128
}

// 1) Binary response -> returns a Blob URL suitable for <audio src>
export async function ttsBinary(text: string, opts: TTSOptions = {}): Promise<string> {
  const urls = buildCandidates('/api/tts');
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const resp = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: opts.voiceId, output_format: opts.outputFormat }),
      });
      if (!resp.ok) { lastErr = await safeText(resp); continue; }
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`TTS failed: ${lastErr?.message || lastErr}`);
}

// 2) Base64 response -> returns a Blob URL as well
export async function ttsBase64(text: string, opts: TTSOptions = {}): Promise<string> {
  const urls = buildCandidates('/api/tts?format=base64');
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const resp = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice_id: opts.voiceId, output_format: opts.outputFormat }),
      });
      if (!resp.ok) { lastErr = await safeText(resp); continue; }
      const { audio_base64 } = (await resp.json()) as { audio_base64: string };
      const byteStr = atob(audio_base64);
      const bytes = new Uint8Array(byteStr.length);
      for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      return URL.createObjectURL(blob);
    } catch (e) { lastErr = e; }
  }
  throw new Error(`TTS failed: ${lastErr?.message || lastErr}`);
}

// 3) Streaming endpoint URL -> usable directly in <audio src>
export function ttsStreamUrl(text: string, opts: { voiceId?: string } = {}): string {
  const params = new URLSearchParams();
  params.set('text', text);
  if (opts.voiceId) params.set('voice_id', opts.voiceId);
  if (BACKEND_URL) return `${BACKEND_URL}/api/tts/stream?${params.toString()}`;
  return `/api/tts/stream?${params.toString()}`;
}

export async function listVoices(): Promise<VoiceOption[]> {
  const urls = buildCandidates('/api/voices');
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const resp = await fetch(u);
      if (!resp.ok) { lastErr = await safeText(resp); continue; }
      const data = await resp.json();
      const voices = (data?.voices ?? []) as Array<{ id: string; name: string }>;
      return voices.map(v => ({ id: v.id, name: v.name }));
    } catch (e) { lastErr = e; }
  }
  throw new Error(`voices failed: ${lastErr?.message || lastErr}`);
}

// Extended voices API with metadata and recommended IDs
export interface VoiceMeta extends VoiceOption { gender?: string }
export interface VoicesResponse { voices: VoiceMeta[]; recommended?: string[] }

export async function fetchVoices(): Promise<VoicesResponse> {
  const urls = buildCandidates('/api/voices');
  let lastErr: any = null;
  for (const u of urls) {
    try {
      const resp = await fetch(u);
      if (!resp.ok) { lastErr = await safeText(resp); continue; }
      const data = await resp.json();
      const raw = (data?.voices ?? []) as Array<{ id: string; name: string; gender?: string }>;
      const voices: VoiceMeta[] = raw.map(v => ({ id: v.id, name: v.name, gender: v.gender }));
      const recommended = Array.isArray(data?.recommended) ? (data.recommended as string[]) : undefined;
      return { voices, recommended };
    } catch (e) { lastErr = e; }
  }
  throw new Error(`voices failed: ${lastErr?.message || lastErr}`);
}

async function safeText(resp: Response): Promise<string> {
  try { return await resp.text(); } catch { return ''; }
}
