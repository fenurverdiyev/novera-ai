import type { Message } from '../types';

export const containsProperNoun = (text: string): boolean => {
  const re = /\b([A-ZƏÖĞÇŞİÜ][a-zəöğçşıü]+(?:\s+[A-ZƏÖĞÇŞİÜ][a-zəöğçşıü]+)*)\b/g;
  return re.test(text);
};

export const extractSubjectFromHistory = (history: Message[]): string | null => {
  const skip = new Set(['NovEra', 'AI', 'Google', 'Gemini']);
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i].text || '';
    const re = /\b([A-ZƏÖĞÇŞİÜ][a-zəöğçşıü]+(?:\s+[A-ZƏÖĞÇŞİÜ][a-zəöğçşıü]+)*)\b/g;
    const matches = t.match(re);
    if (matches && matches.length) {
      const candidate = matches.find(m => !skip.has(m));
      if (candidate) return candidate;
    }
  }
  return null;
};

export const refineVisualQuery = (query: string, history: Message[]): string => {
  if (containsProperNoun(query)) return query;

  const isVideo = /(\bvideo(larını)?|\bvideolar|youtube)/i.test(query);
  const isImage = /(şəkil(lərini)?|sekil(lerini)?|foto(larını)?|fotolar|görüntü|image|images|pictures|pics|wallpaper|background)/i.test(query);
  const generic = isVideo || isImage || /(göstər|goster|çıxart|cixart|onu|onun)/i.test(query);
  if (!generic) return query;

  let subject = extractSubjectFromHistory(history);
  if (!subject) {
    const stripped = query
      .replace(/\b(şəkil(lərini)?|sekil(lerini)?|foto(larını)?|fotolar|görüntü|image|images|pictures|pics|video(larını)?|videolar|göstər|goster|çıxart|cixart|onu|onun|wallpaper|background)\b/gi, '')
      .trim();
    if (stripped.length > 0) subject = stripped;
  }
  if (!subject) return query;

  if (isVideo) return `${subject} videoları`;
  if (isImage) return `${subject} şəkilləri hd`;
  return subject;
};
