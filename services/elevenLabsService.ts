// NOTE: This service requires an API key from ElevenLabs.
// It must be provided as an environment variable named ELEVENLABS_API_KEY.

import type { VoiceOption } from '../types';

// IMPORTANT: Do not hardcode API keys in the source code.
// This key should be loaded from an environment variable, e.g., process.env.ELEVENLABS_API_KEY
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';

if (!ELEVENLABS_API_KEY) {
    console.warn('VITE_ELEVENLABS_API_KEY not found. Falling back to /api/elevenlabs-proxy if available.');
}

async function callProxy(text: string, voiceId: string): Promise<string | null> {
    try {
        const resp = await fetch('/api/elevenlabs-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text.trim(), voiceId })
        });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            console.error('Proxy TTS error:', resp.status, t);
            return null;
        }
        const blob = await resp.blob();
        return URL.createObjectURL(blob);
    } catch (e) {
        console.warn('Proxy not available or failed', e);
        return null;
    }
}

export interface Voice {
    id: string;
    name: string;
    category: string;
}

export const AVAILABLE_VOICES: Voice[] = [
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Bella', category: 'premade' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', category: 'premade' },
    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', category: 'premade' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', category: 'premade' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', category: 'premade' },
    { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', category: 'premade' },
];

// Accept internal voice ids from Live UI (Zephyr, Sulafat, etc.) and map to ElevenLabs ids
const INTERNAL_TO_ELEVEN: Record<string, string> = {
    // female warm
    Sulafat: 'TX3LPaxmHKxFdv7VOQHJ', // Bella
    Zephyr:  'EXAVITQu4vr4xnSDxMaL', // Bella alt
    // male voices
    Gacrux:  'ErXwobaYiN019PkySvjV', // Antoni
    Puck:    'VR6AewLTigWG4xSOukaG', // Arnold
    Charon:  'pNInz6obpgDQGcFmaJgB', // Adam
    Fenrir:  'yoZ06aMxZJJ28mfd3POQ', // Sam
};
const normalizeVoiceId = (id: string): string => INTERNAL_TO_ELEVEN[id] || id;

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
    similarityBoost: number = 0.75
): Promise<string | null> {
    voiceId = normalizeVoiceId(voiceId);
    if (!ELEVENLABS_API_KEY) {
        // Try proxy instead of disabling completely
        return await callProxy(text, voiceId);
    }

    if (!text || text.trim().length === 0) {
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
                text: text.trim(),
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability,
                    similarity_boost: similarityBoost,
                    style: 0.0,
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
                        text: text.trim(),
                        model_id: 'eleven_multilingual_v2',
                        voice_settings: {
                            stability,
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
    voiceId: string = AVAILABLE_VOICES[0]?.id || 'TX3LPaxmHKxFdv7VOQHJ'
): Promise<string | null> {
    voiceId = normalizeVoiceId(voiceId);
    if (!ELEVENLABS_API_KEY) {
        console.warn('ElevenLabs API key not available');
        return null;
    }

    if (!text || text.trim().length === 0) {
        return null;
    }

    try {
        const response = await fetch(`${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}/stream`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': ELEVENLABS_API_KEY,
            },
            body: JSON.stringify({
                text: text.trim(),
                model_id: 'eleven_multilingual_v2',
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.75,
                    style: 0.0,
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
