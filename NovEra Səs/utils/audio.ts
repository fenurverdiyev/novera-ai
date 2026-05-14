
import type { Blob as GenAIBlob } from '@google/genai';

// Encodes raw Float32Array PCM data into a Base64 string within a Blob-like object for the GenAI API.
export function createPcmBlob(data: Float32Array): GenAIBlob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Convert float to 16-bit PCM
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  }
  const uint8Array = new Uint8Array(int16.buffer);
  
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// Decodes raw Uint8Array PCM data into an AudioBuffer for playback.
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Convert 16-bit PCM to float
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


// Converts a browser native Blob to a Base64 string, extracting the data part.
export function base64Encode(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // Remove the data URL prefix e.g., "data:image/jpeg;base64,"
            const base64Data = base64String.split(',')[1];
            resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}