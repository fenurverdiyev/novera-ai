
/**
 * Normalizes user input for intent matching.
 */
export function normalizeText(text: string): string {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .trim()
    // Remove emojis
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, "")
    // Fix repeated letters (e.g., "salammm" -> "salam")
    // This is a simple approach: if more than 2 same characters repeat, reduce to 1.
    // For specific words like "salam", we might want more precision.
    .replace(/(.)\1{2,}/g, "$1")
    .trim();
}

const intents: Record<string, { keywords: string[], responses: string[] }> = {
  greeting: {
    keywords: ["salam", "hello", "hi", "hey"],
    responses: [
      "Salam, necə kömək edə bilərəm?",
      "Salam! Nə lazımdır?",
      "Salam dostum 👋"
    ]
  },
  status: {
    keywords: ["necəsən", "nə var nə yox", "necesen"],
    responses: [
      "Yaxşıyam, sən necəsən?",
      "Hər şey qaydasındadır 👍",
      "Mən bir süni intellektəm, həmişə işləməyə hazıram! Sən necəsən?"
    ]
  },
  thanks: {
    keywords: ["sağ ol", "təşəkkür", "sag ol", "tesekkur", "thanks"],
    responses: [
      "Sən sağ ol 😊",
      "Hər zaman!",
      "Kömək edə bildimsə nə xoş mənə!"
    ]
  },
  bye: {
    keywords: ["hələlik", "bye", "sağ ol hələlik", "helelik"],
    responses: [
      "Hələlik! Yenə gözləyirəm.",
      "Görüşənədək 👋",
      "Sağ olun, özünüzə yaxşı baxın!"
    ]
  },
  identity: {
    keywords: ["kimsən", "kimsen", "sən kimsən", "sen kimsen", "adın nədir", "adin nedir", "kim tərəfindən yaradılmısan", "kim terefinden yaradilmisan", "yaradıcın kimdir", "yaradicin kimdir", "yaradanın kimdir", "yaradanin kimdir", "kim hazırlayıb", "kim hazirlayib"],
    responses: [
      "Mən NovEra-yam. NovEra şirkəti tərəfindən yaradılmış süni intellekt köməkçisiyəm.",
      "Mənim adım NovEra-dır. NovEra şirkəti tərəfindən hazırlanmışam.",
      "NovEra şirkəti tərəfindən yaradılmış ağıllı köməkçiniz NovEra-yam."
    ]
  }
};

/**
 * Checks if the message matches a local intent and returns a random response if it does.
 */
export function matchLocalIntent(message: string): string | null {
  const normalized = normalizeText(message);
  if (!normalized) return null;

  const words = normalized.split(/\s+/);

  // Rule: If message is too long, it's likely a complex query, skip local match
  if (words.length > 5) return null;

  // 1. Exact Match (Highest Priority)
  for (const [intent, data] of Object.entries(intents)) {
    if (data.keywords.some(k => normalized === k)) {
      return getRandomResponse(data.responses);
    }
  }

  // 2. StartsWith Match
  // Specific rule for "salam": only match if it's at the beginning and the message is short
  if (normalized.startsWith("salam") && words.length <= 3) {
     return getRandomResponse(intents.greeting.responses);
  }

  for (const [intent, data] of Object.entries(intents)) {
    // Skip greeting as we handled "salam" specifically and other greetings might be too broad
    if (intent === 'greeting') continue; 
    
    if (data.keywords.some(k => normalized.startsWith(k))) {
      return getRandomResponse(data.responses);
    }
  }

  // 3. Includes Match (Lowest Priority)
  // Only for very short messages to avoid false positives
  if (words.length <= 2) {
    for (const [intent, data] of Object.entries(intents)) {
      if (data.keywords.some(k => normalized.includes(k))) {
        return getRandomResponse(data.responses);
      }
    }
  }

  return null;
}

export function isImageGenIntent(text: string): boolean {
  const normalized = normalizeText(text);
  const keywords = [
    "şəkil yarat", "sekil yarat", "şəkil çək", "sekil cek", "şəkil qur", "sekil qur",
    "create image", "generate image", "draw", "şəklini çək", "seklini cek",
    "görüntü yarat", "goruntu yarat", "təsvir et", "tesvir et", "nə təsvir et", "ne tesvir et",
    "image create", "image gen", "rəsm çək", "resm cek"
  ];
  return keywords.some(k => normalized.includes(k));
}

export function isImageSearchIntent(text: string): boolean {
  const normalized = normalizeText(text);
  const keywords = [
    "şəkil göstər", "sekil goster", "şəkil tap", "sekil tap", "şəkillər tap", "sekiller tap",
    "find image", "show image", "search image", "find images", "görüntü tap", "goruntu tap"
  ];
  return keywords.some(k => normalized.includes(k));
}

export function isCanvasIntent(text: string): boolean {
  const normalized = normalizeText(text);
  const keywords = [
    "tətbiq yarat", "tetbiq yarat", "proqram yarat", "oyun yarat", "sayt yarat",
    "vizuallaşdırma yarat", "vizuallasdirma yarat", "canvas yarat", "kod yaz",
    "create app", "create application", "create game", "create website",
    "interactive visualization", "interaktiv vizuallaşdırma", "qrafik yarat",
    "dashboard yarat", "panel yarat", "alət yarat", "alet yarat"
  ];
  return keywords.some(k => normalized.includes(k));
}


function getRandomResponse(responses: string[]): string {
  return responses[Math.floor(Math.random() * responses.length)];
}
