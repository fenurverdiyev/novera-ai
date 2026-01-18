// Fix: The `FunctionDeclarationTool` type does not exist in `@google/genai`. It has been replaced with the correct `Tool` type.
import { GoogleGenAI, Type, Content, Tool } from "@google/genai";
import type { Source, NewsArticle, WeatherData, Message } from '../types';
import { detectLocaleForSearch } from './searchService';


const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Do not crash the app if the API key is missing; degrade gracefully instead
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const BACKEND_URL = (import.meta.env.VITE_TTS_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const model = 'gemini-3-flash-preview';

// Keep only the single tool we actually need at inference-time to reduce prompt size.
const assistantTools: Tool[] = [
  {
    functionDeclarations: [
      {
        name: 'webSearch',
        description: 'Vebdə şəkil və videoları tapmaq üçün axtarış aparır. Tapılan URL-lər istifadəçiyə göstərilir.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: 'Şəkil/video üçün axtarış mətni.' },
            maxImages: { type: Type.NUMBER, description: 'Maksimum şəkil sayı (default 6).' },
            maxVideos: { type: Type.NUMBER, description: 'Maksimum video sayı (default 3).' },
          },
          required: ['query'],
        },
      },
      {
        name: 'showMap',
        description: 'Verilmiş məkanı və ya ünvanı xəritədə göstərir.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING, description: 'Xəritədə göstəriləcək məkan və ya ünvan (məsələn: "Bakı, Nizami küçəsi").' },
          },
          required: ['location'],
        },
      },
    ],
  },
];

/**
 * Maps the application's Message array to the Gemini API's Content array format.
 * @param messages The array of messages from the app state.
 * @returns A Content array for the Gemini API.
 */

// Built-in Google Search Grounding tool
const googleSearchTool: Tool = { googleSearch: {} as any };

const mapMessagesToContent = (messages: Message[]): Content[] => {
  return messages.map(msg => ({
    role: (msg.role === 'user') ? 'user' : 'model',
    parts: [{ text: msg.text }]
  }));
};

export async function* streamChatQuery(
  prompt: string,
  history: Message[],
  images: string[] = [],
  memory?: string,
  forceGrounding?: boolean,
  analysisOnly?: boolean,
  customSystemInstruction?: string,
): AsyncGenerator<{ text?: string; sources?: Source[], images?: string[], videos?: string[], toolCalls?: any[] }> {
  if (!ai) {
    // Graceful fallback when no API key is provided
    yield { text: 'AI cavabı hazırda aktiv deyil (VITE_GEMINI_API_KEY qurulmayıb). Zəhmət olmasa ayarlarda API açarını əlavə edin.' };
    return;
  }
  const memoryBlock = memory && memory.trim() ? `\n\nSHORT MEMORY (for context):\n${memory.slice(-1500)}` : '';
  const baseInstruction = `Sizin adınız NovEra-dır. Siz NovEra Group tərəfindən yaradılmış çoxdilli süni intellekt köməkçisisiniz. Həmişə istifadəçinin son mesajının dilində cavab verin. İstifadəçinin dili aydın deyilsə, brauzerin dilində (navigator.language) cavab verin. Sizdən kim olduğunuz və ya sizi kimin yaratdığı soruşulduqda, həmişə "Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam" deyə cavab verməlisiniz.`;
  let systemInstruction = customSystemInstruction;

  if (!systemInstruction) {
    systemInstruction = analysisOnly
      ? (
        baseInstruction +
        "This query is for TEXT ANALYSIS ONLY. DO NOT use any web search tools. DO NOT generate images. " +
        "Respond based on the provided text and images; return structured JSON if needed." +
        memoryBlock
      )
      : (
        baseInstruction +
        "If the user requests visuals (images/videos), you MUST call the `webSearch` tool and surface the result URLs. " +
        "If the user asks to see a location on a map or provides an address, call `showMap` tool. " +
        "Do not comment on visual content or maps without using the relevant tool." +
        memoryBlock
      );
  }

  const historicContent = mapMessagesToContent(history);

  const userParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
  if (images.length > 0) {
    // Put images first, then the text prompt (improves multimodal grounding)
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
  }
  userParts.push({ text: prompt });

  const contents: Content[] = [...historicContent, { role: 'user', parts: userParts }];

  const pickModel = () => {
    // Keep a single, stable model to avoid availability errors
    return model; // 'gemini-2.5-flash'
  };
  const useModel = pickModel();

  // Non-streaming path to avoid 400 errors from stream endpoint
  try {
    const resp = await ai.models.generateContent({
      model: useModel,
      contents,
      // Keep config minimal; some accounts/models reject tool declarations in config
      config: { systemInstruction },
    });

    let text = resp.text?.trim();
    const imageRegex = /\u005Bimage:\s*(https?:\/\/[^\u005D]+)\u005D/g;
    const videoRegex = /\u005Bvideo:\s*(https?:\/\/[^\u005D]+)\u005D/g;
    const newImages: string[] = [];
    const newVideos: string[] = [];
    if (text) {
      const imageMatches = text.matchAll(imageRegex);
      for (const match of imageMatches) newImages.push(match[1]);
      text = text.replace(imageRegex, '').trim();
      const videoMatches = text.matchAll(videoRegex);
      for (const match of videoMatches) newVideos.push(match[1]);
      text = text.replace(videoRegex, '').trim();
    }

    const groundingChunks = (resp as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const seen = new Set<string>();
    const sources: Source[] = groundingChunks
      .map((g: any) => g?.web)
      .filter((w: any) => w && w.uri)
      .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
      .slice(0, 8)
      .map((w: any, i: number) => ({ uri: w.uri, title: w.title || new URL(w.uri).hostname, index: i + 1 }));

    yield {
      text,
      sources: sources.length ? sources : undefined,
      images: newImages.length ? newImages : undefined,
      videos: newVideos.length ? newVideos : undefined,
    };
    return;
  } catch (e2) {
    // Fallback: retry with no config at all
    try {
      const resp = await ai.models.generateContent({ model: useModel, contents });
      const imageRegex = /\u005Bimage:\s*(https?:\/\/[^\u005D]+)\u005D/g;
      const videoRegex = /\u005Bvideo:\s*(https?:\/\/[^\u005D]+)\u005D/g;
      let text = resp.text?.trim();
      const newImages: string[] = [];
      const newVideos: string[] = [];
      if (text) {
        const imageMatches = text.matchAll(imageRegex);
        for (const match of imageMatches) newImages.push(match[1]);
        text = text.replace(imageRegex, '').trim();
        const videoMatches = text.matchAll(videoRegex);
        for (const match of videoMatches) newVideos.push(match[1]);
        text = text.replace(videoRegex, '').trim();
      }
      const groundingChunks = (resp as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const seen = new Set<string>();
      const sources: Source[] = groundingChunks
        .map((g: any) => g?.web)
        .filter((w: any) => w && w.uri)
        .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
        .slice(0, 8)
        .map((w: any, i: number) => ({ uri: w.uri, title: w.title || new URL(w.uri).hostname, index: i + 1 }));
      yield { text, sources: sources.length ? sources : undefined, images: newImages.length ? newImages : undefined, videos: newVideos.length ? newVideos : undefined };
      return;
    } catch {
      yield { text: 'Hazırda cavab generasiyasında problem yaşandı. Zəhmət olmasa bir qədər sonra yenidən cəhd edin.' };
      return;
    }
  }
}

/**
 * Generates related questions based on the given prompt and answer.
 * @param prompt The original prompt.
 * @param answer The answer to the prompt.
 * @returns An array of related questions.
 */
export async function generateRelatedQuestions(prompt: string, answer: string): Promise<string[]> {
  if (!ai) return [];
  try {
    const fullPrompt = `Based on the following question and its answer, generate 3 concise and relevant follow-up questions that a curious user might ask next.
IMPORTANT: The questions MUST be in the same language as the original question.

Question: "${prompt}"

Answer: "${answer.substring(0, 2000)}..."

Return the questions as a JSON array of strings.`;

    const modelsToTry = [model, 'gemini-1.5-flash'];
    for (const m of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model: m,
          contents: fullPrompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                questions: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              }
            }
          }
        });
        const jsonStr = response.text?.trim() || '';
        const result = jsonStr ? JSON.parse(jsonStr) : { questions: [] };
        return result.questions || [];
      } catch (e: any) {
        const msg = (e && e.message ? String(e.message) : '');
        if (/503|UNAVAILABLE|overloaded/i.test(msg)) {
          await new Promise(r => setTimeout(r, 350));
          continue;
        }
        break;
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Analyzes a news article and provides a summary, potential biases, and wider implications.
 * @param article The news article to analyze.
 * @returns A summary of the article.
 */
export async function analyzeNewsArticle(article: NewsArticle): Promise<string> {
  if (!ai) return "AI təhlili hazırda əlçatmazdır. Xahiş edirik sonra yenidən cəhd edin.";
  try {
    const { hl } = detectLocaleForSearch();
    const prompt = `Please analyze the following news article. Provide a concise, neutral summary covering the key points, any potential biases detected, and the wider implications of the story.
        IMPORTANT: Your entire response MUST be in the language "${hl}".

Article Title: "${article.title}"
Article Content: "${(article.content || article.summary || '').substring(0, 3000)}"

Return the analysis as a single block of text.`;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    return response.text.trim();
  } catch (error) {
    console.error("Error analyzing news article:", error);
    return "Məqalə təhlil edilərkən xəta baş verdi.";
  }
}

/**
 * Retrieves the current weather and a 5-day forecast for a given location.
 * @param location The location to retrieve the weather for.
 * @returns The weather data.
 */
export async function getWeather(location: string): Promise<WeatherData> {
  try {
    if (!ai) {
      throw new Error('AI açarı yoxdur. Hava məlumatı üçün Open-Meteo modulundan istifadə edin.');
    }
    const { hl } = detectLocaleForSearch();
    const response = await ai.models.generateContent({
      model,
      contents: `Get the current weather and a 5-day forecast for the location: "${location}".
            IMPORTANT: All text content (location, condition, day) MUST be in the language "${hl}".
            Return the result as a single, valid JSON object.
            If the location is found, the JSON object must have a "success" key set to true, and a "data" key containing the weather information with this structure:
            { "location": "City, Country", "current": { "temp": number, "condition": "string" }, "forecast": [ { "day": "string", "temp": number, "condition": "string" }, ... ] }
            If the location is not found or is ambiguous, the JSON object must have a "success" key set to false, and an "error" key with a message like "Məkan tapılmadı".
            Do not include any text, markdown, or commentary outside of the JSON object.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            success: { type: Type.BOOLEAN },
            data: {
              type: Type.OBJECT,
              properties: {
                location: { type: Type.STRING },
                current: {
                  type: Type.OBJECT,
                  properties: {
                    temp: { type: Type.NUMBER },
                    condition: { type: Type.STRING },
                  },
                  required: ['temp', 'condition'],
                },
                forecast: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      day: { type: Type.STRING },
                      temp: { type: Type.NUMBER },
                      condition: { type: Type.STRING },
                    },
                    required: ['day', 'temp', 'condition']
                  },
                },
              },
              required: ['location', 'current', 'forecast']
            },
            error: { type: Type.STRING }
          },
          required: ['success']
        },
      }
    });

    const jsonStr = response.text.trim();
    const result = JSON.parse(jsonStr) as { success: boolean; data?: WeatherData; error?: string };

    if (result.success && result.data) {
      return result.data;
    }

    if (!result.success && result.error) {
      throw new Error(result.error);
    }

    // If we reach here, the response is malformed.
    throw new Error("Hava məlumatı üçün natamam cavab alındı.");

  } catch (error) {
    console.error("Error fetching weather:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Hava məlumatı əldə edilərkən naməlum xəta baş verdi.");
  }
}

/**
 * Translates the given text to the target language.
 * @param text The text to translate.
 * @param targetLang The target language.
 * @returns The translated text.
 */
export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text || !text.trim()) {
    return "";
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        target_language: targetLang,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Tərcümə xətası: Serverdən cavab oxuna bilmədi' }));
      throw new Error(errorData.detail || `Server xətası: ${response.status}`);
    }

    const result = await response.json();
    return result.translated_text || '';

  } catch (error) {
    console.error("Error translating text via backend:", error);
    // Fallback: try direct Gemini translate if API client is configured
    try {
      if (!ai) {
        // Provide helpful guidance for missing key
        const msg = (error instanceof Error ? error.message : '') || '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError')) {
          throw new Error(
            `Tərcümə etmək mümkün olmadı: Backend əlçatmazdır və AI açarı qurulmayıb. ` +
            `Zəhmət olmasa VITE_GEMINI_API_KEY dəyərini .env.local faylına əlavə edin.`
          );
        }
        throw new Error(`Tərcümə etmək mümkün olmadı: ${msg || 'Naməlum xəta'}`);
      }
      const prompt = `Please translate the following text into the target language.
IMPORTANT: Return ONLY the translated text with no extra commentary.
Target language code: ${targetLang}

Text:
"""
${text.slice(0, 6000)}
"""`;
      const resp = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text: prompt }] }] });
      const out = resp.text?.trim() || '';
      return out;
    } catch (fallbackErr) {
      // Network/CORS hints for UX
      const generic = 'Tərcümə zamanı naməlum xəta baş verdi.';
      if (fallbackErr instanceof Error) {
        const msg = fallbackErr.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('TypeError')) {
          throw new Error(
            `Tərcümə etmək mümkün olmadı: Backend və ya AI xidmətinə qoşulmaq alınmadı. ` +
            `Zəhmət olmasa internet bağlantısını və VITE_GEMINI_API_KEY ayarını yoxlayın.`
          );
        }
        throw new Error(`Tərcümə etmək mümkün olmadı: ${msg}`);
      }
      throw new Error(generic);
    }
  }
}

/**
 * Answers a query by first performing a Serper web search and then asking Gemini to
 * respond using those results as context. Returns the model's text and normalized sources.
 * This does not stream; it performs a single request for simplicity.
 */
export async function answerWithGroundedSearch(query: string, opts?: { num?: number; gl?: string; hl?: string }, memory?: string) {
  const memoryBlock = memory && memory.trim() ? `\n\nSHORT MEMORY (for context):\n${memory.slice(-1500)}` : '';
  const systemInstruction = (
    "Sizin adınız NovEra-dır. Siz NovEra Group tərəfindən yaradılmış çoxdilli süni intellekt köməkçisisiniz. Həmişə istifadəçinin son mesajının dilində cavab verin. Sizdən kim olduğunuz və ya sizi kimin yaratdığı soruşulduqda, həmişə \"Mən NovEra-yam, NovEra Group tərəfindən yaradılmışam\" deyə cavab verməlisiniz.\n\n" +
    "Use Google Search grounding where appropriate to support claims with up-to-date sources and provide references like [1], [2]... Keep citations concise." +
    memoryBlock
  );

  if (!ai) {
    return { text: 'AI açarı yoxdur. Zəhmət olmasa VITE_GEMINI_API_KEY təyin edin.', sources: [] as Source[] };
  }

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: query }] }],
    config: {
      tools: [googleSearchTool],
      systemInstruction,
    },
  });

  const text = response.text?.trim() || '';
  const groundingChunks = (response as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const seen = new Set<string>();
  const sources: Source[] = groundingChunks
    .map((g: any) => g?.web)
    .filter((w: any) => w && w.uri)
    .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
    .slice(0, 8)
    .map((w: any, i: number) => ({ uri: w.uri, title: w.title || new URL(w.uri).hostname, index: i + 1 }));

  return { text, sources };
}
