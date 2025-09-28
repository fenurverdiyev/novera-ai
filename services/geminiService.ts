// Fix: The `FunctionDeclarationTool` type does not exist in `@google/genai`. It has been replaced with the correct `Tool` type.
import { GoogleGenAI, Type, Content, Tool } from "@google/genai";
import type { Source, NewsArticle, WeatherData, Message } from '../types';
import { searchWeb as serperSearchWeb, SerperResponse, detectLocaleForSearch } from './searchService';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_TRANSLATE_API_KEY = import.meta.env.VITE_GEMINI_TRANSLATE_API_KEY;

// Do not crash the app if the API key is missing; degrade gracefully instead
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;
const aiTranslate = GEMINI_TRANSLATE_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_TRANSLATE_API_KEY })
  : (GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null);
const model = 'gemini-2.5-flash';

// Add new device assistant functions
// Fix: The type `FunctionDeclarationTool[]` is incorrect and has been replaced with `Tool[]`.
const assistantTools: Tool[] = [
    {
      functionDeclarations: [
        {
          name: 'makeCall',
          description: 'Cihazın defolt zəng proqramını istifadə edərək müəyyən bir kontakta telefon zəngi et.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              contactName: {
                type: Type.STRING,
                description: 'Zəng ediləcək şəxsin adı, məsələn, "Fuad".',
              },
            },
            required: ['contactName'],
          },
        },
        {
          name: 'sendMessage',
          description: 'Müəyyən bir proqram (SMS, WhatsApp, email) vasitəsilə bir kontakta mesaj göndər.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              contactName: {
                type: Type.STRING,
                description: 'Mesaj göndəriləcək şəxsin adı, məsələn, "Fuad".',
              },
              message: {
                type: Type.STRING,
                description: 'Mesajın məzmunu.',
              },
              service: {
                type: Type.STRING,
                description: 'Mesaj göndərmək üçün istifadə ediləcək proqram. Dəstəklənənlər: "sms", "whatsapp", "email".',
              },
            },
            required: ['contactName', 'message', 'service'],
          },
        },
        {
          name: 'setAlarm',
          description: 'Cihazda müəyyən bir vaxt və başlıq üçün siqnal (zəngli saat) qur.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              time: {
                type: Type.STRING,
                description: 'Siqnalın qurulacağı vaxt, məsələn, "07:30" və ya "axşam 9".',
              },
              label: {
                type: Type.STRING,
                description: 'Siqnal üçün etiket və ya ad, məsələn, "İşə getmək".',
              },
            },
            required: ['time'],
          },
        },
        {
          name: 'addCalendarEvent',
          description: 'Cihazın təqviminə yeni bir tədbir əlavə et.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: 'Tədbirin adı.' },
              description: { type: Type.STRING, description: 'Tədbirin təsviri.' },
              startTime: { type: Type.STRING, description: 'Başlama vaxtı (ISO 8601 formatında və ya anlaşılan dildə).' },
              endTime: { type: Type.STRING, description: 'Bitmə vaxtı (ISO 8601 formatında və ya anlaşılan dildə).' },
            },
            required: ['title', 'startTime'],
          },
        },
        {
          name: 'addNote',
          description: 'Cihazın qeyd proqramına yeni bir qeyd əlavə et.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              content: {
                type: Type.STRING,
                description: 'Qeydin məzmunu.',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'toggleDevice',
          description: 'Cihazın funksiyalarını (WiFi, Bluetooth, Fənər) yandırmaq və ya söndürmək.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              device: {
                type: Type.STRING,
                description: 'İdarə ediləcək funksiya. Dəstəklənənlər: "wifi", "bluetooth", "flashlight".',
              },
              state: {
                type: Type.STRING,
                description: 'Funksiyanın vəziyyəti. Dəstəklənənlər: "on", "off".',
              },
            },
            required: ['device', 'state'],
          },
        },
        {
          name: 'webSearch',
          description: 'Vebdə şəkil və videoları tapmaq üçün axtarış aparır. Tapılan URL-lər tətbiqdə istifadəçiyə göstərilir.',
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
): AsyncGenerator<{ text?: string; sources?: Source[], images?: string[], videos?: string[], toolCalls?: any[] }> {
    if (!ai) {
        // Graceful fallback when no API key is provided
        yield { text: 'AI cavabı hazırda aktiv deyil (VITE_GEMINI_API_KEY qurulmayıb). Zəhmət olmasa ayarlarda API açarını əlavə edin.' };
        return;
    }
    const memoryBlock = memory && memory.trim() ? `\n\nQISA YADDAŞ (kontekstə kömək üçün):\n${memory.slice(-1500)}` : '';
    const systemInstruction = `Sən NovEra adlı bir köməkçi assistantsan və bütün cavablarını Azərbaycan dilində verməlisən. Hər cavabın əvvəlində qısa təqdimat ver: 'Mən NovEra-yam — NovEra şirkəti tərəfindən yaradılmış AI köməkçi.' Mətn cavablar üçün yalnız Google Search Grounding alətindən (google_search) istifadə et, iddiaları mənbələrlə dəstəklə. Şəkil, video, məkan və alış-veriş nəticələrini toplamaq SƏNİN VƏZİFƏN DEYİL — bunları tətbiq özü (Serper API) təmin edəcək. Vizual linkləri uydurma və ya özbaşına çıxarma. Mənbələr olduqda cavabın sonunda qısa "Mənbələr" bölməsi göstər.` + memoryBlock;
    
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

    const responseStream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
            // Only allow official Google Search grounding for text answers
            tools: ([{ google_search: {} }]) as any,
            systemInstruction,
        },
    });

    let sourceIndex = 1;
    const seenUris = new Set<string>();
    
    const imageRegex = /\[image:\s*(https?:\/\/[^\]]+)\]/g;
    const videoRegex = /\[video:\s*(https?:\/\/[^\]]+)\]/g;


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
    if (!ai) return "AI təhlili hazırda əlçatmazdır. Xahiş edirik sonra yenidən cəhd edin.";
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
        const response = await ai.models.generateContent({
            model,
            contents: `Get the current weather and a 5-day forecast for the location: "${location}".
            IMPORTANT: All text content (location, condition, day) MUST be in the Azerbaijani language.
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
        if (!aiTranslate) {
            // Fallback: no translation available
            return text;
        }
        const response = await aiTranslate.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Translate the following text to ${targetLang}. Rules:\n- Preserve original line breaks.\n- Return ONLY the translated text.\n- Do NOT add quotes, code fences, or any commentary.\n\nTEXT:\n${text}`,
            config: { responseMimeType: 'text/plain' as any },
        });
        let out = (response.text || '').trim();
        // Strip accidental fences/quotes
        out = out.replace(/^```[a-zA-Z]*\n?|```$/g, '').trim();
        if ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'"))) {
            out = out.slice(1, -1);
        }
        return out.trim();
    } catch (error) {
        console.error("Error translating text:", error);
        throw new Error("Tərcümə etmək mümkün olmadı.");
    }
}
/**
 * Answers a query by performing a grounded call with Google Search tools enabled.
 * Falls back to Serper listing when AI is unavailable.
 * This does not stream; it performs a single request for simplicity.
 */
export async function answerWithGroundedSearch(query: string, opts?: { num?: number; gl?: string; hl?: string }, memory?: string) {
  // Fallback path when AI is unavailable: return Serper results as a simple list
  if (!ai) {
    const locale = (opts?.hl && opts?.gl) ? { hl: opts.hl, gl: opts.gl } : detectLocaleForSearch();
    const serper: SerperResponse | null = await serperSearchWeb(query, Math.min(opts?.num ?? 8, 12), { gl: locale.gl, hl: locale.hl });
    const organic = serper?.organic || [];
    const sources: Source[] = organic.slice(0, 6).map((r, i) => ({
      uri: r.link,
      title: r.title || new URL(r.link).hostname,
      index: i + 1,
    }));
    const list = organic.slice(0, 6).map((r, i) => `${i + 1}) ${r.title} — ${r.link}`).join('\n');
    const text = organic.length
      ? `Axtarış nəticələri (Serper):\n${list}\n\nDaha dəqiq cavab üçün AI açarını (VITE_GEMINI_API_KEY) konfiqurasiya edin.`
      : 'Uyğun nəticə tapılmadı.';
    return { text, sources };
  }

  // Grounding with Google Search via Gemini tools
  const memoryBlock = memory && memory.trim() ? `\n\nQISA YADDAŞ (kontekstə kömək üçün):\n${memory.slice(-1500)}` : '';
  const systemInstruction = `Sən NovEra adlı köməkçisən və bütün cavablarını Azərbaycan dilində ver. Cavabın əvvəlində qısa təqdimat ver: "Mən NovEra-yam — NovEra şirkəti tərəfindən yaradılmış AI köməkçi."\n\n` +
    `Mütləq şəkildə iddialarını mənbələrlə dəstəklə və cavabın sonunda \"Mənbələr\" bölməsində linkləri göstər.\n` +
    `Əgər dəqiq cavab tapılmırsa, bunu açıq şəkildə bildir.` + memoryBlock;

  const contents: Content[] = [{ role: 'user', parts: [{ text: query }] }];

  const groundedModel = 'gemini-2.5-flash';
  const response = await ai.models.generateContent({
    model: groundedModel,
    contents,
    config: {
      systemInstruction,
      // Enable official Google Search Grounding
      tools: [{ google_search: {} } as any],
    },
  });

  const text = response.text?.trim() || '';

  // Extract grounded sources from grounding metadata
  const seenUris = new Set<string>();
  const sources: Source[] = [];
  const groundingChunks = (response as any)?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (Array.isArray(groundingChunks)) {
    let index = 1;
    for (const { web } of groundingChunks) {
      if (web?.uri && !seenUris.has(web.uri)) {
        sources.push({ uri: web.uri, title: web.title || new URL(web.uri).hostname, index });
        seenUris.add(web.uri);
        index++;
      }
    }
  }

  return { text, sources };
}