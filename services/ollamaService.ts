import type { Message } from '../types';
import { searchWeb } from './searchService';

const OLLAMA_BACKEND_URL = "http://localhost:3000";

/**
 * Ollama API vasitəsilə sorğu (Streaming və parametr ləğv edildi).
 * App.tsx AsyncGenerator gözlədiyi üçün cavabı birbaşa 1 chunk kimi qaytarırıq.
 */
export async function* streamChatQueryOllama(
  prompt: string,
  history: Message[],
  modelName: string = "batiai/gemma4-e4b:q4"
): AsyncGenerator<{ text?: string }> {
  
  // History-ni Ollama formatına uyğunlaşdırmaq
  const messages = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.text
  }));
  
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${OLLAMA_BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: messages
    })
  });

  if (!res.ok) {
    yield { text: `Ollama xətası: Backend cavab vermir.` };
    return;
  }

  const data = await res.json();
  if (data.message?.content) {
    yield { text: data.message.content };
  }
}

/**
 * Universe Search üçün Ollama Streaming funksiyası.
 */
export async function* streamChatQueryOllamaUniverse(
  prompt: string,
  history: Message[],
  modelName: string = "batiai/gemma4-e4b:q4"
): AsyncGenerator<{ text?: string, sources?: any[] }> {
  
  // 1. İnternetdə axtarış edirik
  let searchContext = "";
  let sources: any[] = [];
  
  try {
    const webResults = await searchWeb(prompt, 6);
    if (webResults && webResults.organic && webResults.organic.length > 0) {
      sources = webResults.organic.map((r, index) => ({
        title: r.title,
        uri: r.link,
        index: index + 1
      }));
      
      const snippets = webResults.organic.map((r, i) => `[${i + 1}] Mənbə: ${r.link}\nMəlumat: ${r.snippet}`).join("\n\n");
      searchContext = `Aşağıdakı internet axtarış nəticələrindən istifadə edərək istifadəçinin sualına cavab ver. Əgər nəticələrdə lazımi məlumat yoxdursa, öz biliklərinlə cavablandır.\n\nAxtarış Nəticələri:\n${snippets}\n\n`;
    }
  } catch (error) {
    console.error("Web search failed:", error);
  }

  const messages: any[] = [
    {
      role: 'system',
      content: 'Sənin adın NovEra-dır. Sən NovEra şirkəti tərəfindən yaradılmış qabaqcıl süni intellekt asistanısan. Həmişə özünü NovEra kimi təqdim et. Azərbaycan dilində səlis, mehriban və qısa cavablar ver.'
    },
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    }))
  ];
  
  // Axtarış nəticəsini sistem kimi və ya promptun əvvəlinə əlavə edirik
  const finalPrompt = searchContext ? `${searchContext}Sual: ${prompt}` : prompt;
  messages.push({ role: "user", content: finalPrompt });

  // İlk olaraq mənbələri UI-a göndəririk ki, ekranda görünsün
  if (sources.length > 0) {
    yield { sources };
  }

  const res = await fetch(`${OLLAMA_BACKEND_URL}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.7,
      top_p: 0.9
    })
  });

  if (!res.ok || !res.body) {
    yield { text: `Ollama xətası: Backend cavab vermir.` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    buffer += chunk;
    
    const lines = buffer.split('\n');
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed.message?.content) {
          yield { text: parsed.message.content };
        }
      } catch (e) {}
    }
  }
}

/**
 * Sadə sorğu (streaming olmadan)
 */
export async function chatQueryOllama(
  prompt: string,
  history: Message[],
  modelName: string = "batiai/gemma4-e4b:q4"
): Promise<string> {
  const messages = history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'assistant',
    content: msg.text
  }));
  
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${OLLAMA_BACKEND_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelName,
      messages: messages,
      temperature: 0.7,
      top_p: 0.9
    })
  });

  if (!res.ok) {
    throw new Error(`Xəta baş verdi: ${res.statusText}`);
  }

  const data = await res.json();
  return data.message?.content || "";
}
