import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const SERPER_API_KEY = env.SERPER_API_KEY || env.VITE_SERPER_API_KEY || env.VITE_SERPAPI_KEY;

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
        allowedHosts: [
          '.ngrok.io',
          '.ngrok-free.app',
          '.ngrok.app',
          'localhost',
          '127.0.0.1',
          '192.168.100.41',
          '72dceb2359d7.ngrok-free.app'
        ]
      },
      plugins: [serperProxyPlugin]
    };
});
