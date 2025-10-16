import React, { useState } from 'react';

export default function LiveBrowser() {
  const [url, setUrl] = useState<string>('https://www.wikipedia.org');
  const [liveUrl, setLiveUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  async function openUrl() {
    const u = (url || '').trim();
    if (!u) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: u })
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.message || data?.error || 'Request failed');
      }
      if (typeof data?.liveURL !== 'string' || !data.liveURL) {
        throw new Error('No liveURL in response');
      }
      setLiveUrl(data.liveURL);
    } catch (e: any) {
      setError(e?.message || 'Open failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, background: '#f3f3f3', alignItems: 'center' }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') openUrl(); }}
          placeholder="https://..."
          style={{ flex: 1, padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
        />
        <button onClick={openUrl} disabled={loading} style={{ padding: '8px 12px' }}>
          {loading ? 'Yüklənir...' : 'Aç'}
        </button>
        {error ? <span style={{ color: 'crimson', marginLeft: 8 }}>{error}</span> : null}
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {liveUrl ? (
          <iframe
            src={liveUrl}
            title="Live Browser"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
            allow="clipboard-read; clipboard-write; autoplay; fullscreen; picture-in-picture"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#666', fontSize: 14
          }}>
            URL daxil edin və "Aç" düyməsinə basın
          </div>
        )}
      </div>
    </div>
  );
}
