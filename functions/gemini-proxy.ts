// This is a serverless function that acts as a secure proxy to the Gemini API.
// It protects the API key by never exposing it to the client.

export const config = { runtime: 'edge' };

export default async function handler(request: Request) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const body = await request.json();
    const { model, systemInstruction, tools, ...rest } = body || {};
    const modelName = (typeof model === 'string' && model.trim()) ? model.trim() : 'gemini-2.5-flash';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent`;

    // Normalize payload for REST API
    const normalized: any = { ...rest };
    if (systemInstruction && !normalized.system_instruction) {
      normalized.system_instruction = systemInstruction; // pass through as provided by client
    }
    if (Array.isArray(tools)) {
      normalized.tools = tools.map((t: any) => {
        if (t && t.googleSearch) {
          const { googleSearch, ...others } = t;
          return { ...others, google_search: t.googleSearch };
        }
        return t;
      });
    }

    const geminiResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(normalized),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('Gemini API Error:', geminiResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch from Gemini API' }), {
        status: geminiResponse.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Pipe the streaming response directly to the client
    return new Response(geminiResponse.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
      },
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
