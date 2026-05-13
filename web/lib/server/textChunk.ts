const DEFAULT_TARGET = 1_200;
const DEFAULT_OVERLAP = 180;

/**
 * Splits long text into overlapping windows for embedding / RAG.
 * Boundaries prefer paragraph breaks, then newlines, then hard splits.
 */
export function chunkText(
  text: string,
  targetChars = DEFAULT_TARGET,
  overlapChars = DEFAULT_OVERLAP,
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  if (normalized.length <= targetChars) {
    return [normalized];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + targetChars, normalized.length);
    if (end < normalized.length) {
      const slice = normalized.slice(start, end);
      const para = slice.lastIndexOf("\n\n");
      const nl = slice.lastIndexOf("\n");
      const prefer =
        para > targetChars * 0.4 ? para + 2 : nl > targetChars * 0.4 ? nl + 1 : -1;
      if (prefer > 0) {
        end = start + prefer;
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece) {
      chunks.push(piece);
    }

    if (end >= normalized.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
