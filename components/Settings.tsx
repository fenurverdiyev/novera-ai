import React from 'react';
import type { AppSettings } from '../types';
import { THEMES } from '../animations/themes';
import { getTranslation, Language } from '../utils/translations';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  themeColor?: string;
}

const languages: { id: Language; label: string; flag: string }[] = [
  { id: 'az', label: 'Azərbaycan', flag: '🇦🇿' },
  { id: 'tr', label: 'Türkçe', flag: '🇹🇷' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'ru', label: 'Русский', flag: '🇷🇺' },
];

export const Settings: React.FC<SettingsProps> = ({ settings, onSettingsChange, themeColor = '#38bdf8' }) => {
  const lang = settings.language || 'az';
  const t = (key: any) => getTranslation(lang, key);

  const handleThemeChange = (themeId: string) => {
    onSettingsChange({ ...settings, theme: themeId });
  };

  const handleLanguageChange = (newLang: Language) => {
    onSettingsChange({ ...settings, language: newLang });
  };

  const colorInputRef = React.useRef<HTMLInputElement>(null);
  
  return (
    <div className="flex-grow overflow-y-auto p-4 md:p-8 bg-transparent animate-fade-in no-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8 pb-32">
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-white tracking-tight">{t('settings')}</h1>
          <p className="text-slate-400 mt-2">NovEra təcrübənizi fərdiləşdirin.</p>
        </header>

        {/* Language Section */}
        <section className="glass-card p-6 rounded-3xl space-y-4">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/5">🌐</span>
            {t('language')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {languages.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLanguageChange(l.id)}
                className={`flex items-center justify-between px-4 py-3 rounded-2xl transition-all border ${
                  lang === l.id 
                    ? 'bg-white/10 border-white/20 text-white shadow-lg shadow-black/20' 
                    : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <span className="text-sm font-medium">{l.label}</span>
                <span className="text-lg">{l.flag}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Theme Section */}
        <section className="glass-card p-6 rounded-3xl space-y-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/5">🎨</span>
            {t('theme')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                onClick={() => handleThemeChange(theme.id)}
                className={`relative p-5 rounded-3xl border-2 transition-all group overflow-hidden ${
                  settings.theme === theme.id 
                    ? 'bg-white/10 border-white/30 text-white' 
                    : 'bg-white/5 border-transparent text-slate-400 hover:bg-white/10 hover:border-white/10'
                }`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex -space-x-2">
                    {theme.colors.map((c) => (
                      <div key={c} className="w-8 h-8 rounded-full border-2 border-slate-900 shadow-sm" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                  {settings.theme === theme.id && <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
                </div>
                <div className="text-left">
                  <h3 className="font-bold text-white">{theme.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{theme.description}</p>
                </div>

                {theme.id === 'novera' && settings.theme === 'novera' && (
                  <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-400">Xüsusi rəng</span>
                    <input
                      type="color"
                      value={settings.noveraColor || '#38bdf8'}
                      onChange={(e) => onSettingsChange({ ...settings, noveraColor: e.target.value })}
                      className="w-8 h-8 rounded-lg overflow-hidden border-0 p-0 cursor-pointer bg-transparent"
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Voice Section */}
        <section className="glass-card p-6 rounded-3xl space-y-4">
           <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <span className="p-2 rounded-xl bg-white/5">🔊</span>
            {t('voice')}
          </h2>
          <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
            <div>
              <p className="text-white font-medium">{t('voiceEnabled')}</p>
              <p className="text-xs text-slate-500">Cavabları səsli eşitmək üçün.</p>
            </div>
            <button
              onClick={() => onSettingsChange({ ...settings, voiceEnabled: !settings.voiceEnabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${settings.voiceEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.voiceEnabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
