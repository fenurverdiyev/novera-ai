export async function onRequestPost(context) {
  const { env, request } = context;
  const API_KEY = env.GEMINI_API_KEY;
  
  if (!API_KEY) return new Response(JSON.stringify({ error: 'GEMINI_API_KEY missing' }), { status: 500 });

  const { text, target_language } = await request.json();
  const prompt = `Translate to ${target_language}. Return ONLY the translation.\n\nText: ${text}`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });

  const result = await response.json();
  const translated = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;

  return new Response(JSON.stringify({ translated_text: translated }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
