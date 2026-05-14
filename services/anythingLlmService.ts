import type { Message } from '../types';

// AnythingLLM standart olaraq 3001 portunda işləyir. Fərqlidirsə, burdan dəyişdirə bilərsən.
const ANYTHING_LLM_URL = "http://localhost:3001"; 
const API_KEY = "ZRM2R9C-9FE4PC8-K1J8WBD-28SY11G";
const WORKSPACE_SLUG = "my-workspace";

/**
 * AnythingLLM API vasitəsilə sorğu.
 * App.tsx AsyncGenerator gözlədiyi üçün cavabı birbaşa 1 chunk kimi qaytarırıq.
 */
export async function* chatQueryAnythingLLM(
  prompt: string,
  history: Message[]
): AsyncGenerator<{ text?: string, sources?: any[] }> {
  
  // AnythingLLM chat yaddaşını "sessionId" vasitəsilə özü saxlayır. 
  // Hər dəfə eyni ID-ni göndərdikdə əvvəlki söhbəti xatırlayır.
  const sessionId = "novera-chat-session";

  try {
    const res = await fetch(`${ANYTHING_LLM_URL}/api/v1/workspace/${WORKSPACE_SLUG}/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        message: prompt,
        mode: "chat", // "chat" istifadə edərək LLM bilikləri və yaddaşı ilə cavab alırıq
        sessionId: sessionId,
        reset: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      yield { text: `AnythingLLM xətası (${res.status}): ${err}` };
      return;
    }

    const data = await res.json();
    
    if (data.textResponse) {
      // AnythingLLM cavabı və tapdığı mənbələri (sources) qaytarırıq
      yield { text: data.textResponse, sources: data.sources };
    }
  } catch (error: any) {
    yield { text: `Xəta baş verdi: ${error.message}` };
  }
}

/**
 * Universe Search (Grounded Search) üçün AnythingLLM API funksiyası.
 * Birbaşa olaraq mətni və tapılan sənədləri (mənbələri) qaytarır.
 */
export async function answerWithAnythingLLM(
  prompt: string,
  history?: string
): Promise<{ text: string, sources: any[] }> {
  try {
    const sessionId = "novera-chat-session";

    const res = await fetch(`${ANYTHING_LLM_URL}/api/v1/workspace/${WORKSPACE_SLUG}/chat`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        message: prompt,
        mode: "automatic", // "automatic" və ya "query" rejimi Workspace məlumatları daxilində axtarış edir
        sessionId: sessionId,
        reset: false
      })
    });

    if (!res.ok) {
      const err = await res.text();
      return { text: `AnythingLLM xətası (${res.status}): ${err}`, sources: [] };
    }

    const data = await res.json();
    return {
      text: data.textResponse || '',
      sources: data.sources || []
    };
  } catch (error: any) {
    return { text: `Xəta baş verdi: ${error.message}`, sources: [] };
  }
}
