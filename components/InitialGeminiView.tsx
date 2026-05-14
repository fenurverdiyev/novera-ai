import React from 'react';
import { Logo } from './Logo';
import { ImageIcon, SparklesIcon, CodeIcon, PlayIcon, SearchIcon } from './Icons';

interface InitialGeminiViewProps {
  onSuggestion: (query: string) => void;
  userName?: string;
  children?: React.ReactNode;
  language?: string;
}

export const InitialGeminiView: React.FC<InitialGeminiViewProps> = ({ onSuggestion, userName = 'Dostum', children, language = 'az' }) => {
  const isAz = language === 'az';
  const isRu = language === 'ru';
  const isTr = language === 'tr';
  const suggestions = [
    { 
      text: isAz ? 'Şəkil yarat' : isRu ? 'Создать изображение' : isTr ? 'Resim oluştur' : 'Create image', 
      icon: <ImageIcon className="w-4 h-4 text-orange-400" />, 
      query: isAz ? 'Mənə gözəl bir mənzərə şəkli yarat.' : isRu ? 'Создай для меня красивый пейзаж.' : isTr ? 'Bana güzel bir manzara resmi oluştur.' : 'Create a beautiful landscape image for me.' 
    },
    { 
      text: isAz ? 'Günümü planla' : isRu ? 'Спланировать день' : isTr ? 'Günümü planla' : 'Plan my day', 
      icon: <SparklesIcon className="w-4 h-4 text-yellow-400" />, 
      query: isAz ? 'Bu gün üçün məhsuldar bir plan hazırlamağa kömək et.' : isRu ? 'Помоги составить продуктивный план на сегодня.' : isTr ? 'Bugün için verimli bir plan hazırlamama yardım et.' : 'Help me prepare a productive plan for today.' 
    },
    { 
      text: isAz ? 'Öyrənməyə kömək et' : isRu ? 'Помочь в учебе' : isTr ? 'Öğrenmeme yardım et' : 'Help me learn', 
      icon: <SearchIcon className="w-4 h-4 text-blue-400" />, 
      query: isAz ? 'Kvant fizikasını sadə dildə izah et.' : isRu ? 'Объясни квантовую физику простыми словами.' : isTr ? 'Kuantum fiziğini sade bir dille açıkla.' : 'Explain quantum physics in simple terms.' 
    },
    { 
      text: isAz ? 'Yazı yaz' : isRu ? 'Написать статью' : isTr ? 'Yazı yaz' : 'Write something', 
      icon: <CodeIcon className="w-4 h-4 text-green-400" />, 
      query: isAz ? 'Texnologiyanın gələcəyi haqqında bir məqalə yaz.' : isRu ? 'Напиши статью о будущем технологий.' : isTr ? 'Teknolojinin geleceği hakkında bir makale yaz.' : 'Write an article about the future of technology.' 
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] w-full max-w-4xl mx-auto px-4 animate-[fadeIn_0.6s_ease-out]">
      <div className="mb-8 text-left w-full max-w-3xl pl-4">
          <h2 className="text-2xl text-white/50 font-medium mb-1">
            {isAz ? 'Salam' : isRu ? 'Привет' : isTr ? 'Merhaba' : 'Hello'} {userName}
          </h2>
          <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            {isAz ? 'Sizə necə kömək edə bilərəm?' : isRu ? 'Чем я могу вам помочь?' : isTr ? 'Size nasıl yardımcı olabilirim?' : 'How can I help you?'}
          </h1>
      </div>

      <div className="w-full max-w-3xl mb-8 group">
          {children}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s.query)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all text-sm text-white/90 whitespace-nowrap shadow-sm hover:shadow-md"
          >
            {s.icon}
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
