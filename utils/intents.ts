import type { PlaceResult, ShoppingProduct, Message } from '../types';

export const hasVisualIntent = (q: string): boolean => {
  const s = q.toLowerCase();
  return [
    'şəkil', 'sekil', 'foto', 'fotolar', 'görüntü', 'image', 'images', 'pictures', 'pics',
    'video', 'videolar', 'youtube', 'clip', 'media'
  ].some(k => s.includes(k));
};

export const hasPlaceIntent = (q: string): boolean => {
  const s = q.toLowerCase();
  return [
    'xəritə', 'xerite', 'map', 'məkan', 'mekan', 'yer', 'ünvan', 'unvan',
    'restoran', 'restoranlar', 'kafe', 'otel', 'otellər', 'hotel', 'market', 'aptek', 'clinic', 'müəssisə', 'magaza', 'mağaza',
    'near me', 'yaxın', 'closest', 'ətrafda', 'etrafda', 'ailəvi', 'usaqli', 'uşaqlı', 'family'
  ].some(k => s.includes(k));
};

export const hasNewsIntent = (q: string): boolean => {
  const s = q.toLowerCase();
  return ['xəbər', 'news', 'son xəbərlər', 'updates', 'headlines'].some(k => s.includes(k));
};

export const hasShoppingIntent = (q: string): boolean => {
  const s = q.toLowerCase();
  const shoppingWords = ['almaq', 'satın', 'buy', 'qiymət', 'price', 'mağaza', 'store', 'shop', 'məhsul', 'product', 'sifariş', 'endirim'];
  if (shoppingWords.some(k => s.includes(k))) return true;
  if (/(^|\s)(tap|harada|haradan)(\s|$)/.test(s)) return true;
  const tokens = s.split(/\s+/).filter(Boolean);
  const looksLikeProduct = /\b(iphone|ipad|macbook|samsung|xiaomi|nike|adidas|ps5|playstation|xbox|gpu|rtx|tv|laptop|kamera|qulaqciq|headphone|saat|watch)\b/.test(s);
  return looksLikeProduct && tokens.length <= 5;
};

export const buildPlaceRecommendations = (places: PlaceResult[] | undefined | null): string => {
  if (!places || places.length === 0) return '';
  const top = [...places]
    .filter(p => (p.rating || 0) > 0)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);
  if (top.length === 0) return '';
  const bullets = top
    .map(p => `• ${p.title}${p.rating ? ` — ⭐ ${p.rating.toFixed(1)}` : ''}${p.address ? ` • ${p.address}` : ''}`)
    .join('\n');
  return `\n\nTövsiyələr (məkanlar):\n${bullets}`;
};

export const buildProductRecommendations = (products: ShoppingProduct[] | undefined | null): string => {
  if (!products || products.length === 0) return '';
  const normalizePrice = (p?: string): number => {
    if (!p) return Number.POSITIVE_INFINITY;
    const m = p.replace(/[^0-9.,]/g, '').replace(',', '.');
    const n = parseFloat(m);
    return isNaN(n) ? Number.POSITIVE_INFINITY : n;
  };
  const top = [...products]
    .slice(0, 10)
    .sort((a, b) => (normalizePrice(a.price) - normalizePrice(b.price)))
    .slice(0, 3);
  const bullets = top
    .map(p => `• ${p.title}${p.price ? ` — ${p.price}` : ''}${p.source ? ` • ${p.source}` : ''}${p.rating ? ` • ⭐ ${p.rating.toFixed(1)}` : ''}`)
    .join('\n');
  return `\n\nTövsiyələr (məhsullar):\n${bullets}`;
};

export const wantsProductRecommendations = (q: string): boolean => {
  return /(tövsiy|rekomend|recommend|nə al|ne al|hansı\s+məhsul|which\s+.*buy|what\s+.*buy)/i.test(q);
};
