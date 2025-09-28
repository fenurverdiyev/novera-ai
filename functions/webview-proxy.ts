// Edge/serverless proxy to render external pages inside NovEra by stripping X-Frame restrictions.
// WARNING: This is a simple sanitizer; do not rely on it for untrusted code execution. We remove scripts
// and rewrite links to go back through this proxy so navigation stays inside the app.

export const config = { runtime: 'edge' };

function absolutizeUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function sanitizeHtml(html: string, baseUrl: string): string {
  // Remove script tags
  let out = html.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  // Remove potentially dangerous event handlers
  out = out.replace(/on\w+\s*=\s*"[^"]*"/gi, '')
           .replace(/on\w+\s*=\s*'[^']*'/gi, '')
           .replace(/on\w+\s*=\s*[^\s>]+/gi, '');
  // Insert <base> into <head> so relative URLs resolve
  if (/<head[\s>]/i.test(out)) {
    out = out.replace(/<head(.*?)>/i, (m, g1) => `<head$1><base href="${baseUrl}">`);
  } else {
    out = `<head><base href="${baseUrl}"></head>` + out;
  }
  // Rewrite anchor hrefs to route via this proxy
  out = out.replace(/<a\s+([^>]*?)href=("|')([^"']+)(\2)([^>]*)>/gi, (_m, pre, q, href, _q2, post) => {
    const abs = absolutizeUrl(href, baseUrl);
    const proxied = `/api/webview?url=${encodeURIComponent(abs)}`;
    return `<a ${pre}href="${proxied}"${post}>`;
  });
  return out;
}

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get('url');
    if (!target) {
      return new Response('Missing url parameter', { status: 400, headers: { 'Content-Type': 'text/plain' } });
    }
    const upstream = await fetch(target, {
      headers: {
        'User-Agent': 'NovEra/1.0 (+https://example.com) Chrome-Compatible',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow' as RequestRedirect,
    });
    const baseUrl = upstream.url || target;
    const html = await upstream.text();
    const safe = sanitizeHtml(html, baseUrl);
    // Wrap into minimal container so it fits well
    const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${''}</head><body>${safe}</body></html>`;
    return new Response(wrapped, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Intentionally omit X-Frame-Options and frame-ancestors to allow embedding
      },
    });
  } catch (e: any) {
    return new Response(`<html><body style="font-family: sans-serif; color: #eee; background:#111; padding:16px">` +
      `<h3>Saytı yükləmək mümkün olmadı</h3><pre style="white-space:pre-wrap">${(e?.message || 'Unknown error')}</pre></body></html>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
