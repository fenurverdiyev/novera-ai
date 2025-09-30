import React, { useState } from 'react';
// Fix: Aliased the imported NewsArticle type to avoid a name collision with the NewsArticle component.
import type { NewsArticle as NewsArticleType } from '../types';
import { ArrowLeftIcon, AlertTriangleIcon } from './Icons';
import { ProtectedImage } from './ProtectedImage';
import { NewsArticleActions } from './NewsArticleActions';
import { SimilarNews } from './SimilarNews';
import { translateText } from '../services/geminiService';

interface NewsArticleProps {
  article: NewsArticleType;
  allArticles: NewsArticleType[];
  onBack: () => void;
  onArticleSelect: (article: NewsArticleType) => void;
}

export const NewsArticle: React.FC<NewsArticleProps> = ({ article, allArticles, onBack, onArticleSelect }) => {
  const [translatedContent, setTranslatedContent] = useState<{ title: string; body: string } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);


  const handleTranslate = async (langCode: string) => {
      if (!article) return;
      setIsTranslating(true);
      setTranslatedContent(null);
      setTranslationError(null);
      try {
          const textToTranslate = article.content || article.summary || '';
          
          const [translatedTitle, translatedBody] = await Promise.all([
              translateText(article.title, langCode),
              translateText(textToTranslate, langCode)
          ]);
          setTranslatedContent({ title: translatedTitle, body: translatedBody });
      } catch (error) {
          console.error("Translation failed", error);
          setTranslationError("Tərcümə uğursuz oldu. Zəhmət olmasa, yenidən cəhd edin.");
      } finally {
          setIsTranslating(false);
      }
  };

  const handleShowOriginal = () => {
      setTranslatedContent(null);
      setTranslationError(null);
  };

  const formattedDate = new Date(article.publishedAt).toLocaleDateString('az-AZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  
  const contentToShow = article.content || article.summary || '';

  const displayTitle = translatedContent ? translatedContent.title : article.title;
  const displayBody = translatedContent ? translatedContent.body : contentToShow;

  return (
    <div className="flex-grow overflow-y-auto bg-bg-jet text-text-main p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-2 mb-6 text-text-sub hover:text-text-main">
          <ArrowLeftIcon className="w-5 h-5" />
          Bütün xəbərlərə qayıt
        </button>

        <article>
          <h1 className="text-3xl md:text-5xl font-bold my-3 leading-tight">{displayTitle}</h1>
          <div className="text-text-sub text-sm mb-6">
            <span>{article.source} tərəfindən</span> &middot; <span>{formattedDate}</span>
          </div>

          <ProtectedImage
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-auto max-h-[500px] object-cover rounded-xl my-8"
            proxyParams="w=1280&h=720&fit=cover&output=webp&q=85"
          />

          <div className="prose prose-invert max-w-none text-text-main leading-relaxed">
             { displayBody && <div dangerouslySetInnerHTML={{ __html: displayBody.replace(/\n/g, '<br />') }} />}
          </div>

           {contentToShow.length > 1500 && (
              <div className="mt-4 text-center">
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-accent font-semibold hover:underline">
                      Tam məqaləni mənbədə oxuyun
                  </a>
              </div>
          )}

          <NewsArticleActions 
            article={article} 
            onTranslate={handleTranslate}
            isTranslating={isTranslating}
            isTranslated={!!translatedContent}
            onShowOriginal={handleShowOriginal}
          />

          <SimilarNews currentArticle={article} allArticles={allArticles} onArticleSelect={onArticleSelect} />

        </article>
      </div>
    </div>
  );
};