import { simpleParser, type ParsedMail } from 'mailparser';
import { computeSha256 } from './sha256';
import { segmentText } from './segmenter';
import type { IngestionResult, ParsedEmailMetadata } from './types';

export interface EmailIngestionOptions {
  stripFooters?: boolean;
}

/**
 * Parses raw RFC-822 / .eml email buffer into normalized artifacts and segments.
 * Master Spec v1.4 §5.1, §5.4, §13.1.
 */
export async function parseEmail(
  rawEml: Buffer | string,
  options: EmailIngestionOptions = {}
): Promise<IngestionResult> {
  const shouldStripFooters = options.stripFooters ?? true;
  const buffer = typeof rawEml === 'string' ? Buffer.from(rawEml, 'utf8') : rawEml;
  const sha256 = computeSha256(buffer);
  const sizeBytes = buffer.length;

  const parsed: ParsedMail = await simpleParser(buffer);

  // Extract structured email metadata (OBSERVED headers)
  const metadata: ParsedEmailMetadata = {
    from: parsed.from?.text,
    to: Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : parsed.to?.text,
    subject: parsed.subject || '',
    date: parsed.date ? parsed.date.toISOString() : undefined,
    messageId: parsed.messageId,
    inReplyTo: parsed.inReplyTo,
    headers: {},
  };

  // Convert raw headers to string dictionary
  if (parsed.headers) {
    for (const [key, value] of parsed.headers.entries()) {
      if (typeof value === 'string') {
        metadata.headers[key] = value;
      } else if (Array.isArray(value)) {
        metadata.headers[key] = value.map(v => (typeof v === 'string' ? v : JSON.stringify(v)));
      } else if (value && typeof value === 'object' && 'value' in value) {
        metadata.headers[key] = String((value as { value: unknown }).value);
      }
    }
  }

  // Get normalized body text
  let bodyText = (parsed.text || '').replace(/\r\n/g, '\n');

  // Strip generic unsubscribe / footer tracking if enabled
  if (shouldStripFooters) {
    bodyText = cleanEmailBody(bodyText);
  }

  // Segment normalized body text
  const segments = segmentText(bodyText);

  return {
    sourceType: 'EMAIL',
    sha256,
    sizeBytes,
    mimeType: 'message/rfc822',
    capturedAt: metadata.date,
    artifacts: [
      {
        artifactType: 'METADATA_JSON',
        extractionMethod: 'PARSER',
        version: 1,
        rawContent: JSON.stringify(metadata, null, 2),
        createdByProcess: 'mailparser@3.9.46',
      },
      {
        artifactType: 'NORMALIZED_TEXT',
        extractionMethod: 'PARSER',
        version: 1,
        rawContent: bodyText,
        createdByProcess: 'datatrace-rfc822-normalizer@1.0',
      },
    ],
    segments,
  };
}

/**
 * Normalizes email text by trimming unnecessary trailing disclaimer/unsubscribe lines.
 */
function cleanEmailBody(text: string): string {
  // Normalize whitespace
  let cleaned = text.trim();

  // Remove common automated footers without deleting substantive content
  const footerPatterns = [
    /\n--\s*\n[\s\S]*$/i, // standard email signature delimiter
    /\n(?:To unsubscribe|Click here to unsubscribe|Manage your preferences)[\s\S]*$/i,
  ];

  for (const pattern of footerPatterns) {
    cleaned = cleaned.replace(pattern, '').trim();
  }

  return cleaned;
}
