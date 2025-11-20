// This is a Vercel-style serverless function.
// It acts as a secure proxy to the ElevenLabs API.

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const body = await request.json();
    const text = (body?.text || '').toString();
    const vid = (body?.voiceId || body?.voice_id || '').toString();
    const rawStability = typeof body?.stability === 'number' ? body.stability : 0.5;
    const stability = rawStability <= 0.25 ? 0 : (rawStability <= 0.75 ? 0.5 : 1);
    const similarity = Math.max(0, Math.min(1, typeof body?.similarity_boost === 'number' ? body.similarity_boost : 0.75));
    const style = Math.max(0, Math.min(1, typeof body?.style === 'number' ? body.style : 0.0));
    // eleven_v3 does not support optimize_streaming_latency query param
    const outputFormat = (body?.output_format || 'mp3_22050_32').toString();

    if (!text || !vid) {
      return new Response(JSON.stringify({ error: "Missing 'text' or 'voiceId/voice_id' in request body." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    if (!ELEVENLABS_API_KEY) {
      console.error("ElevenLabs API key not set on the server.");
      return new Response(JSON.stringify({ error: "TTS service is not configured." }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const BASE = 'https://api.elevenlabs.io/v1';
    const headers = {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    } as const;
    const payload = {
      text,
      model_id: 'eleven_v3',
      voice_settings: {
        stability,
        similarity_boost: similarity,
        style,
        use_speaker_boost: true,
      },
    } as const;

    // Prefer low-latency streaming endpoint
    const streamUrl = `${BASE}/text-to-speech/${encodeURIComponent(vid)}/stream?output_format=${encodeURIComponent(outputFormat)}`;
    const streamResp = await fetch(streamUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (streamResp.ok) {
      return new Response(streamResp.body, { headers: { 'Content-Type': 'audio/mpeg' } });
    }

    // Fallback to standard endpoint
    const stdUrl = `${BASE}/text-to-speech/${encodeURIComponent(vid)}`;
    const stdResp = await fetch(stdUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!stdResp.ok) {
      const errText = await stdResp.text().catch(() => '');
      console.error('ElevenLabs API Error:', stdResp.status, errText);
      return new Response(JSON.stringify({ error: 'ElevenLabs API request failed' }), { status: stdResp.status, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(stdResp.body, { headers: { 'Content-Type': 'audio/mpeg' } });

  } catch (error) {
    console.error("Error in ElevenLabs proxy:", error);
    return new Response(JSON.stringify({ error: "An internal server error occurred." }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
