/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GNEWS_API_KEY: string;
  readonly VITE_GEMINI_API_KEY: string;
  readonly VITE_SERPAPI_KEY: string;
  readonly VITE_SERPER_API_KEY: string;
  readonly VITE_GOOGLE_CSE_CX: string;
  readonly VITE_GOOGLE_CSE_JSON_KEY: string;
  readonly VITE_TTS_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
