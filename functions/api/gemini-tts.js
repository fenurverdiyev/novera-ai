export async function onRequestPost(context) {
  const { env, request } = context;
  const API_KEY = env.GEMINI_API_KEY;
  if (!API_KEY) return new Response('API_KEY missing', { status: 500 });

  const { text, voice_name = 'Kore' } = await request.json();

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice_name } } }
      }
    })
  });

  const result = await response.json();
  const audioData = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;

  if (!audioData) return new Response('TTS failed', { status: 500 });

  const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));

  return new Response(audioBuffer, {
    headers: { 'Content-Type': 'audio/wav' }
  });
}
