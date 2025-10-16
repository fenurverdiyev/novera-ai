import React from 'react';
import type { Source } from '../types';

interface SourcePillProps {
  source: Source;
}

export const SourcePill: React.FC<SourcePillProps> = ({ source }) => {
  const open = () => {
    try {
      if (source.uri && /^https?:\/\//i.test(source.uri)) {
        window.dispatchEvent(new CustomEvent('nov-era-open-url' as any, { detail: source.uri } as any));
        return;
      }
      if (source.uri) window.open(source.uri, '_blank', 'noopener,noreferrer');
    } catch {
      if (source.uri) try { window.open(source.uri, '_blank'); } catch {}
    }
  };
  return (
    <button
      onClick={open}
      className="inline-flex items-center bg-bg-onyx hover:bg-bg-slate transition-colors rounded-full text-sm font-medium text-text-sub mr-2 mb-2 max-w-full"
      title={source.uri}
      type="button"
    >
      <span className="bg-bg-slate text-text-main rounded-full w-5 h-5 flex items-center justify-center mr-2">
        {source.index}
      </span>
      <span className="pr-3 truncate max-w-xs">{source.title}</span>
    </button>
  );
};