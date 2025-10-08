import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const SERPER_API_KEY = env.SERPER_API_KEY || env.VITE_SERPER_API_KEY || env.VITE_SERPAPI_KEY;
    const PUBLIC_HOST = env.VITE_PUBLIC_HOST; // e.g. abcdef.ngrok-free.app
    const HTTPS_KEY_PATH = env.VITE_HTTPS_KEY; // e.g. d:/NovEra/certs/server-key.pem
    const HTTPS_CERT_PATH = env.VITE_HTTPS_CERT; // e.g. d:/NovEra/certs/server.pem

    // Dev-only proxy for Serper. In production, deploy a serverless endpoint with identical behavior.
    const serperProxyPlugin = {
      name: 'serper-proxy',
      configureServer(server: any) {
        server.middlewares.use('/api/serper-proxy', async (req: any, res: any) => {
          try {
            if (req.method !== 'POST') {
              res.statusCode = 405; res.end('Method Not Allowed'); return;
            }
            let body = '';
            await new Promise<void>((resolve) => {
              req.on('data', (chunk: any) => body += chunk);
              req.on('end', resolve);
            });
            const data = JSON.parse(body || '{}');
            const allowed = new Set(['search', 'images', 'videos', 'news']);
            const type = allowed.has(data.type) ? data.type : 'search';
            const targetUrl = `https://google.serper.dev/${type}`;
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (SERPER_API_KEY) headers['X-API-KEY'] = SERPER_API_KEY;
            const payload: Record<string, any> = {
              q: data.q ?? '',
              ...(data.num ? { num: Math.min(Number(data.num) || 10, 100) } : {}),
              ...(data.gl ? { gl: String(data.gl) } : {}),
              ...(data.hl ? { hl: String(data.hl) } : {}),
            };
            const upstream = await fetch(targetUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
            const text = await upstream.text();
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'proxy_error', message: e?.message || 'Unknown error' }));
          }
        });
      }
    };

    // Dev-only proxy for Gemini TTS so the client can call /api/gemini-tts
    const ttsProxyPlugin = {
      name: 'gemini-tts-proxy',
      configureServer(server: any) {
        server.middlewares.use('/api/gemini-tts', async (req: any, res: any) => {
          try {
            if (req.method !== 'POST') { res.statusCode = 405; res.end('Method Not Allowed'); return; }
            let body = '';
            await new Promise<void>((resolve) => { req.on('data', (c: any) => body += c); req.on('end', resolve); });
            const { text, voiceName } = JSON.parse(body || '{}');
            const t = (text || '').trim();
            const voice = (voiceName || 'Kore').trim();
            if (!t) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: "Missing 'text'" })); return; }

            const API_KEY = env.GEMINI_TTS_API_KEY || env.VITE_GEMINI_TTS_API_KEY || env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
            if (!API_KEY) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'Gemini API key not configured' })); return; }

            const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';
            const payload = {
              contents: [{ parts: [{ text: t }] }],
              generationConfig: { responseModalities: ['AUDIO'] },
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
            } as const;
            const upstream = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
              body: JSON.stringify(payload),
            });
            const json = await upstream.json();
            if (!upstream.ok) { res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(json)); return; }
            const firstPart = json?.candidates?.[0]?.content?.parts?.[0];
            const inline = firstPart?.inlineData;
            if (!inline?.data) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'No audio data returned' })); return; }
            const mime: string = inline.mimeType || 'audio/pcm';
            const base64: string = inline.data as string;
            const pcmBytes = Buffer.from(base64, 'base64');

            const writeWav = (pcm: Uint8Array) => {
              const numChannels = 1;
              const sampleRate = 24000;
              const bitsPerSample = 16;
              const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
              const blockAlign = (numChannels * bitsPerSample) / 8;
              const dataSize = pcm.length;
              const header = new ArrayBuffer(44);
              const view = new DataView(header);
              const ws = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
              ws(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); ws(8, 'WAVE');
              ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, numChannels, true);
              view.setUint32(24, sampleRate, true); view.setUint32(28, byteRate, true); view.setUint16(32, blockAlign, true); view.setUint16(34, bitsPerSample, true);
              ws(36, 'data'); view.setUint32(40, dataSize, true);
              const wavBytes = new Uint8Array(44 + dataSize);
              wavBytes.set(new Uint8Array(header), 0); wavBytes.set(new Uint8Array(pcm), 44);
              return wavBytes;
            };

            if (mime.includes('wav')) { res.statusCode = 200; res.setHeader('Content-Type', 'audio/wav'); res.end(pcmBytes); return; }
            const wav = writeWav(pcmBytes);
            res.statusCode = 200; res.setHeader('Content-Type', 'audio/wav'); res.end(Buffer.from(wav));
          } catch (e: any) {
            res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: 'tts_proxy_error', message: e?.message || 'Unknown error' }));
          }
        });
      }
    };
    const hmrOptions = PUBLIC_HOST ? {
      host: PUBLIC_HOST,
      protocol: 'wss' as const,
      clientPort: 443,
    } : undefined;

    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.VITE_ELEVENLABS_API_KEY': JSON.stringify(env.VITE_ELEVENLABS_API_KEY),
        'process.env.VITE_SERPAPI_KEY': JSON.stringify(env.VITE_SERPAPI_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        host: true,
        port: 5175,
        strictPort: true,
        cors: true,
        allowedHosts: [
          '.ngrok.io',
          '.ngrok-free.app',
          '.ngrok.app',
          'localhost',
          '127.0.0.1',
          '192.168.100.41',
          '72dceb2359d7.ngrok-free.app'
        ],
        hmr: hmrOptions,
        ...(HTTPS_KEY_PATH && HTTPS_CERT_PATH && fs.existsSync(HTTPS_KEY_PATH) && fs.existsSync(HTTPS_CERT_PATH)
          ? { https: { key: fs.readFileSync(HTTPS_KEY_PATH), cert: fs.readFileSync(HTTPS_CERT_PATH) } }
          : {})
      },
      plugins: [serperProxyPlugin, ttsProxyPlugin]
    };
});
