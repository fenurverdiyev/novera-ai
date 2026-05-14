export async function onRequestPost(context) {
  const { env, request } = context;
  const API_KEY = env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }), { status: 500 });
  }

  const body = await request.json();
  const { prompt, systemInstruction, model = 'gemini-2.5-flash' } = body;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

  const contents = typeof prompt === 'string' ? [{ role: 'user', parts: [{ text: prompt }] }] : prompt;

  const payload = {
    contents,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  
  if (!response.ok) {
    return new Response(JSON.stringify({ error: 'Gemini API Error', details: result }), { status: response.status });
  }

  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return new Response(JSON.stringify({ text }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
