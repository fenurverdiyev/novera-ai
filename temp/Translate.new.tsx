import React, { useMemo, useState } from 'react';
import { translateText } from '../services/geminiService';
import { LoadingSpinner, TranslateIcon, AlertTriangleIcon } from './Icons';

const LANGS = [
  { code: 'az', name: 'Azərbaycan dili' },
  { code: 'tr', name: 'Türk dili' },
  { code: 'ru', name: 'Rus dili' },
  { code: 'en', name: 'İngilis dili' },
];

export const Translate: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [targetLang, setTargetLang] = useState('az');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // .env.local-dan tərcümə üçün açarın olub-olmadığını yoxla
  const hasTranslateKey = useMemo(() => {
    try {
      const env: any = (import.meta as any).env || {};
      return Boolean(env.VITE_GEMINI_TRANSLATE_API_KEY || env.VITE_GEMINI_API_KEY);
    } catch {
      return false;
    }
  }, []);

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    if (!hasTranslateKey) {
      setError('Tərcümə üçün Gemini API açarı tapılmadı. .env.local faylında VITE_GEMINI_TRANSLATE_API_KEY və ya VITE_GEMINI_API_KEY əlavə edin və serveri yenidən başladın.');
      setTranslatedText('');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const looksLikeHtml = /<[^>]+>/.test(inputText);
      const result = await translateText(inputText, targetLang, { preserveHtml: looksLikeHtml });
      setTranslatedText(result);
    } catch (e: any) {
      setError(e.message || 'Tərcümə uğursuz oldu.');
      setTranslatedText('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-grow overflow-y-auto p-8 bg-bg-jet/90 backdrop-blur-sm">
      <h1 className="text-4xl font-bold text-text-main mb-8">Tərcümə</h1>
      <div className="max-w-4xl mx-auto">
        {!hasTranslateKey && (
          <div className="mb-4 p-3 rounded-lg bg-amber-900/40 border border-amber-700 text-amber-200 text-sm">
            <strong className="block">Açar tələb olunur</strong>
            Tərcümə üçün .env.local faylında VITE_GEMINI_TRANSLATE_API_KEY və ya VITE_GEMINI_API_KEY dəyərlərini qeyd edin və dev serveri yenidən başladın.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-text-sub mb-2">Mənbə Dili</label>
            <div className="w-full bg-bg-slate p-3 rounded-lg text-text-main">
              Avtomatik Aşkarlama
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-sub mb-2">Hədəf Dil</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-full bg-bg-slate p-3 rounded-lg text-text-main focus:outline-none focus:ring-2 focus:ring-accent"
            >
              {LANGS.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Tərcümə etmək üçün mətni daxil edin..."
            className="w-full h-48 bg-bg-slate p-4 rounded-lg text-text-main placeholder-text-sub focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
          <div className="w-full h-48 bg-bg-slate p-4 rounded-lg text-text-main relative">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <LoadingSpinner className="w-8 h-8 text-accent"/>
              </div>
            ) : error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-red-400 p-4">
                <AlertTriangleIcon className="w-8 h-8 mb-2" />
                <span>{error}</span>
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{translatedText || 'Tərcümə burada görünəcək...'}</p>
            )}
          </div>
        </div>
        <div className="mt-6 text-center">
          <button
            onClick={handleTranslate}
            disabled={loading || !inputText.trim()}
            className="bg-accent text-bg-jet font-bold py-3 px-8 rounded-lg hover:bg-opacity-80 transition-colors disabled:bg-bg-onyx disabled:text-text-sub"
          >
            <span className="flex items-center">
              <TranslateIcon className="w-5 h-5 mr-2"/> Tərcümə et
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
