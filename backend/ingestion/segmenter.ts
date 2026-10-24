import type { ExtractedSegment } from './types';

/**
 * Splits plain/normalized text into atomic locatable segments.
 * Master Spec v1.4 §5.1: Paragraph chunks with CHAR_RANGE locator and 1-based reading-order ordinals.
 */
export function segmentText(text: string): ExtractedSegment[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const segments: ExtractedSegment[] = [];
  // Regex to match paragraph blocks separated by 2 or more newlines
  const paragraphRegex = /[^\r\n]+(?:\r?\n(?![ \t]*\r?\n)[^\r\n]+)*/g;

  let match: RegExpExecArray | null;
  let ordinal = 1;

  while ((match = paragraphRegex.exec(text)) !== null) {
    const rawParagraph = match[0];
    const startIndex = match.index;
    const trimmed = rawParagraph.trim();

    if (trimmed.length > 0) {
      // Find start and end within original text relative to trimming
      const leadingWhitespace = rawParagraph.indexOf(trimmed);
      const start = startIndex + leadingWhitespace;
      const end = start + trimmed.length;

      segments.push({
        ordinal: ordinal++,
        locatorType: 'CHAR_RANGE',
        locator: {
          start,
          end,
        },
        segmentText: trimmed,
      });
    }
  }

  // Fallback: if no multi-paragraph pattern matched, use the whole non-empty text
  if (segments.length === 0 && text.trim().length > 0) {
    const trimmed = text.trim();
    const start = text.indexOf(trimmed);
    segments.push({
      ordinal: 1,
      locatorType: 'CHAR_RANGE',
      locator: {
        start,
        end: start + trimmed.length,
      },
      segmentText: trimmed,
    });
  }

  return segments;
}
