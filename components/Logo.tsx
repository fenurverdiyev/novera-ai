import React from 'react';
import { getTranslation } from '../utils/translations';

export const Logo: React.FC<{ className?: string, isLarge?: boolean, language?: string }> = ({ className, isLarge = false, language = 'az' }) => {
  const textSize = isLarge ? 'text-7xl md:text-9xl' : 'text-2xl';
  const t = (key: any) => getTranslation(language as any, key);

  return (
    <div className={`font-bold tracking-tighter select-none ${className}`}>
      <h1 className={`${textSize} relative leading-none`}>
        <span 
          className="bg-gradient-to-br from-white via-white to-white/40 text-transparent bg-clip-text"
        >
          NovEra
        </span>
        <span 
          className="absolute text-cyan-400 text-[0.4em]"
          style={{
            top: '-0.1em',
            right: '-0.3em',
            filter: 'drop-shadow(0 0 12px rgba(34, 211, 238, 0.8))'
          }}
        >
          ✦
        </span>
      </h1>
      {isLarge && (
        <p className="text-center text-slate-400 mt-6 text-xl md:text-2xl font-medium tracking-tight opacity-80">
          {language === 'az' ? 'Yeni dövr başlayır.' : 
           language === 'tr' ? 'Yeni dönem başlıyor.' : 
           language === 'ru' ? 'Начинается новая эра.' : 
           'A new era begins.'}
        </p>
      )}
    </div>
  );
};
