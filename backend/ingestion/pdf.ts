import { PDFParse } from 'pdf-parse';
import { computeSha256 } from './sha256';
import type { IngestionResult, ExtractedSegment } from './types';

export interface PdfIngestionOptions {
  first?: number;
  last?: number;
  partial?: number[];
}

/**
 * Extracts text and page-level segments from text-based PDFs.
 * Master Spec v1.4 §5.1:
 * - One segment per page with extractable text.
 * - Locator: PAGE { page: number }.
 * - Blank pages are skipped.
 * - Ordinals are 1, 2, 3... in reading order.
 */
export async function parsePdf(
  rawPdf: Buffer,
  options: PdfIngestionOptions = {}
): Promise<IngestionResult> {
  const sha256 = computeSha256(rawPdf);
  const sizeBytes = rawPdf.length;

  const parser = new PDFParse({ data: rawPdf });
  const segments: ExtractedSegment[] = [];

  try {
    const textResult = await parser.getText({
      first: options.first,
      last: options.last,
      partial: options.partial,
    });

    let ordinal = 1;

    for (const page of textResult.pages) {
      const trimmed = (page.text || '').trim();
      if (trimmed.length > 0) {
        segments.push({
          ordinal: ordinal++,
          locatorType: 'PAGE',
          locator: {
            page: page.num,
          },
          segmentText: trimmed,
        });
      }
    }

    // Fallback if pages was empty but total document text exists
    if (segments.length === 0 && textResult.text && textResult.text.trim().length > 0) {
      segments.push({
        ordinal: 1,
        locatorType: 'PAGE',
        locator: {
          page: 1,
        },
        segmentText: textResult.text.trim(),
      });
    }
  } finally {
    // Guarantees resource cleanup even if getText() or parsing throws
    await parser.destroy();
  }

  const normalizedText = segments.map(s => s.segmentText).join('\n\n');

  return {
    sourceType: 'DOCUMENT',
    sha256,
    sizeBytes,
    mimeType: 'application/pdf',
    artifacts: [
      {
        artifactType: 'NORMALIZED_TEXT',
        extractionMethod: 'PARSER',
        version: 1,
        rawContent: normalizedText,
        createdByProcess: 'pdf-parse@2.4.5',
      },
    ],
    segments,
  };
}
