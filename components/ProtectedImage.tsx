import React, { useState } from 'react';
import { NewsIcon } from './Icons';

interface ProtectedImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  // Optional wsrv.nl params e.g. "w=1200&h=675&fit=cover&output=webp&q=85"
  proxyParams?: string;
}

export const ProtectedImage: React.FC<ProtectedImageProps> = ({ src, alt, className, proxyParams }) => {
  const [imgSrc, setImgSrc] = useState<string | null>(src || null);
  const [triedProxy, setTriedProxy] = useState(false);

  const toProxy = (url: string) => {
    const extra = proxyParams ? `&${proxyParams.replace(/^\?/, '')}` : '';
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}${extra}`;
  };

  if (!imgSrc) {
    return (
      <div className={`flex items-center justify-center bg-bg-onyx ${className}`}>
        <NewsIcon className="w-1/3 h-1/3 text-bg-slate" />
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        // Try proxy once; if it also fails, show placeholder
        if (imgSrc && !triedProxy) {
          setImgSrc(toProxy(imgSrc));
          setTriedProxy(true);
        } else {
          setImgSrc(null);
        }
      }}
    />
  );
};