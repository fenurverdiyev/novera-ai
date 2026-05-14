export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: 'ok',
    platform: 'Cloudflare Pages Functions',
    version: '2.5',
    time: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
