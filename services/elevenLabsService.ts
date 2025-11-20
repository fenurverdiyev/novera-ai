// NOTE: This service requires an API key from ElevenLabs.
// It must be provided as an environment variable named ELEVENLABS_API_KEY.

import type { VoiceOption } from '../types';

// IMPORTANT: Do not hardcode API keys in the source code.
// This key should be loaded from an environment variable, e.g., process.env.ELEVENLABS_API_KEY
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const ALLOW_DIRECT_ELEVEN = (
  (import.meta as any).env?.VITE_ELEVEN_ALLOW_DIRECT === 'true' ||
  (import.meta as any).env?.VITE_ELEVEN_ALLOW_DIRECT === '1' ||
  !!(import.meta as any).env?.VITE_ELEVENLABS_API_KEY
);

if (!ELEVENLABS_API_KEY) {
    console.warn('VITE_ELEVENLABS_API_KEY not found. Falling back to /api/elevenlabs-proxy if available.');
}

// Normalize AZ text for TTS to avoid over-emphasis and robotic intonation
function sanitizeAzeriTts(input: string): string {
    try {
        let s = (input || '').normalize('NFC');
        // Remove most emojis/symbols that cause odd prosody
        s = s.replace(/[\p{Extended_Pictographic}\p{So}]+/gu, ' ');
        // Replace multiple punctuation like !!!??! with a single period
        s = s.replace(/[!?]+/g, '.');
        // Normalize spaced punctuation
        s = s.replace(/\s+([.,…])/g, '$1');
        // Collapse repeated periods to ellipsis style
        s = s.replace(/\.{3,}/g, '…');
        // Remove leftover stray symbols often read unnaturally
        s = s.replace(/[“”"\*_/<>|#`~^]+/g, '');
        // Collapse whitespace
        s = s.replace(/\s+/g, ' ').trim();
        // Ensure sentence ends with mild punctuation for stable cadence
        if (s && !/[.!?…]$/.test(s)) s += '.';
        return s;
    } catch {
        return (input || '').toString();
    }
}

async function callProxy(text: string, voiceId: string, opts?: { stability?: number; similarityBoost?: number; style?: number; optimizeLatency?: number; outputFormat?: string }): Promise<string | null> {
    try {
        const TTS_ORIGIN = (import.meta as any).env?.VITE_TTS_BACKEND_URL || '';
        const base = TTS_ORIGIN ? `${TTS_ORIGIN.replace(/\/$/, '')}` : '';
        let url = base ? `${base}/api/elevenlabs-proxy` : '/api/elevenlabs-proxy';
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text.trim(),
                voice_id: voiceId,
                stability: opts?.stability ?? 0.5,
                similarity_boost: opts?.similarityBoost ?? 0.75,
                style: opts?.style ?? 0.0,
                optimize_latency: opts?.optimizeLatency ?? 4,
                output_format: opts?.outputFormat ?? 'mp3_22050_32',
            })
        });
        if (!resp.ok) {
            // Silent fallback: do not log to console, return null to trigger direct API path
            return null;
        }
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        // Silent fallback
        return null;
    }
}

export interface Voice {
    id: string;
    name: string;
    category: string;
}

export const AVAILABLE_VOICES: Voice[] = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', category: 'premade' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', category: 'premade' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade' },
    { id: 'GBv7mTt0atIp3Br8iCZE', name: 'Thomas', category: 'premade' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', category: 'premade' },
];

// Accept internal voice ids from Live UI (Zephyr, Sulafat, etc.) and map to ElevenLabs ids
const INTERNAL_TO_ELEVEN: Record<string, string> = {
    // female voices
    Sulafat: '21m00Tcm4TlvDq8ikWAM', // Rachel
    Zephyr:  'EXAVITQu4vr4xnSDxMaL', // Sarah
    // male voices
    Gacrux:  'ErXwobaYiN019PkySvjV', // Antoni
    Puck:    'GBv7mTt0atIp3Br8iCZE', // Thomas
    Charon:  'pNInz6obpgDQGcFmaJgB', // Adam
    Fenrir:  'TX3LPaxmHKxFdv7VOQHJ', // Liam
};

// Optional persona-specific voice ids from env for higher fidelity
const VOICE_ENV_MAP: Record<string, string | undefined> = {
  Zephyr: (import.meta.env as any).VITE_ELEVEN_VOICE_ZEPHYR,
  Sulafat: (import.meta.env as any).VITE_ELEVEN_VOICE_SULAFAT,
  Gacrux: (import.meta.env as any).VITE_ELEVEN_VOICE_GACRUX,
  Fenrir: (import.meta.env as any).VITE_ELEVEN_VOICE_FENRIR,
  Charon: (import.meta.env as any).VITE_ELEVEN_VOICE_CHARON,
  Puck: (import.meta.env as any).VITE_ELEVEN_VOICE_PUCK,
};

const normalizeVoiceId = (id: string): string => VOICE_ENV_MAP[id] || INTERNAL_TO_ELEVEN[id] || id;

// eleven_v3 accepts only discrete stability values: 0.0, 0.5, 1.0
function quantizeStability(v?: number): 0 | 0.5 | 1 {
  const x = typeof v === 'number' ? Math.max(0, Math.min(1, v)) : 0.5;
  if (x <= 0.25) return 0;
  if (x <= 0.75) return 0.5 as 0.5;
  return 1;
}

/**
 * Converts text to speech using ElevenLabs API
 * @param text The text to convert to speech
 * @param voiceId The voice ID to use (default: first available voice)
 * @param stability Voice stability (0.0 to 1.0, default: 0.5)
 * @param similarityBoost Voice similarity boost (0.0 to 1.0, default: 0.75)
 * @returns Promise<string | null> - Returns audio URL or null if failed
 */
export async function textToSpeech(
    text: string,
    voiceId: string = AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ',
    stability: number = 0.5,
    similarityBoost: number = 0.75,
    style: number = 0.0
): Promise<string | null> {
    voiceId = normalizeVoiceId(voiceId);
    const safeText = sanitizeAzeriTts(text);
    // Prefer proxy first (better CORS + key safety)
    const proxied = await callProxy(safeText, voiceId, { stability: quantizeStability(stability), similarityBoost, style, outputFormat: 'mp3_44100_128' });
    if (proxied) return proxied;
    if (!ALLOW_DIRECT_ELEVEN) return null;

    if (!ELEVENLABS_API_KEY) {
        return null;
    }

    if (!safeText || safeText.trim().length === 0) {
        return null;
    }

    try {
        const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: safeText.trim(),
                model_id: 'eleven_v3',
                voice_settings: {
                    stability: quantizeStability(stability),
                    similarity_boost: similarityBoost,
                    style,
                    use_speaker_boost: true
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API error:', response.status, errorText);
            // Fallback: try the streaming endpoint which sometimes succeeds where the standard one fails
            try {
                const streamResp = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'audio/mpeg',
                        'Content-Type': 'application/json',
                        'xi-api-key': ELEVENLABS_API_KEY,
                    },
                    body: JSON.stringify({
                        text: safeText.trim(),
                        model_id: 'eleven_v3',
                        voice_settings: {
                            stability: quantizeStability(stability),
                            similarity_boost: similarityBoost,
                            style: 0.0,
                            use_speaker_boost: true
                        }
                    }),
                });
                if (!streamResp.ok) {
                    const streamErr = await streamResp.text();
                    console.error('ElevenLabs STREAM API error:', streamResp.status, streamErr);
                    return null;
                }
                const streamBlob = await streamResp.blob();
                return URL.createObjectURL(streamBlob);
            } catch (fallbackError) {
                console.error('Fallback to streaming endpoint failed:', fallbackError);
                return null;
            }
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        return audioUrl;
    } catch (error) {
        console.error('Error in textToSpeech:', error);
        return null;
    }
}

/**
 * Converts text to speech with streaming support for real-time playback
 * @param text The text to convert to speech
 * @param voiceId The voice ID to use
 * @returns Promise<string | null> - Returns audio URL or null if failed
 */
export async function textToSpeechStream(
    text: string,
    voiceId: string = AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ',
    stability: number = 0.5,
    similarityBoost: number = 0.75,
    style: number = 0.0,
    optimizeLatency: number = 4
): Promise<string | null> {
    voiceId = normalizeVoiceId(voiceId);
    const safeText = sanitizeAzeriTts(text);
    // Prefer proxy first (handles optimizeLatency + output format server-side)
    const proxied = await callProxy(safeText, voiceId, { stability, similarityBoost, style, optimizeLatency, outputFormat: 'mp3_22050_32' });
    if (proxied) return proxied;
    if (!ALLOW_DIRECT_ELEVEN) return null;

    if (!ELEVENLABS_API_KEY) {
        console.warn('ElevenLabs API key not available');
        return null;
    }

    if (!safeText || safeText.trim().length === 0) {
        return null;
    }

    try {
        const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream?output_format=mp3_22050_32`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: safeText.trim(),
                model_id: 'eleven_v3',
                voice_settings: {
                    stability: quantizeStability(stability),
                    similarity_boost: Math.min(1, Math.max(0, similarityBoost)),
                    style: Math.min(1, Math.max(0, style)),
                    use_speaker_boost: true
                }
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs streaming API error:', response.status, errorText);
            return null;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        return audioUrl;
    } catch (error) {
        console.error('Error in textToSpeechStream:', error);
        return null;
    }
}

/**
 * Batch convert multiple text chunks to speech for optimized playback
 * @param textChunks Array of text chunks to convert
 * @param voiceId The voice ID to use
 * @returns Promise<(string | null)[]> - Returns array of audio URLs
 */
export async function batchTextToSpeech(
    textChunks: string[],
    voiceId: string = AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ'
): Promise<(string | null)[]> {
    const resolved = normalizeVoiceId(voiceId);
    const promises = textChunks.map(chunk => textToSpeech(chunk, resolved));
    return Promise.all(promises);
}

/**
 * Preload audio for faster playback
 * @param audioUrl The audio URL to preload
 * @returns Promise<HTMLAudioElement | null>
 */
export async function preloadAudio(audioUrl: string): Promise<HTMLAudioElement | null> {
    return new Promise((resolve) => {
        const audio = new Audio(audioUrl);
        audio.preload = 'auto';
        
        const handleCanPlay = () => {
            audio.removeEventListener('canplaythrough', handleCanPlay);
            audio.removeEventListener('error', handleError);
            resolve(audio);
        };
        
        const handleError = () => {
            audio.removeEventListener('canplaythrough', handleCanPlay);
            audio.removeEventListener('error', handleError);
            resolve(null);
        };
        
        audio.addEventListener('canplaythrough', handleCanPlay);
        audio.addEventListener('error', handleError);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            audio.removeEventListener('canplaythrough', handleCanPlay);
            audio.removeEventListener('error', handleError);
            resolve(null);
        }, 5000);
    });
}

/**
 * Get available voices from ElevenLabs API
 * @returns Promise<Voice[]> - Returns array of available voices
 */
export async function getAvailableVoices(): Promise<Voice[]> {
    if (!ELEVENLABS_API_KEY) {
        return AVAILABLE_VOICES;
    }

    try {
        const response = await fetch(`${ELEVENLABS_BASE_URL}/voices`, {
            headers: {
                'xi-api-key': ELEVENLABS_API_KEY,
            },
        });

        if (!response.ok) {
            console.error('Failed to fetch voices:', response.status);
            return AVAILABLE_VOICES;
        }

        const data = await response.json();
        const voices: Voice[] = data.voices.map((voice: any) => ({
            id: voice.voice_id,
            name: voice.name,
            category: voice.category || 'custom'
        }));

        return voices.length > 0 ? voices : AVAILABLE_VOICES;
    } catch (error) {
        console.error('Error fetching voices:', error);
        return AVAILABLE_VOICES;
    }
}

/**
 * Clean up audio URLs to prevent memory leaks
 * @param audioUrls Array of audio URLs to clean up
 */
export function cleanupAudioUrls(audioUrls: string[]): void {
    audioUrls.forEach(url => {
        if (url && url.startsWith('blob:')) {
            URL.revokeObjectURL(url);
        }
    });
}
