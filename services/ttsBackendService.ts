// services/ttsBackendService.ts
// Tiny client for the FastAPI TTS backend. Keeps API keys on the server.

import type { VoiceOption } from '../types';

const BACKEND_URL = (import.meta.env.VITE_TTS_BACKEND_URL || '').replace(/\/$/, '');

function ensureBackend(): string {
  if (!BACKEND_URL) {
    throw new Error('VITE_TTS_BACKEND_URL is not set. Start the FastAPI backend and set this env var.');
  }
  return BACKEND_URL;
}

export interface TTSOptions {
  voiceId?: string;
  outputFormat?: string; // e.g. mp3_44100_128
}

// 1) Binary response -> returns a Blob URL suitable for <audio src>
export async function ttsBinary(text: string, opts: TTSOptions = {}): Promise<string> {
  const base = ensureBackend();
  const resp = await fetch(`${base}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: opts.voiceId,
      output_format: opts.outputFormat,
    }),
  });
  if (!resp.ok) {
    const err = await safeText(resp);
    throw new Error(`TTS failed: ${resp.status} ${err}`);
  }
  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

// 2) Base64 response -> returns a Blob URL as well
export async function ttsBase64(text: string, opts: TTSOptions = {}): Promise<string> {
  const base = ensureBackend();
  const resp = await fetch(`${base}/api/tts?format=base64`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      voice_id: opts.voiceId,
      output_format: opts.outputFormat,
    }),
  });
  if (!resp.ok) {
    const err = await safeText(resp);
    throw new Error(`TTS failed: ${resp.status} ${err}`);
  }
  const { audio_base64 } = (await resp.json()) as { audio_base64: string };
  const byteStr = atob(audio_base64);
  const bytes = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
  const blob = new Blob([bytes], { type: 'audio/mpeg' });
  return URL.createObjectURL(blob);
}

// 3) Streaming endpoint URL -> usable directly in <audio src>
export function ttsStreamUrl(text: string, opts: { voiceId?: string } = {}): string {
  const base = ensureBackend();
  const params = new URLSearchParams();
  params.set('text', text);
  if (opts.voiceId) params.set('voice_id', opts.voiceId);
  return `${base}/api/tts/stream?${params.toString()}`;
}

export async function listVoices(): Promise<VoiceOption[]> {
  const base = ensureBackend();
  const resp = await fetch(`${base}/api/voices`);
  if (!resp.ok) {
    const err = await safeText(resp);
    throw new Error(`voices failed: ${resp.status} ${err}`);
  }
  const data = await resp.json();
  const voices = (data?.voices ?? []) as Array<{ id: string; name: string }>
  return voices.map(v => ({ id: v.id, name: v.name }));
}

// Extended voices API with metadata and recommended IDs
export interface VoiceMeta extends VoiceOption { gender?: string }
export interface VoicesResponse { voices: VoiceMeta[]; recommended?: string[] }

export async function fetchVoices(): Promise<VoicesResponse> {
  const base = ensureBackend();
  const resp = await fetch(`${base}/api/voices`);
  if (!resp.ok) {
    const err = await safeText(resp);
    throw new Error(`voices failed: ${resp.status} ${err}`);
  }
  const data = await resp.json();
  const raw = (data?.voices ?? []) as Array<{ id: string; name: string; gender?: string }>;
  const voices: VoiceMeta[] = raw.map(v => ({ id: v.id, name: v.name, gender: v.gender }));
  const recommended = Array.isArray(data?.recommended) ? (data.recommended as string[]) : undefined;
  return { voices, recommended };
}

async function safeText(resp: Response): Promise<string> {
  try { return await resp.text(); } catch { return ''; }
}
