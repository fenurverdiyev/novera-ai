export async function onRequestPost(context) {
  const { env, request } = context;
  const API_KEY = env.GEMINI_API_KEY;
  
  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not set' }), { status: 500 });
  }

  const body = await request.json();
  const { contents, systemInstruction, model = 'gemini-2.5-flash', generationConfig } = body;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${API_KEY}`;

  const payload = {
    contents,
    systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
    generationConfig: {
      temperature: generationConfig?.temperature ?? 0.7,
      maxOutputTokens: generationConfig?.maxOutputTokens ?? 4096,
      ...generationConfig
    },
    tools: [{ google_search: {} }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    return new Response(JSON.stringify({ error: `Gemini API error: ${response.status}`, details: errorText }), { status: response.status });
  }

  // Create a TransformStream to pass through the SSE data
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const reader = response.body.getReader();

  const processStream = async () => {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim().startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              const groundingMetadata = data.candidates?.[0]?.groundingMetadata || null;
              
              const output = { text, groundingMetadata };
              await writer.write(encoder.encode(`data: ${JSON.stringify(output)}\n\n`));
            } catch (e) {
              // Handle partial JSON or [DONE]
              if (line.includes('[DONE]')) {
                await writer.write(encoder.encode('data: [DONE]\n\n'));
              }
            }
          }
        }
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (err) {
      console.error('Stream processing error:', err);
    } finally {
      writer.close();
    }
  };

  processStream();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
