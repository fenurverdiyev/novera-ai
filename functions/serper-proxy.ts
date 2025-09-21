// Vercel-style Edge Function: Secure proxy to Serper API
export const config = { runtime: 'edge' };

interface ProxyRequestBody {
  type: 'search' | 'images' | 'videos' | 'news' | 'places' | 'suggest';
  q: string;
  num?: number;
  gl?: string;
  hl?: string;
}

const SERPER_BASE_URL = 'https://google.serper.dev';

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const SERPER_API_KEY = process.env.SERPER_API_KEY; // IMPORTANT: server-only env
  if (!SERPER_API_KEY) {
    console.error('SERPER_API_KEY not set on the server.');
    return new Response(
      JSON.stringify({ error: 'Search service is not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = (await request.json()) as ProxyRequestBody;
    const { type, q, num = 10, gl, hl } = body || ({} as ProxyRequestBody);

    if (!type || !q || typeof q !== 'string' || q.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing 'type' or 'q' in request body." }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let endpoint = '/search';
    switch (type) {
      case 'images': endpoint = '/images'; break;
      case 'videos': endpoint = '/videos'; break;
      case 'news': endpoint = '/news'; break;
      case 'places': endpoint = '/places'; break;
      case 'suggest': endpoint = '/suggest'; break;
      case 'search': default: endpoint = '/search'; break;
    }

    const upstream = await fetch(`${SERPER_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: q.trim(),
        num: Math.min(Math.max(num, 1), 100),
        ...(gl ? { gl } : {}),
        ...(hl ? { hl } : {}),
      }),
    });

    const text = await upstream.text();
    // Pass through status and JSON
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in serper-proxy:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
