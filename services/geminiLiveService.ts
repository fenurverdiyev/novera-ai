// services/geminiLiveService.ts
// Gemini Live API client for browser using ephemeral tokens from backend.
// WARNING: Requires backend route /api/gemini-live-token and npm dep '@google/genai'.

let liveSession: any = null;
let isOpen = false;
let flushTimer: number | null = null;
let pendingInt16: Int16Array | null = null;
let pendingLength = 0;
let onAudioCb: ((url: string) => void) | null = null;
let lastLiveText: string = '';

// Accumulate server audio base64 chunks for the current turn
let outChunks: string[] = [];

const TARGET_SEND_RATE = 16000; // Hz (input requirement)
const TARGET_PLAYBACK_RATE = 24000; // Hz (output from model)

// Utility: encode Int16Array -> base64
function int16ToBase64(i16: Int16Array): string {
  const buf = new Uint8Array(i16.buffer, i16.byteOffset, i16.byteLength);
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

// Utility: wrap Int16 PCM into WAV (LE) with given sample rate
function wavFromInt16(int16: Int16Array, sampleRate: number, channels = 1): Blob {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = int16.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  let offset = 0;
  function writeString(s: string) { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); }
  function writeUint32(v: number) { view.setUint32(offset, v, true); offset += 4; }
  function writeUint16(v: number) { view.setUint16(offset, v, true); offset += 2; }
  // RIFF header
  writeString('RIFF');
  writeUint32(36 + dataSize);
  writeString('WAVE');
  writeString('fmt ');
  writeUint32(16); // PCM
  writeUint16(1); // PCM format
  writeUint16(channels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(16); // bits per sample
  writeString('data');
  writeUint32(dataSize);
  // PCM data
  const out = new Int16Array(buffer, 44, int16.length);
  out.set(int16);
  return new Blob([buffer], { type: 'audio/wav' });
}

// Resample Float32 PCM to 16k Int16 PCM
function resampleTo16k(intput: Float32Array, inRate: number): Int16Array {
  const input = intput;
  if (inRate === TARGET_SEND_RATE) {
    // Just convert float32 -> int16
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
    }
    return out;
  }
  const ratio = TARGET_SEND_RATE / inRate;
  const newLen = Math.max(1, Math.round(input.length * ratio));
  const out = new Int16Array(newLen);
  let pos = 0;
  for (let i = 0; i < newLen; i++) {
    const t = i / ratio;
    const i0 = Math.floor(t);
    const i1 = Math.min(input.length - 1, i0 + 1);
    const frac = t - i0;
    const sample = (1 - frac) * input[i0] + frac * input[i1];
    const s = Math.max(-1, Math.min(1, sample));
    out[pos++] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

// Flush pendingInt16 every ~80ms as base64 PCM frames to session
function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    if (!isOpen || !liveSession || !pendingInt16 || pendingLength === 0) return;
    const chunk = pendingInt16.subarray(0, pendingLength);
    const b64 = int16ToBase64(chunk);
    try {
      liveSession.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } });
    } catch {}
    // reset buffer
    pendingLength = 0;
  }, 80);
}

function pushAudioChunkBase64(b64: string | undefined | null) {
  if (!b64 || typeof b64 !== 'string' || !b64.length) return;
  outChunks.push(b64);
}

function flushAudioChunks() {
  if (!outChunks.length) return null;
  try {
    let totalBytes = 0;
    const bufs: Uint8Array[] = outChunks.map((b64) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      totalBytes += arr.length;
      return arr;
    });
    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const u of bufs) { merged.set(u, offset); offset += u.length; }
    const i16 = new Int16Array(merged.buffer, merged.byteOffset, merged.byteLength / 2);
    const wav = wavFromInt16(i16, TARGET_PLAYBACK_RATE, 1);
    const url = URL.createObjectURL(wav);
    outChunks = [];
    return url;
  } catch (e) {
    console.warn('Failed to assemble Live audio', e);
    outChunks = [];
    return null;
  }
}

export async function connectGeminiLive(options?: { model?: string; systemInstruction?: string; onAudio?: (url: string) => void; }): Promise<boolean> {
  onAudioCb = options?.onAudio || null;
  try {
    // 1) Get ephemeral token from backend
    const ORIGIN = (import.meta as any).env?.VITE_BACKEND_ORIGIN || (import.meta as any).env?.VITE_TTS_BACKEND_URL || '';
    const abs = ORIGIN ? [`${ORIGIN.replace(/\/$/, '')}/api/gemini-live-token`] : [];
    const tokenEndpoints = [
      ...abs,
      '/api/gemini-live-token',
      'http://localhost:8000/api/gemini-live-token',
      'http://localhost:8001/api/gemini-live-token',
      'http://127.0.0.1:8000/api/gemini-live-token',
      'http://0.0.0.0:8000/api/gemini-live-token',
    ];
    let tokenResp: Response | null = null;
    for (const u of tokenEndpoints) {
      try {
        const r = await fetch(u, { method: 'POST' });
        if (r.ok) { tokenResp = r; break; }
      } catch {}
    }
    if (!tokenResp) return false;
    if (!tokenResp.ok) {
      console.warn('Gemini Live token endpoint error', tokenResp.status, await tokenResp.text());
      return false;
    }
    const { token } = await tokenResp.json();

    // 2) Dynamically import to avoid bundling error when not installed
    const importer = (Function('m', 'return import(m)') as any);
    const { GoogleGenAI, Modality } = await importer('@google/genai');
    const ai = new GoogleGenAI({ apiKey: token });

    const modelCandidates = [
      options?.model,
      (import.meta as any).env?.VITE_GEMINI_LIVE_MODEL,
      'gemini-live-2.5-flash-preview',
      'gemini-2.0-flash-live-001',
      'gemini-2.5-flash-preview-native-audio-dialog',
    ].filter(Boolean) as string[];

    const systemInstruction = options?.systemInstruction || "You are Nova AI, a multilingual assistant created by NovEra Group. Always respond in the language of the user's last message. If the user's language is unclear, respond in the browser's language (navigator.language). Keep answers brief and clear; use simple sentences when needed.";
    let connected = false;
    let lastErr: any = null;
    for (const model of modelCandidates) {
      try {
        outChunks = [];
        liveSession = await ai.live.connect({
          model,
          config: { responseModalities: [Modality.AUDIO], systemInstruction },
          callbacks: {
            onopen: () => { isOpen = true; },
            onmessage: (message: any) => {
              pushAudioChunkBase64((message as any)?.data);
              const sc = (message as any)?.serverContent;
              try {
                const parts = sc?.modelTurn?.parts || [];
                let textBuf = '';
                for (const p of parts) {
                  const b64 = p?.inlineData?.data || p?.inline_data?.data;
                  pushAudioChunkBase64(b64);
                  const txt = (p?.text || p?.inlineData?.text || '').toString();
                  if (txt) textBuf += (textBuf ? ' ' : '') + txt;
                }
                const t = (textBuf || '').trim();
                if (t && (t.length > lastLiveText.length) && t.startsWith(lastLiveText)) {
                  lastLiveText = t;
                }
              } catch {}
              if (sc?.generationComplete || sc?.turnComplete) {
                const url = flushAudioChunks();
                if (url) onAudioCb?.(url);
                if (lastLiveText) {
                  try { window.dispatchEvent(new CustomEvent('nov-era-live-text' as any, { detail: lastLiveText })); } catch {}
                }
                lastLiveText = '';
              }
            },
            onerror: (e: any) => { console.warn('Gemini Live error', e?.message || e); },
            onclose: (e: any) => { isOpen = false; liveSession = null; },
          },
        });
        connected = true;
        break;
      } catch (e) {
        lastErr = e;
        continue;
      }
    }

    return connected;
  } catch (e) {
    console.warn('connectGeminiLive failed', e);
    return false;
  }
}

export function onGeminiLiveAudio(cb: ((url: string) => void) | null) {
  onAudioCb = cb;
}

export function bufferPcmFrame(float32: Float32Array, sampleRate: number) {
  if (!isOpen || !liveSession) return;
  const i16 = resampleTo16k(float32, sampleRate);
  if (!pendingInt16 || pendingInt16.length < (pendingLength + i16.length)) {
    const n = Math.max(pendingLength + i16.length, 16000 * 2); // allocate generously
    const next = new Int16Array(n);
    if (pendingInt16 && pendingLength > 0) next.set(pendingInt16.subarray(0, pendingLength), 0);
    pendingInt16 = next;
  }
  pendingInt16!.set(i16, pendingLength);
  pendingLength += i16.length;
  scheduleFlush();
}

export async function disconnectGeminiLive() {
  try { if (flushTimer != null) { window.clearTimeout(flushTimer); flushTimer = null; } } catch {}
  pendingInt16 = null;
  pendingLength = 0;
  outChunks = [];
  if (liveSession) {
    try { await liveSession.close(); } catch {}
  }
  liveSession = null;
  isOpen = false;
  onAudioCb = null;
}

export function sendAudioStreamEnd() {
  try { if (isOpen && liveSession) liveSession.sendRealtimeInput({ audioStreamEnd: true }); } catch {}
}
