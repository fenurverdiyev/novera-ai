import type { Message } from '../types';
import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY;

// Sənin Mistral UI-da yaratdığın Agentin ID-si (Əgər istəsən agentdən istifadə edə bilərsən)
// const AGENT_ID = "ag_019dbea339927764b09ce6ffa110bab0"; 

export async function* chatQueryMistral(
  prompt: string,
  history: Message[]
): AsyncGenerator<{ text?: string }> {
  
  if (!MISTRAL_API_KEY) {
    yield { text: "Xəta: VITE_MISTRAL_API_KEY tapılmadı." };
    return;
  }

  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  // History-ni Mistral formatına uyğunlaşdırmaq və ən əvvələ System Prompt əlavə etmək
  const messages: any[] = [
    { 
      role: 'system', 
      content: 'Sənin adın NovEra-dır. Sən NovEra şirkəti tərəfindən yaradılmış qabaqcıl süni intellekt asistanısan. MÜHÜM TƏLİMAT: Öz daxili axtarış (web_search) alətindən istifadə edərək ən güncəl məlumatları tap və istifadəçiyə Azərbaycan dilində mehriban cavab ver.' 
    },
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text
    }))
  ];
  
  messages.push({ role: "user", content: prompt });

  try {
    // Modelin birbaşa Web Search edə bilməsi üçün tools əlavə edirik
    const res = await client.chat.complete({
      model: "mistral-large-latest",
      messages: messages,
      tools: [{ type: "web_search" }]
    });

    if (res.choices && res.choices[0] && res.choices[0].message) {
      yield { text: res.choices[0].message.content as string };
    } else {
      yield { text: "Mistral-dan gözlənilməz cavab formatı gəldi." };
    }
  } catch (error: any) {
    yield { text: `Xəta baş verdi: ${error.message}` };
  }
}
