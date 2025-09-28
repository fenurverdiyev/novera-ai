// Vercel-style Edge Function: Secure proxy to Google Programmable Search (Custom Search JSON API)
export const config = { runtime: 'edge' };

interface ProxyRequestBody {
  q: string;
  start?: number; // 1-based index
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Prefer server-only env names; fall back to VITE_* if present in the environment
  const API_KEY = process.env.GOOGLE_CSE_JSON_KEY || process.env.GOOGLE_API_KEY || process.env.VITE_GOOGLE_CSE_JSON_KEY;
  const CX = process.env.GOOGLE_CSE_CX || process.env.VITE_GOOGLE_CSE_CX || process.env.VITE_GOOGLE_CSE_ID;

  if (!API_KEY || !CX) {
    console.error('Google Custom Search API not configured on server. Missing GOOGLE_CSE_JSON_KEY or GOOGLE_CSE_CX');
    return new Response(
      JSON.stringify({ error: 'Search service is not configured.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = (await request.json()) as ProxyRequestBody;
    const q = (body?.q || '').trim();
    const start = Math.max(1, Number(body?.start || 1));
    if (!q) {
      return new Response(
        JSON.stringify({ error: "Missing 'q' in request body." }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', API_KEY);
    url.searchParams.set('cx', CX);
    url.searchParams.set('q', q);
    url.searchParams.set('start', String(start));

    const upstream = await fetch(url.toString(), { method: 'GET' });
    const text = await upstream.text();

    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in google-customsearch-proxy:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
