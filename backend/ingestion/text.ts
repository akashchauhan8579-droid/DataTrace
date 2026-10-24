import { computeSha256 } from './sha256';
import { segmentText } from './segmenter';
import type { IngestionResult, SourceType } from './types';

/**
 * Ingests plain text or manual user entries into normalized artifacts and segments.
 * Master Spec v1.4 §5.1.
 */
export function parsePlainText(
  rawContent: string | Buffer,
  sourceType: SourceType = 'DOCUMENT',
  mimeType: string = 'text/plain'
): IngestionResult {
  const text = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf8');
  const buffer = typeof rawContent === 'string' ? Buffer.from(rawContent, 'utf8') : rawContent;
  const sha256 = computeSha256(buffer);
  const sizeBytes = buffer.length;

  const normalizedText = text.replace(/\r\n/g, '\n').trim();
  const segments = segmentText(normalizedText);

  return {
    sourceType,
    sha256,
    sizeBytes,
    mimeType,
    artifacts: [
      {
        artifactType: 'NORMALIZED_TEXT',
        extractionMethod: sourceType === 'MANUAL_LOG' ? 'MANUAL' : 'PARSER',
        version: 1,
        rawContent: normalizedText,
        createdByProcess: sourceType === 'MANUAL_LOG' ? 'manual-entry@1.0' : 'text-normalizer@1.0',
      },
    ],
    segments,
  };
}
