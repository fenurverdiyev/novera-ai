export const chunkText = (text: string): string[] => {
  if (!text) return [];
  const sentences = text.match(/[^.!?…]+[.!?…]*|[^.!?…]+$/g) || [];
  if (sentences.length === 0) return [text];

  const chunks: string[] = [];
  let currentChunk = "";
  const maxChunkSize = 400;

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (trimmedSentence.length === 0) continue;
    if (currentChunk.length > 0 && currentChunk.length + trimmedSentence.length + 1 > maxChunkSize) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += (currentChunk.length > 0 ? " " : "") + trimmedSentence;
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks.length > 0 ? chunks : [text];
};
