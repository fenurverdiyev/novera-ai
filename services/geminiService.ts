// Fix: The `FunctionDeclarationTool` type does not exist in `@google/genai`. It has been replaced with the correct `Tool` type.
import { GoogleGenAI, Type, Content, Tool } from "@google/genai";
import type { Source, NewsArticle, WeatherData, Message } from '../types';
import { detectLocaleForSearch } from './searchService';


const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Do not crash the app if the API key is missing; degrade gracefully instead
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const BACKEND_URL = (import.meta.env.VITE_TTS_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '');
const model = 'gemini-2.5-flash';

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
        role: msg.role,
        parts: [{ text: msg.text }]
    }));
};

export async function* streamChatQuery(
    prompt: string,
    history: Message[],
    images: string[] = [],
    memory?: string,
    forceGrounding?: boolean,
): AsyncGenerator<{ text?: string; sources?: Source[], images?: string[], videos?: string[], toolCalls?: any[] }> {
    if (!ai) {
        // Graceful fallback when no API key is provided
        yield { text: 'AI cavabД± hazД±rda aktiv deyil (VITE_GEMINI_API_KEY qurulmayД±b). ZЙ™hmЙ™t olmasa ayarlarda API aГ§arД±nД± Й™lavЙ™ edin.' };
        return;
    }
    const memoryBlock = memory && memory.trim() ? `\n\nQISA YADDAŞ (kontekstə kömək üçün):\n${memory.slice(-1500)}` : '';
    const systemInstruction =
      "Sən NovEra adlı köməkçisən və bütün cavablarını Azərbaycan dilində ver. " +
      "İstifadəçi vizual (şəkil/video) istəyirsə, MÜTLƏQ `webSearch` alətini çağır və nəticələrin URL-lərini səthə çıxar. " +
      "Alətdən istifadə etmədən vizual məzmun haqqında şərh vermə." +
      memoryBlock;
    
    const historicContent = mapMessagesToContent(history);
    
    const userParts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: prompt }];
    if (images.length > 0) {
        images.forEach(imgData => {
            userParts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: imgData.split(',')[1],
                }
            });
        });
    }

    const contents: Content[] = [...historicContent, { role: 'user', parts: userParts }];

    let responseStream: any;
    try {
      responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          tools: [googleSearchTool, ...assistantTools],
          systemInstruction,
        },
      });
    } catch (err) {
      // Fallback: non-streaming single shot to return something fast and stable
      try {
        const fallback = await ai.models.generateContent({
          model,
          contents,
          config: { tools: [googleSearchTool], systemInstruction },
        });
        const text = fallback.text?.trim();
        const groundingChunks = (fallback as any).candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const seen = new Set<string>();
        const sources: Source[] = groundingChunks
          .map((g: any) => g?.web)
          .filter((w: any) => w && w.uri)
          .filter((w: any) => { if (seen.has(w.uri)) return false; seen.add(w.uri); return true; })
          .slice(0, 8)
          .map((w: any, i: number) => ({ uri: w.uri, title: w.title || new URL(w.uri).hostname, index: i + 1 }));
        if (text) {
          yield { text, sources: sources.length ? sources : undefined };
          return;
        }
      } catch (e2) {
        yield { text: 'Hazırda cavab generasiyasında problem yaşandı. Zəhmət olmasa bir qədər sonra yenidən cəhd edin.' };
        return;
      }
    }

    let sourceIndex = 1;
    const seenUris = new Set<string>();
    
    const imageRegex = /\u005Bimage:\s*(https?:\/\/[^\u005D]+)\u005D/g;
    const videoRegex = /\u005Bvideo:\s*(https?:\/\/[^\u005D]+)\u005D/g;


    for await (const chunk of responseStream) {
        let text = chunk.text;
        
        const newImages: string[] = [];
        const newVideos: string[] = [];

        if (text) {
            const imageMatches = text.matchAll(imageRegex);
            for (const match of imageMatches) {
                newImages.push(match[1]);
            }
            text = text.replace(imageRegex, '').trim();

            const videoMatches = text.matchAll(videoRegex);
            for (const match of videoMatches) {
                newVideos.push(match[1]);
            }
            text = text.replace(videoRegex, '').trim();
        }

        const newSources: Source[] = [];
        const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (groundingChunks) {
            for (const { web } of groundingChunks) {
                if (web?.uri && !seenUris.has(web.uri)) {
                    newSources.push({
                        uri: web.uri,
                        title: web.title || new URL(web.uri).hostname,
                        index: sourceIndex++,
                    });
                    seenUris.add(web.uri);
                }
            }
        }
        
        // Return tool calls in the wrapper shape expected by App.tsx: { functionCall: { name, args } }
        const toolCallParts = chunk.candidates?.[0]?.content?.parts
            ?.filter(part => !!(part as any).functionCall) as any[] | undefined;

        yield { 
            text, 
            sources: newSources.length > 0 ? newSources : undefined,
            images: newImages.length > 0 ? newImages : undefined,
            videos: newVideos.length > 0 ? newVideos : undefined,
            toolCalls: toolCallParts && toolCallParts.length ? toolCallParts : undefined,
        };
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
IMPORTANT: The questions MUST be in the Azerbaijani language.

Question: "${prompt}"

Answer: "${answer.substring(0, 2000)}..."

Return the questions as a JSON array of strings.`;

        const response = await ai.models.generateContent({
            model,
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        questions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.STRING
                            }
                        }
                    }
                }
            }
        });

        const jsonStr = response.text.trim();
        const result = JSON.parse(jsonStr);
        return result.questions || [];

    } catch (error) {
        console.error("Error generating related questions:", error);
        return [];
    }
}

/**
 * Analyzes a news article and provides a summary, potential biases, and wider implications.
 * @param article The news article to analyze.
 * @returns A summary of the article.
 */
export async function analyzeNewsArticle(article: NewsArticle): Promise<string> {
    if (!ai) return "AI tЙ™hlili hazД±rda Й™lГ§atmazdД±r. XahiЕџ edirik sonra yenidЙ™n cЙ™hd edin.";
    try {
        const prompt = `Please analyze the following news article. Provide a concise, neutral summary covering the key points, any potential biases detected, and the wider implications of the story.
        IMPORTANT: Your entire response MUST be in the Azerbaijani language.

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
        return "MЙ™qalЙ™ tЙ™hlil edilЙ™rkЙ™n xЙ™ta baЕџ verdi.";
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
            throw new Error('AI aГ§arД± yoxdur. Hava mЙ™lumatД± ГјГ§Гјn Open-Meteo modulundan istifadЙ™ edin.');
        }
        const response = await ai.models.generateContent({
            model,
            contents: `Get the current weather and a 5-day forecast for the location: "${location}".
            IMPORTANT: All text content (location, condition, day) MUST be in the Azerbaijani language.
            Return the result as a single, valid JSON object.
            If the location is found, the JSON object must have a "success" key set to true, and a "data" key containing the weather information with this structure:
            { "location": "City, Country", "current": { "temp": number, "condition": "string" }, "forecast": [ { "day": "string", "temp": number, "condition": "string" }, ... ] }
            If the location is not found or is ambiguous, the JSON object must have a "success" key set to false, and an "error" key with a message like "MЙ™kan tapД±lmadД±".
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
        throw new Error("Hava mЙ™lumatД± ГјГ§Гјn natamam cavab alД±ndД±.");

    } catch (error) {
        console.error("Error fetching weather:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("Hava mЙ™lumatД± Й™ldЙ™ edilЙ™rkЙ™n namЙ™lum xЙ™ta baЕџ verdi.");
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
  const memoryBlock = memory && memory.trim() ? `\n\nQISA YADDAЕћ (kontekstЙ™ kГ¶mЙ™k ГјГ§Гјn):\n${memory.slice(-1500)}` : '';
  const systemInstruction = `SЙ™n NovEra adlД± kГ¶mЙ™kГ§isЙ™n vЙ™ bГјtГјn cavablarД±nД± AzЙ™rbaycan dilindЙ™ ver.\n\n` +
    `Cavab verЙ™rkЙ™n Google AxtarД±Еџ alЙ™tindЙ™n (grounding) istifadЙ™ et, iddialarД± Й™n son mЙ™nbЙ™lЙ™rlЙ™ dЙ™stЙ™klЙ™ vЙ™ [1], [2]... kimi istinadlar ver.\n` +
    `MЙ™nbЙ™lЙ™rdЙ™n sitat gЙ™tirЙ™rkЙ™n qД±sa vЙ™ dЙ™qiq ol.` + memoryBlock;

  if (!ai) {
    return { text: 'AI aГ§arД± yoxdur. ZЙ™hmЙ™t olmasa VITE_GEMINI_API_KEY tЙ™yin edin.', sources: [] as Source[] };
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
