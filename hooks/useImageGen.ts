import { useState, useCallback } from "react";

interface ImageGenOptions {
  model?: "flux" | "flux-realism" | "flux-anime" | "flux-3d" | "turbo";
  width?: number;
  height?: number;
  seed?: number;
}

function buildUrl(prompt: string, options: ImageGenOptions = {}): string {
  const {
    model = "flux",
    width = 1024,
    height = 1024,
    seed = Math.floor(Math.random() * 999999),
  } = options;
  
  // Use pollinations.ai for fast and free image generation
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${model}&width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

export function useImageGen() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback((prompt: string, options?: ImageGenOptions) => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    
    const url = buildUrl(prompt, options);
    
    const img = new Image();
    img.onload = () => {
      setImageUrl(url);
      setLoading(false);
    };
    img.onerror = () => {
      setError("Şəkil yaradıla bilmədi");
      setLoading(false);
    };
    img.src = url;
  }, []);

  const reset = useCallback(() => {
    setImageUrl(null);
    setError(null);
    setLoading(false);
  }, []);

  return { imageUrl, loading, error, generate, reset };
}
