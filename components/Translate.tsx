import React, { useEffect, useRef, useState } from 'react';
import { translateText } from '../services/geminiService';
import { LoadingSpinner, TranslateIcon, AlertTriangleIcon, CloseIcon } from './Icons';

const languages = [
    { code: 'af', name: 'Afrikan dili', emoji: '🇿🇦' },
    { code: 'sq', name: 'Alban dili', emoji: '🇦🇱' },
    { code: 'am', name: 'Amhar dili', emoji: '🇪🇹' },
    { code: 'ar', name: 'Ərəb dili', emoji: '🇸🇦' },
    { code: 'hy', name: 'Erməni dili', emoji: '🇦🇲' },
    { code: 'az', name: 'Azərbaycan dili', emoji: '🇦🇿' },
    { code: 'eu', name: 'Bask dili', emoji: '🇪🇸' },
    { code: 'be', name: 'Belarus dili', emoji: '🇧🇾' },
    { code: 'bn', name: 'Benqal dili', emoji: '🇧🇩' },
    { code: 'bs', name: 'Bosniya dili', emoji: '🇧🇦' },
    { code: 'bg', name: 'Bolqar dili', emoji: '🇧🇬' },
    { code: 'ca', name: 'Katalan dili', emoji: '🇪🇸' },
    { code: 'ceb', name: 'Sebuano dili', emoji: '🇵🇭' },
    { code: 'ny', name: 'Çiçeva dili', emoji: '🇲🇼' },
    { code: 'zh-CN', name: 'Çin dili (Sadə)', emoji: '🇨🇳' },
    { code: 'zh-TW', name: 'Çin dili (Ənənəvi)', emoji: '🇹🇼' },
    { code: 'co', name: 'Korsika dili', emoji: '🇫🇷' },
    { code: 'hr', name: 'Xorvat dili', emoji: '🇭🇷' },
    { code: 'cs', name: 'Çex dili', emoji: '🇨🇿' },
    { code: 'da', name: 'Danimarka dili', emoji: '🇩🇰' },
    { code: 'nl', name: 'Holland dili', emoji: '🇳🇱' },
    { code: 'en', name: 'İngilis dili', emoji: '🇬🇧' },
    { code: 'eo', name: 'Esperanto', emoji: '🏳️' },
    { code: 'et', name: 'Eston dili', emoji: '🇪🇪' },
    { code: 'tl', name: 'Filippin dili', emoji: '🇵🇭' },
    { code: 'fi', name: 'Fin dili', emoji: '🇫🇮' },
    { code: 'fr', name: 'Fransız dili', emoji: '🇫🇷' },
    { code: 'fy', name: 'Friz dili', emoji: '🇳🇱' },
    { code: 'gl', name: 'Qalisian dili', emoji: '🇪🇸' },
    { code: 'ka', name: 'Gürcü dili', emoji: '🇬🇪' },
    { code: 'de', name: 'Alman dili', emoji: '🇩🇪' },
    { code: 'el', name: 'Yunan dili', emoji: '🇬🇷' },
    { code: 'gu', name: 'Qucarat dili', emoji: '🇮🇳' },
    { code: 'ht', name: 'Haiti kreol dili', emoji: '🇭🇹' },
    { code: 'ha', name: 'Hausa dili', emoji: '🇳🇬' },
    { code: 'haw', name: 'Havay dili', emoji: '🇺🇸' },
    { code: 'iw', name: 'İvrit dili', emoji: '🇮🇱' },
    { code: 'hi', name: 'Hind dili', emoji: '🇮🇳' },
    { code: 'hmn', name: 'Hmonq dili', emoji: '🇨🇳' },
    { code: 'hu', name: 'Macar dili', emoji: '🇭🇺' },
    { code: 'is', name: 'İsland dili', emoji: '🇮🇸' },
    { code: 'ig', name: 'İqbo dili', emoji: '🇳🇬' },
    { code: 'id', name: 'İndoneziya dili', emoji: '🇮🇩' },
    { code: 'ga', name: 'İrland dili', emoji: '🇮🇪' },
    { code: 'it', name: 'İtalyan dili', emoji: '🇮🇹' },
    { code: 'ja', name: 'Yapon dili', emoji: '🇯🇵' },
    { code: 'jw', name: 'Yava dili', emoji: '🇮🇩' },
    { code: 'kn', name: 'Kannada dili', emoji: '🇮🇳' },
    { code: 'kk', name: 'Qazax dili', emoji: '🇰🇿' },
    { code: 'km', name: 'Kxmer dili', emoji: '🇰🇭' },
    { code: 'ko', name: 'Koreya dili', emoji: '🇰🇷' },
    { code: 'ku', name: 'Kürd dili', emoji: '🇹🇷' },
    { code: 'ky', name: 'Qırğız dili', emoji: '🇰🇬' },
    { code: 'lo', name: 'Lao dili', emoji: '🇱🇦' },
    { code: 'la', name: 'Latın dili', emoji: '🇻🇦' },
    { code: 'lv', name: 'Latış dili', emoji: '🇱🇻' },
    { code: 'lt', name: 'Litva dili', emoji: '🇱🇹' },
    { code: 'lb', name: 'Lüksemburq dili', emoji: '🇱🇺' },
    { code: 'mk', name: 'Makedon dili', emoji: '🇲🇰' },
    { code: 'mg', name: 'Malaqas dili', emoji: '🇲🇬' },
    { code: 'ms', name: 'Malay dili', emoji: '🇲🇾' },
    { code: 'ml', name: 'Malayalam dili', emoji: '🇮🇳' },
    { code: 'mt', name: 'Malta dili', emoji: '🇲🇹' },
    { code: 'mi', name: 'Maori dili', emoji: '🇳🇿' },
    { code: 'mr', name: 'Marati dili', emoji: '🇮🇳' },
    { code: 'mn', name: 'Monqol dili', emoji: '🇲🇳' },
    { code: 'my', name: 'Myanma dili', emoji: '🇲🇲' },
    { code: 'ne', name: 'Nepal dili', emoji: '🇳🇵' },
    { code: 'no', name: 'Norveç dili', emoji: '🇳🇴' },
    { code: 'ps', name: 'Puştu dili', emoji: '🇦🇫' },
    { code: 'fa', name: 'Fars dili', emoji: '🇮🇷' },
    { code: 'pl', name: 'Polyak dili', emoji: '🇵🇱' },
    { code: 'pt', name: 'Portuqal dili', emoji: '🇵🇹' },
    { code: 'pa', name: 'Pəncab dili', emoji: '🇮🇳' },
    { code: 'ro', name: 'Rumın dili', emoji: '🇷🇴' },
    { code: 'ru', name: 'Rus dili', emoji: '🇷🇺' },
    { code: 'sm', name: 'Samoa dili', emoji: '🇼🇸' },
    { code: 'gd', name: 'Şotland kelt dili', emoji: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
    { code: 'sr', name: 'Serb dili', emoji: '🇷🇸' },
    { code: 'st', name: 'Sesoto dili', emoji: '🇱🇸' },
    { code: 'sn', name: 'Şona dili', emoji: '🇿🇼' },
    { code: 'sd', name: 'Sindhi dili', emoji: '🇵🇰' },
    { code: 'si', name: 'Sinxal dili', emoji: '🇱🇰' },
    { code: 'sk', name: 'Slovak dili', emoji: '🇸🇰' },
    { code: 'sl', name: 'Sloven dili', emoji: '🇸🇮' },
    { code: 'so', name: 'Somali dili', emoji: '🇸🇴' },
    { code: 'es', name: 'İspan dili', emoji: '🇪🇸' },
    { code: 'su', name: 'Sundan dili', emoji: '🇮🇩' },
    { code: 'sw', name: 'Suahili dili', emoji: '🇹🇿' },
    { code: 'sv', name: 'İsveç dili', emoji: '🇸🇪' },
    { code: 'tg', name: 'Tacik dili', emoji: '🇹🇯' },
    { code: 'ta', name: 'Tamil dili', emoji: '🇮🇳' },
    { code: 'te', name: 'Teluqu dili', emoji: '🇮🇳' },
    { code: 'th', name: 'Tay dili', emoji: '🇹🇭' },
    { code: 'tr', name: 'Türk dili', emoji: '🇹🇷' },
    { code: 'uk', name: 'Ukrayna dili', emoji: '🇺🇦' },
    { code: 'ur', name: 'Urdu dili', emoji: '🇵🇰' },
    { code: 'uz', name: 'Özbək dili', emoji: '🇺🇿' },
    { code: 'vi', name: 'Vyetnam dili', emoji: '🇻🇳' },
    { code: 'cy', name: 'Uels dili', emoji: '🏴󠁧󠁢󠁷󠁬󠁳󠁿' },
    { code: 'xh', name: 'Xosa dili', emoji: '🇿🇦' },
    { code: 'yi', name: 'İdiş dili', emoji: '🇮🇱' },
    { code: 'yo', name: 'Yoruba dili', emoji: '🇳🇬' },
    { code: 'zu', name: 'Zulu dili', emoji: '🇿🇦' }
];

const Flag: React.FC<{ code: string }> = ({ code }) => (
    <img 
        src={`https://flagcdn.com/w20/${code.toLowerCase().split('-')[0]}.png`}
        alt={`${code} flag`}
        className="w-5 h-auto inline-block mr-2"
    />
);

export const Translate: React.FC = () => {
    const [inputText, setInputText] = useState('');
    const [translatedText, setTranslatedText] = useState('');
    const [targetLang, setTargetLang] = useState('az');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [langOpen, setLangOpen] = useState(false);
    const langRef = useRef<HTMLDivElement | null>(null);
    const selectedLang = languages.find(l => l.code === targetLang) || languages[0];
    const [theme, setTheme] = useState<string>('novera');

    useEffect(() => {
        const onDocClick = (e: any) => {
            if (!langRef.current) return;
            if (!langRef.current.contains(e.target)) setLangOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setLangOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        // Observe theme changes from body class (theme-*)
        try {
            const updateTheme = () => {
                const cls = document.body?.className || '';
                const m = cls.match(/theme-([a-z]+)/i);
                if (m && m[1]) setTheme(m[1].toLowerCase());
            };
            updateTheme();
            const mo = new MutationObserver(updateTheme);
            mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
            return () => {
                document.removeEventListener('mousedown', onDocClick);
                document.removeEventListener('keydown', onKey);
                mo.disconnect();
            };
        } catch {
            return () => {
                document.removeEventListener('mousedown', onDocClick);
                document.removeEventListener('keydown', onKey);
            };
        }
    }, []);

    const handleTranslate = async () => {
        if (!inputText.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const result = await translateText(inputText, targetLang);
            setTranslatedText(result);
        } catch (e: any) {
            setError(e.message || "Tərcümə uğursuz oldu.");
            setTranslatedText('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex-grow overflow-y-auto p-4 md:p-8 pb-32 md:pb-20 bg-bg-jet/90 backdrop-blur-sm relative isolate no-scrollbar">
            <h1 className="text-2xl md:text-4xl font-bold text-white mb-6 md:mb-8 text-center md:text-left">Tərcümə</h1>
            <div className="max-w-5xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 items-end mb-6">
                     <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest ml-1">Mənbə Dili</label>
                        <div className="w-full p-3.5 rounded-2xl text-white/90 bg-white/5 border border-white/10 backdrop-blur-xl font-medium text-sm">
                            Avtomatik Aşkarlama
                        </div>
                    </div>
                     <div className="flex flex-col gap-2">
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-widest ml-1">Hədəf Dil</label>
                        <div ref={langRef} className="relative">
                          <button
                            type="button"
                            aria-expanded={langOpen}
                            onClick={() => setLangOpen(v => !v)}
                            className="w-full p-3.5 rounded-2xl text-white bg-white/5 border border-white/10 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-accent flex items-center justify-between transition-all active:scale-[0.98]"
                          >
                            <span className="flex items-center gap-3">
                              <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-white/10 bg-white/10 text-white/60">{selectedLang.code}</span>
                              <span className="text-lg">{selectedLang.emoji}</span>
                              <span className="font-bold">{selectedLang.name}</span>
                            </span>
                            <svg className={`w-5 h-5 transition-transform duration-300 ${langOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          
                          {langOpen && (
                            <div className="absolute top-full left-0 right-0 mt-3 z-50 bg-[#16161a]/95 border border-white/10 rounded-[24px] shadow-2xl backdrop-blur-3xl p-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                              <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                                {languages.map(lang => (
                                  <button
                                    key={lang.code}
                                    type="button"
                                    onClick={() => { setTargetLang(lang.code); setLangOpen(false); }}
                                    className={`w-full text-left px-4 py-3 rounded-xl hover:bg-white/10 text-white/90 flex items-center gap-3 transition-colors ${targetLang === lang.code ? 'bg-accent/20 text-accent ring-1 ring-accent/30' : ''}`}
                                  >
                                    <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-lg border border-white/10 bg-white/10 text-white/60">{lang.code}</span>
                                    <span className="text-lg">{lang.emoji}</span>
                                    <span className="font-bold">{lang.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                    <div className="relative group">
                      <textarea
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          placeholder="Mətni daxil edin..."
                          className="w-full h-40 md:h-64 p-5 rounded-[24px] text-white placeholder-white/30 bg-white/5 border border-white/10 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-accent resize-none transition-all leading-relaxed text-base shadow-inner"
                      />
                      <div className="absolute bottom-4 right-4 flex items-center gap-2">
                        {inputText.length > 0 && (
                          <button onClick={() => setInputText('')} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 text-white/60 hover:bg-white/20 transition-colors">
                            <CloseIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative group">
                      <div className="w-full h-40 md:h-64 p-5 rounded-[24px] text-white relative bg-white/5 border border-white/10 backdrop-blur-xl ring-1 ring-accent/20 shadow-inner overflow-y-auto custom-scrollbar">
                          {loading ? (
                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                  <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                                  <span className="text-xs font-bold text-accent animate-pulse">TƏRCÜMƏ EDİLİR...</span>
                              </div>
                          ) : error ? (
                               <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-red-400 p-6">
                                  <AlertTriangleIcon className="w-10 h-10 mb-3 opacity-50" />
                                  <span className="font-bold text-sm">{error}</span>
                              </div>
                          ) : (
                              <p className="whitespace-pre-wrap text-base leading-relaxed">{translatedText || 'Tərcümə burada görünəcək...'}</p>
                          )}
                      </div>
                    </div>
                </div>

                <div className="mt-8 flex justify-center">
                    <button
                        type="button"
                        onClick={handleTranslate}
                        disabled={loading || !inputText.trim()}
                        className="group relative inline-flex items-center justify-center gap-3 px-10 py-4 rounded-full text-sm font-bold text-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-accent transition-transform group-hover:scale-105" />
                        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent" />
                        <TranslateIcon className="relative w-5 h-5"/> 
                        <span className="relative">TƏRCÜMƏ ET</span>
                    </button>
                </div>
            </div>
            
            <style>{`
              .custom-scrollbar::-webkit-scrollbar { width: 5px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
              .no-scrollbar::-webkit-scrollbar { display: none; }
            `}</style>
        </div>
    );
};