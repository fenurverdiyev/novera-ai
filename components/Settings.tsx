import React from 'react';
import type { AppSettings } from '../types';
import { AVAILABLE_VOICES } from '../services/elevenLabsService';
import { THEMES } from '../animations/themes';

interface SettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  themeColor?: string;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onSettingsChange, themeColor = '#2196f3' }) => {

  const handleVoiceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, voiceEnabled: e.target.checked });
  };

  const handleVoiceIdChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSettingsChange({ ...settings, voiceId: e.target.value });
  };
  
  const handleThemeChange = (themeId: string) => {
      onSettingsChange({ ...settings, theme: themeId });
  };

  // NovEra color picker (modern UI)
  const colorInputRef = React.useRef<HTMLInputElement>(null);
  const openNovEraColorPicker = (e: React.MouseEvent<HTMLButtonElement | HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    colorInputRef.current?.click();
  };
  const handleNovEraColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, theme: 'novera', noveraColor: e.target.value });
  };

  return (
    <div className="flex-grow overflow-y-auto p-8 bg-bg-jet/90 backdrop-blur-sm">
      <h1 className="text-4xl font-bold text-text-main mb-8">Ayarlar</h1>
      <div className="max-w-2xl mx-auto bg-bg-slate/80 p-6 rounded-lg space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-text-main">Səsli Cavabları Aktivləşdirin</h2>
            <p className="text-sm text-text-sub">AI cavabları üçün avtomatik səs yaradın.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={handleVoiceChange}
              className="sr-only peer"
            />
            <div 
              className="w-11 h-6 bg-bg-onyx rounded-full peer peer-focus:ring-2 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"
              style={{
                '--tw-ring-color': themeColor,
                backgroundColor: settings.voiceEnabled ? themeColor : undefined,
              } as React.CSSProperties}
            ></div>
          </label>
        </div>
        <div className="flex justify-between items-center pt-6 border-t border-bg-onyx">
          <div>
            <h2 className="text-lg font-semibold text-text-main">Cavab Səsi</h2>
            <p className="text-sm text-text-sub">Səsli cavablar üçün səsi seçin.</p>
          </div>
          <select
            value={settings.voiceId}
            onChange={handleVoiceIdChange}
            className="w-48 bg-bg-onyx p-2 rounded-lg text-text-main focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
            aria-label="Cavab səsini seçin"
          >
            {AVAILABLE_VOICES.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
          </select>
        </div>
        <div className="pt-6 border-t border-bg-onyx">
            <h2 className="text-lg font-semibold text-text-main">Görünüş Teması</h2>
            <p className="text-sm text-text-sub mb-4">Tətbiqin rəng sxemini və interaktiv təcrübəsini seçin.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {THEMES.map(theme => (
                    <button 
                        key={theme.id} 
                        onClick={() => handleThemeChange(theme.id)} 
                        className={`p-4 rounded-lg border-2 transition-all text-left flex flex-col justify-between h-48 ${settings.theme !== theme.id && 'border-bg-onyx hover:border-text-sub'}`}
                        style={settings.theme === theme.id ? { borderColor: themeColor, boxShadow: `0 0 10px ${themeColor}` } : {}}
                    >
                        <div>
                          <div className="flex gap-2 mb-3">
                              {theme.colors.map(color => <div key={color} className="w-6 h-6 rounded-full" style={{ backgroundColor: color }} />)}
                          </div>
                          <span className="font-semibold text-text-main">{theme.name}</span>
                        </div>
                        <p className="text-xs text-text-sub mt-2">{theme.description}</p>
                        {theme.id === 'novera' && (
                          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={openNovEraColorPicker}
                              className="group w-full flex items-center justify-between rounded-lg bg-bg-onyx/70 hover:bg-bg-onyx/60 ring-1 ring-white/10 hover:ring-white/20 px-3 py-2 transition-colors"
                              style={{ boxShadow: settings.theme === 'novera' ? `0 0 10px ${themeColor}` : undefined }}
                              aria-label="NovEra fon rəngi seç"
                            >
                              <span className="text-xs text-text-sub">Fon rəngi</span>
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-6 h-6 rounded-full border border-white/20 shadow-inner"
                                  style={{ backgroundColor: settings.noveraColor || '#0d0f19' }}
                                  aria-hidden
                                />
                                <span className="text-xs text-text-main/80 font-mono">{(settings.noveraColor || '#0d0f19').toUpperCase()}</span>
                              </span>
                            </button>
                            <input
                              ref={colorInputRef}
                              id="novera-color"
                              type="color"
                              value={settings.noveraColor || '#0d0f19'}
                              onChange={handleNovEraColorChange}
                              className="hidden"
                              aria-label="NovEra fon rəngi"
                            />
                          </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};
