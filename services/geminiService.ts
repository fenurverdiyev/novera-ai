// services/geminiService.ts
import type { Source, NewsArticle, WeatherData, Message } from '../types';
import { detectLocaleForSearch } from './searchService';

// Necessary types defined locally to avoid @google/genai dependency in frontend
export interface Part { text?: string; inlineData?: { mimeType: string; data: string }; }
export interface Content { role: string; parts: Part[]; }

// ─── Constants ────────────────────────────────────────────────────────────────
// Use relative URL for all backend services (unified port 8020)
const VERTEX_PROXY_URL = import.meta.env.VITE_VERTEX_PROXY_URL || '';
const BACKEND_URL = import.meta.env.VITE_VERTEX_PROXY_URL || '';

/** Tövsiyə olunan modellər */
const MODELS = {
  flash:     'gemini-2.5-flash',
  pro:       'gemini-2.5-pro',
  flashLite: 'gemini-2.5-flash-lite',
} as const;

const DEFAULT_MODEL = MODELS.flash;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mapMessagesToContent = (messages: Message[]): Content[] =>
  messages.map(msg => ({
    role: (msg.role === 'user') ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));

/** Vertex proxy-nin mövcud olub olmadığını yoxla (health check) */
let _proxyReachable: boolean | null = null;
async function isProxyReachable(): Promise<boolean> {
  // Sadə caching — hər sessiyada bir dəfə yoxla
  if (_proxyReachable !== null) return _proxyReachable;
  try {
    const r = await fetch(`${VERTEX_PROXY_URL}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    _proxyReachable = r.ok;
  } catch {
    _proxyReachable = false;
  }
  return _proxyReachable;
}

/** Grounding metadata-dan mənbələri çıxar */
function extractSources(groundingChunks: any[]): Source[] {
  const seen = new Set<string>();
  return groundingChunks
    .map((g: any) => g?.web)
    .filter((w: any) => w && w.uri)
    .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
    .slice(0, 8)
    .map((w: any, i: number) => ({
      uri: w.uri,
      title: w.title || (() => { try { return new URL(w.uri).hostname; } catch { return w.uri; } })(),
      index: i + 1,
    }));
}

/** Cavab mətnindən [image:...], [video:...] tag-larını çıxar */
function extractMedia(text: string): { text: string; images: string[]; videos: string[] } {
  const imageRegex = /\[image:\s*(https?:\/\/[^\]]+)\]/g;
  const videoRegex = /\[video:\s*(https?:\/\/[^\]]+)\]/g;
  
  const images: string[] = [];
  const videos: string[] = [];
  
  for (const m of text.matchAll(imageRegex)) images.push(m[1]);
  for (const m of text.matchAll(videoRegex)) videos.push(m[1]);
  
  text = text.replace(imageRegex, '').replace(videoRegex, '').trim();
  return { text, images, videos };
}

// ─── Vertex Proxy Stream ───────────────────────────────────────────────────────

async function* streamViaProxy(
  contents: Content[],
  systemInstruction?: string | string[],
  model = DEFAULT_MODEL,
  tools?: any[],
): AsyncGenerator<{ text?: string; sources?: Source[]; images?: string[]; videos?: string[]; toolCalls?: any[] }> {
  const body = {
    contents,
    systemInstruction: systemInstruction || undefined,
    model,
    tools: tools || undefined,
  };

  const response = await fetch(`${VERTEX_PROXY_URL}/api/chat-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Vertex proxy xətası: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let allSources: Source[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep the last partial line in buffer

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) throw new Error(parsed.error);

        const chunkText = parsed.text ?? '';
        fullText += chunkText;

        const chunks = parsed.groundingMetadata?.groundingChunks || [];
        if (chunks.length) allSources = extractSources(chunks);

        const { text: cleanText, images, videos } = extractMedia(chunkText);
        
        yield {
          text: cleanText,
          sources: allSources.length ? allSources : undefined,
          images: images.length ? images : undefined,
          videos: videos.length ? videos : undefined,
          toolCalls: parsed.toolCalls || undefined,
        };
      } catch (e: any) {
        console.warn('SSE Parse Error:', e, 'Line:', line);
      }
    }
  }
}


// ─── Fallback: birbaşa API key ilə ────────────────────────────────────────────

async function* streamViaApiKey(
  contents: Content[],
  systemInstruction: string,
  model = DEFAULT_MODEL,
): AsyncGenerator<{ text?: string; sources?: Source[]; images?: string[]; videos?: string[] }> {
  if (!fallbackAi) {
    yield { text: 'AI cavabı hazırda aktiv deyil (VITE_GEMINI_API_KEY qurulmayıb).' };
    return;
  }

  try {
    const resp = await fallbackAi.models.generateContent({
      model,
      contents,
      config: { systemInstruction },
    });

    const raw = resp.text?.trim() || '';
    const { text, images, videos } = extractMedia(raw);
    const groundingChunks = (resp as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = extractSources(groundingChunks);

    yield {
      text,
      sources: sources.length ? sources : undefined,
      images: images.length ? images : undefined,
      videos: videos.length ? videos : undefined,
    };
  } catch {
    // Son fallback — config olmadan
    try {
      const resp = await fallbackAi.models.generateContent({ model, contents });
      const raw = resp.text?.trim() || '';
      const { text, images, videos } = extractMedia(raw);
      yield { text, images: images.length ? images : undefined, videos: videos.length ? videos : undefined };
    } catch {
      yield { text: 'Hazırda cavab generasiyasında problem yaşandı. Zəhmət olmasa bir qədər sonra yenidən cəhd edin.' };
    }
  }
}

// ─── Ana funksiya ──────────────────────────────────────────────────────────────

export async function* streamChatQuery(
  prompt: string,
  history: Message[],
  images: string[] = [],
  memory?: string,
  forceGrounding?: boolean,
  analysisOnly?: boolean,
  customSystemInstruction?: string,
): AsyncGenerator<{ text?: string; sources?: Source[], images?: string[], videos?: string[], toolCalls?: any[] }> {
  const memoryBlock = memory && memory.trim()
    ? `\n\nUSER MEMORY (Facts about the user):\n${memory}\nUse this context to personalize your responses. CRITICAL COMMAND: If the user shares new personal information, opinions, or explicitly asks you to remember something, you MUST include this exact tag in your response: [SAVE_FACT: fact text here]. For example: [SAVE_FACT: İstifadəçi futbola baxmağı sevir]. The system will invisibly parse this tag and update your database.`
    : '\n\nCRITICAL COMMAND: You currently have no long-term memory about this user. If the user shares personal information, hobbies, or explicitly asks you to remember something, you MUST include this exact tag in your response: [SAVE_FACT: fact text here]. For example: [SAVE_FACT: İstifadəçinin adı Kamrandır]. The system will invisibly parse this tag and update your database for future conversations.';

  const baseInstruction = `Sizin adınız NovEra-dır. Siz NovEra Group tərəfindən yaradılmış çoxdilli süni intellekt köməkçisisiniz. Həmişə istifadəçinin son mesajının dilində cavab verin. Sizdən kim olduğunuz soruşulduqda, həmişə "Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam" deyə cavab verməlisiniz. ${memoryBlock}`;

  let systemInstruction = customSystemInstruction;
  if (!systemInstruction) {
    systemInstruction = analysisOnly
      ? (baseInstruction + " TEXT ANALYSIS ONLY. DO NOT use web search tools.")
      : (baseInstruction + " If the user requests visuals, call the `webSearch` tool. If user asks for a map, call `showMap`.");
  }

  // User parts (multimodal dəstəyi)
  const userParts: any[] = [];
  for (const imgData of images) {
    try {
      const mimeMatch = imgData.match(/^data:([^;]+);base64,/i);
      const mimeType = mimeMatch?.[1] || 'image/jpeg';
      const base64Match = imgData.match(/^data:[^;]+;base64,(.*)$/i);
      const data = (base64Match?.[1] || imgData).trim();
      userParts.push({ inlineData: { mimeType, data } });
    } catch {
      userParts.push({ inlineData: { mimeType: 'image/jpeg', data: (imgData.split(',')[1] || imgData).trim() } });
    }
  }
  userParts.push({ text: prompt });

  const contents: Content[] = [
    ...mapMessagesToContent(history),
    { role: 'user', parts: userParts },
  ];

  // ─── Tools ─────────────────────────────────────────────────────────────
  const tools: any[] = [];
  if (forceGrounding) {
    // Add Google Search grounding
    tools.push({ googleSearch: {} });
  }

  if (!analysisOnly) {
    // Add custom tool declarations
    tools.push({
      functionDeclarations: [
        {
          name: "webSearch",
          description: "Search the web for images, videos, news or shopping products.",
          parameters: {
            type: "OBJECT",
            properties: {
              query: { type: "STRING", description: "The search query" },
              maxImages: { type: "NUMBER", description: "Number of images to find (max 10)" },
              maxVideos: { type: "NUMBER", description: "Number of videos to find (max 5)" },
              searchType: { type: "STRING", enum: ["images", "videos", "news", "shopping", "web"], description: "Type of search" }
            },
            required: ["query"]
          }
        },
        {
          name: "showMap",
          description: "Show an interactive map for a location.",
          parameters: {
            type: "OBJECT",
            properties: {
              location: { type: "STRING", description: "City or address" },
              zoom: { type: "NUMBER", description: "Zoom level (1-20)" }
            },
            required: ["location"]
          }
        }
      ]
    });
  }

  // ─── Vertex proxy-dən istifadə et (vahid yol) ─────────────────────────────
  try {
    yield* streamViaProxy(contents, systemInstruction, DEFAULT_MODEL, tools.length ? tools : undefined);
  } catch (proxyErr) {
    console.error('[NovEra] AI Error:', proxyErr);
    yield { text: 'Hazırda cavab generasiyasında problem yaşandı. Zəhmət olmasa bir qədər sonra yenidən cəhd edin.' };
  }
}

// ─── Related Questions ────────────────────────────────────────────────────────

export async function generateRelatedQuestions(prompt: string, answer: string): Promise<string[]> {
  const fullPrompt = `Based on the following question and its answer, generate 3 concise and relevant follow-up questions that a curious user might ask next.
IMPORTANT: The questions MUST be in the same language as the original question.

Question: "${prompt}"

Answer: "${answer.substring(0, 2000)}..."

Return the questions as a JSON array of strings.`;

  try {
    const r = await fetch(`${VERTEX_PROXY_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: fullPrompt,
        model: MODELS.flashLite,
        temperature: 0.3,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      const text = data.text || '';
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr.slice(0, 3);
      }
    }
  } catch (err) {
    console.warn('Related questions failed:', err);
  }
  return [];
}

/** Söhbət keçmişinə əsasən axtarış sorğusunu təkmilləşdir */
export async function refineSearchQueryWithAI(query: string, history: Message[]): Promise<string> {
  if (history.length === 0) return query;
  
  const historyText = history.slice(-5).map(m => `${m.role === 'user' ? 'İstifadəçi' : 'AI'}: ${m.text}`).join('\n');
  const prompt = `Based on the conversation history below, extract the main subject the user is interested in and generate a concise search query (in English or the original language) for finding high-quality images or videos of that subject.
If the current query already contains enough specific details, return it as is.
Only return the refined search query string, nothing else.

CONVERSATION HISTORY:
${historyText}

CURRENT QUERY:
"${query}"

REFINED SEARCH QUERY:`;

  try {
    const r = await fetch(`${VERTEX_PROXY_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: MODELS.flashLite,
        temperature: 0.2,
      }),
    });
    if (r.ok) {
      const data = await r.json();
      const refined = (data.text || '').trim().replace(/^"|"$/g, '');
      if (refined && refined.length > 2) return refined;
    }
  } catch (err) {
    console.warn('Query refinement failed:', err);
  }
  return query;
}

// ─── News Article Analysis ────────────────────────────────────────────────────

export async function analyzeNewsArticle(article: NewsArticle): Promise<string> {
  const { hl } = detectLocaleForSearch();
  const prompt = `Please analyze the following news article. Provide a concise, neutral summary covering the key points, any potential biases detected, and the wider implications of the story.
IMPORTANT: Your entire response MUST be in the language "${hl}".

Article Title: "${article.title}"
Article Content: "${(article.content || article.summary || '').substring(0, 3000)}"

Return the analysis as a single block of text.`;

  try {
    const r = await fetch(`${VERTEX_PROXY_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: DEFAULT_MODEL }),
    });
    if (r.ok) {
      const data = await r.json();
      return data.text || '';
    }
  } catch (err) {
    console.warn('News analysis failed:', err);
  }
  return "AI təhlili hazırda əlçatmazdır.";
}

// ─── Weather ──────────────────────────────────────────────────────────────────

export async function getWeather(location: string): Promise<WeatherData> {
  const { hl } = detectLocaleForSearch();
  const prompt = `Get the current weather and a 5-day forecast for the location: "${location}".
IMPORTANT: All text content (location, condition, day) MUST be in the language "${hl}".
Return the result as a single, valid JSON object.
If the location is found, the JSON object must have a "success" key set to true, and a "data" key containing:
{ "location": "City, Country", "current": { "temp": number, "condition": "string" }, "forecast": [ { "day": "string", "temp": number, "condition": "string" }, ... ] }
If not found, "success": false and "error": "Məkan tapılmadı".
Do not include any text, markdown, or commentary outside of the JSON object.`;

  try {
    const r = await fetch(`${VERTEX_PROXY_URL}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: DEFAULT_MODEL, temperature: 0.1 }),
    });
    if (r.ok) {
      const data = await r.json();
      const jsonStr = data.text || '';
      const match = jsonStr.match(/\{[\s\S]*\}/);
      const clean = match ? match[0] : jsonStr;
      const result = JSON.parse(clean);
      if (result.success && result.data) return result.data;
      if (!result.success && result.error) throw new Error(result.error);
    }
  } catch (err) {
    console.warn('Weather fetch failed:', err);
  }
  throw new Error("Hava məlumatı üçün cavab alınmadı.");
}

// ─── Translate ────────────────────────────────────────────────────────────────

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) return "";

  try {
    const response = await fetch(`${BACKEND_URL}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target_language: targetLang }),
    });
    if (response.ok) {
      const result = await response.json();
      return result.translated_text || '';
    }
  } catch (error) {
    console.warn('Translation failed:', error);
  }
  return text; // Return original on total failure
}

// ─── Grounded Search ──────────────────────────────────────────────────────────

export async function answerWithGroundedSearch(
  query: string,
  opts?: { num?: number; gl?: string; hl?: string },
  memory?: string
) {
  const memoryBlock = memory && memory.trim() ? `\n\nSHORT MEMORY (for context):\n${memory.slice(-1500)}` : '';
  const systemInstruction = (
    "Sizin adınız NovEra-dır. Siz NovEra Group tərəfindən yaradılmış çoxdilli süni intellekt köməkçisisiniz. Həmişə istifadəçinin son mesajının dilində cavab verin. Sizdən kim olduğunuz soruşulduqda, həmişə \"Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam\" deyə cavab verməlisiniz.\n\n" +
    "Use Google Search grounding where appropriate to support claims with up-to-date sources and provide references like [1], [2]... Keep citations concise." +
    memoryBlock
  );

  try {
    const body = {
      contents: [{ role: 'user', parts: [{ text: query }] }],
      systemInstruction,
      model: DEFAULT_MODEL,
      generationConfig: { temperature: 0.7 },
    };
    const r = await fetch(`${VERTEX_PROXY_URL}/api/chat-stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.ok && r.body) {
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let sources: Source[] = [];
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const p = JSON.parse(payload);
            fullText += p.text ?? '';
            if (p.groundingMetadata?.groundingChunks?.length) {
              sources = extractSources(p.groundingMetadata.groundingChunks);
            }
          } catch { }
        }
      }
      const { text } = extractMedia(fullText);
      return { text, sources };
    }
  } catch (err) {
    console.warn('Grounded search failed:', err);
  }
  return { text: 'Cavab alınmadı.', sources: [] as Source[] };
}
