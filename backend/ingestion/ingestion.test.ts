import { describe, it, expect } from 'vitest';
import {
  computeSha256,
  parseEvidencePath,
  buildEvidencePath,
  MalformedPathError,
  segmentText,
  parsePlainText,
  parseEmail,
} from './index';
import { LocatorSchema } from '../../contracts/schemas/locators';

describe('Backend Ingestion Pipeline (Member B - Spec v1.4)', () => {
  describe('SHA-256 Engine (§5.2)', () => {
    it('computes exact 64-char lowercase hex digest', () => {
      const hash = computeSha256('DataTrace Privacy Evidence');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).toBe(computeSha256(Buffer.from('DataTrace Privacy Evidence')));
    });

    it('produces known hash for empty content', () => {
      const emptyHash = computeSha256('');
      expect(emptyHash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('Strict Evidence Path Parser (§5.2, Regression T13)', () => {
    const validCaseId = 'a0000000-0000-4000-8000-000000000001';
    const validEvidenceId = 'b0000000-0000-4000-8000-000000000002';
    const validPath = `cases/${validCaseId}/evidence/${validEvidenceId}/original`;

    it('parses valid canonical evidence paths', () => {
      const parsed = parseEvidencePath(validPath);
      expect(parsed.caseId).toBe(validCaseId);
      expect(parsed.evidenceId).toBe(validEvidenceId);
    });

    it('builds canonical storage path correctly', () => {
      const path = buildEvidencePath(validCaseId, validEvidenceId);
      expect(path).toBe(validPath);
    });

    it('rejects directory traversal attempts (cases/../x) with MALFORMED_PATH', () => {
      expect(() => parseEvidencePath('cases/../x')).toThrowError(MalformedPathError);
      try {
        parseEvidencePath('cases/../x');
      } catch (err: any) {
        expect(err.code).toBe('MALFORMED_PATH');
      }
    });

    it('rejects non-UUID path segments', () => {
      expect(() => parseEvidencePath('cases/not-a-uuid/evidence/123/original')).toThrow(MalformedPathError);
    });
  });

  describe('Segmenter Engine (§5.1)', () => {
    it('creates 1-based reading-order ordinals with CHAR_RANGE locators', () => {
      const sampleText = `First paragraph of request. Demanding GDPR Article 17 deletion.\n\nSecond paragraph stating deadline of 30 days.\n\nThird paragraph with signature.`;
      const segments = segmentText(sampleText);

      expect(segments).toHaveLength(3);
      expect(segments[0].ordinal).toBe(1);
      expect(segments[1].ordinal).toBe(2);
      expect(segments[2].ordinal).toBe(3);

      for (const seg of segments) {
        expect(seg.locatorType).toBe('CHAR_RANGE');
        // Validate against canonical LocatorSchema from contracts
        const validated = LocatorSchema.safeParse({
          locatorType: seg.locatorType,
          locator: seg.locator,
        });
        expect(validated.success).toBe(true);

        // Verify char range offsets are valid substrings
        const range = seg.locator as { start: number; end: number };
        const extracted = sampleText.substring(range.start, range.end);
        expect(extracted).toBe(seg.segmentText);
      }
    });

    it('handles empty or whitespace-only text safely', () => {
      expect(segmentText('')).toEqual([]);
      expect(segmentText('   \n\n  ')).toEqual([]);
    });
  });

  describe('Plain Text Ingestion (§5.1)', () => {
    it('creates NORMALIZED_TEXT artifact and segments for plain text', () => {
      const text = 'Subject requested complete erasure.\n\nOrganization acknowledged.';
      const result = parsePlainText(text, 'DOCUMENT');

      expect(result.sourceType).toBe('DOCUMENT');
      expect(result.mimeType).toBe('text/plain');
      expect(result.sha256).toBe(computeSha256(text));
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].artifactType).toBe('NORMALIZED_TEXT');
      expect(result.segments).toHaveLength(2);
    });

    it('tags manual logs with extraction_method = MANUAL', () => {
      const log = 'Customer called phone support on Oct 12.';
      const result = parsePlainText(log, 'MANUAL_LOG');
      expect(result.sourceType).toBe('MANUAL_LOG');
      expect(result.artifacts[0].extractionMethod).toBe('MANUAL');
    });
  });

  describe('RFC-822 Email Ingestion (§5.1, §13.1)', () => {
    const rawEmail = `From: Data Protection Officer <dpo@acmeretail.example>
To: Citizen <user@example.com>
Subject: Re: GDPR Erasure Request #9921
Date: Mon, 14 Oct 2026 10:30:00 +0000
Message-ID: <msg-9921@acmeretail.example>
In-Reply-To: <user-req-1@example.com>
Content-Type: text/plain; charset=utf-8

Dear Customer,

We have received your deletion request under GDPR Article 17.

We have purged your personal data from our active customer records. Please allow up to 30 days for backup cycles.

Regards,
Acme Retail Privacy Team
`;

    it('extracts metadata and segments email body into locatable chunks', async () => {
      const result = await parseEmail(rawEmail);

      expect(result.sourceType).toBe('EMAIL');
      expect(result.mimeType).toBe('message/rfc822');
      expect(result.capturedAt).toBe('2026-10-14T10:30:00.000Z');
      expect(result.sha256).toHaveLength(64);

      // Verify artifacts: METADATA_JSON and NORMALIZED_TEXT
      expect(result.artifacts).toHaveLength(2);
      const metaArtifact = result.artifacts.find(a => a.artifactType === 'METADATA_JSON')!;
      const textArtifact = result.artifacts.find(a => a.artifactType === 'NORMALIZED_TEXT')!;

      expect(metaArtifact).toBeDefined();
      expect(textArtifact).toBeDefined();

      const parsedMeta = JSON.parse(metaArtifact.rawContent);
      expect(parsedMeta.subject).toBe('Re: GDPR Erasure Request #9921');
      expect(parsedMeta.from).toContain('dpo@acmeretail.example');
      expect(parsedMeta.date).toBe('2026-10-14T10:30:00.000Z');

      // Verify segments
      expect(result.segments.length).toBeGreaterThanOrEqual(3);
      expect(result.segments[0].ordinal).toBe(1);
      expect(result.segments[0].segmentText).toContain('Dear Customer');

      // Check all segment locators validate against LocatorSchema
      for (const seg of result.segments) {
        const validated = LocatorSchema.safeParse({
          locatorType: seg.locatorType,
          locator: seg.locator,
        });
        expect(validated.success).toBe(true);
      }
    });

    it('parses real disk fixture sample.eml into structured evidence', async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const fixturePath = resolve(__dirname, '../../tests/synthetic/sample.eml');
      const emlBuffer = readFileSync(fixturePath);

      const result = await parseEmail(emlBuffer);
      expect(result.sourceType).toBe('EMAIL');
      expect(result.sha256).toHaveLength(64);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);

      const metaArtifact = result.artifacts.find(a => a.artifactType === 'METADATA_JSON')!;
      const meta = JSON.parse(metaArtifact.rawContent);
      expect(meta.from).toContain('support@horizonretail.com');
      expect(meta.subject).toBe('Re: Unauthorized charge on my account');
      expect(result.segments[0].ordinal).toBe(1);
      expect(result.segments[0].segmentText).toContain('Hi Jane');
    });

    it('defaults stripFooters to true even when empty options object is passed', async () => {
      const emailWithFooter = `From: a@b.com
To: c@d.com
Subject: Test

Content here.

--
Signature to strip
To unsubscribe click here`;
      const result = await parseEmail(emailWithFooter, {});
      const textArtifact = result.artifacts.find(a => a.artifactType === 'NORMALIZED_TEXT')!;
      expect(textArtifact.rawContent).not.toContain('Signature to strip');
      expect(textArtifact.rawContent).toBe('Content here.');
    });
  });
});
