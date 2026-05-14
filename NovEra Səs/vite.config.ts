import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const tunnelHost = env.VITE_TUNNEL_HOST || env.NGROK_HOST || '';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Allow ngrok/Cloudflare tunnel hosts
        allowedHosts: tunnelHost
          ? [tunnelHost.replace(/^https?:\/\//, '')]
          : true,
        hmr: tunnelHost
          ? {
              host: tunnelHost.replace(/^https?:\/\//, ''),
              clientPort: 443,
              protocol: 'wss',
            }
          : { overlay: false },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
