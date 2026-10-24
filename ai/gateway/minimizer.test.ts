import { describe, expect, it } from 'vitest';

import { buildScope, detokenize, type ScopeItemInput } from './minimizer.js';

const item = (overrides: Partial<ScopeItemInput> = {}): ScopeItemInput => ({
  evidenceId: '9bbbc90a-9ba2-43a0-8fd3-8e2c075a4adc',
  evidenceDisplayId: 'EV-101',
  status: 'PROCESSED',
  hashOk: true,
  segments: [{
    segmentId: '62470c10-5d56-4210-9094-0b29d36ab761',
    ordinal: 3,
    locatorType: 'LINE_NUMBER',
    locator: { line: 12 },
    text: 'Contact ada@example.test or +1 555 010 1234.',
  }],
  ...overrides,
});

const singleText = (result: ReturnType<typeof buildScope>): string => result.scope[0]?.segments[0]?.text ?? '';

describe('buildScope', () => {
  it('T04 applies MINIMIZE identifiers, cards, credentials, and footers', () => {
    const result = buildScope([item({
      segments: [{
        segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 },
        text: 'Reach ada@example.test or +1 555 010 1234. Card 4111 1111 1111 1111.\nPassword: not-for-model\nUnsubscribe here',
      }],
    })], { mode: 'MINIMIZE' });

    expect(singleText(result)).toBe('Reach [EMAIL_1] or [PHONE_1]. Card [CARD ending 1111].\ncredential: [REDACTED_SECRET]');
    expect(result.metadata.counts).toEqual({ footersStripped: 1, secretsStripped: 1, cardsMasked: 1, placeholdersCreated: 2 });
  });

  it('T04 REDACT also masks known names as whole words', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 }, text: 'Ada Lovelace and ADa Lovelace met.'
    }] })], { mode: 'REDACT', knownNames: ['Ada Lovelace'] });

    expect(singleText(result)).toBe('[NAME_1] and [NAME_2] met.');
    expect(result.placeholders.get('[NAME_1]')).toBe('Ada Lovelace');
    expect(result.placeholders.get('[NAME_2]')).toBe('ADa Lovelace');
  });

  it('T04 leaves RAW segment text unmodified', () => {
    const result = buildScope([item()], { mode: 'RAW', allowRaw: true });
    expect(singleText(result)).toBe('Contact ada@example.test or +1 555 010 1234.');
    expect(result.placeholders).toEqual(new Map());
  });

  it('requires explicit authorization to build RAW scope', () => {
    expect(() => buildScope([item()], { mode: 'RAW' })).toThrow(
      'RAW scope requires explicit allowRaw authorization.',
    );
  });

  it('T04 LOCAL_ONLY skips every item', () => {
    const result = buildScope([item(), item({ evidenceDisplayId: 'EV-102' })], { mode: 'LOCAL_ONLY' });
    expect(result.scope).toEqual([]);
    expect(result.skipped).toEqual([
      { evidenceDisplayId: 'EV-101', reason: 'LOCAL_ONLY' },
      { evidenceDisplayId: 'EV-102', reason: 'LOCAL_ONLY' },
    ]);
  });

  it('T04 excludes bad hashes and unprocessed evidence', () => {
    const result = buildScope([
      item({ hashOk: false }),
      item({ evidenceDisplayId: 'EV-102', status: 'QUARANTINED' }),
    ], { mode: 'RAW', allowRaw: true });
    expect(result.skipped).toEqual([
      { evidenceDisplayId: 'EV-101', reason: 'HASH_MISMATCH' },
      { evidenceDisplayId: 'EV-102', reason: 'NOT_PROCESSED' },
    ]);
  });

  it('T04 keeps placeholders stable and detokenizes them', () => {
    const original = 'ada@example.test, ada@example.test, and grace@example.test';
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 }, text: original,
    }] })], { mode: 'MINIMIZE' });
    expect(singleText(result)).toBe('[EMAIL_1], [EMAIL_1], and [EMAIL_2]');
    expect(detokenize(singleText(result), result.placeholders)).toBe(original);
  });

  it('T04 masks Luhn-valid cards but leaves other 16 digit numbers', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 },
      text: 'valid 4111 1111 1111 1111 invalid 1111 1111 1111 1111',
    }] })], { mode: 'MINIMIZE' });
    expect(singleText(result)).toBe('valid [CARD ending 1111] invalid 1111 1111 1111 1111');
  });

  it('T04 redacts secret values while preserving non-secret evidence text', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 },
      text: 'The password policy was updated.\napi_key = super-secret-value\nAuthorization: Bearer very-long-token-value',
    }] })], { mode: 'MINIMIZE' });

    expect(singleText(result)).toBe(
      'The password policy was updated.\ncredential = [REDACTED_SECRET]\nAuthorization: [REDACTED_SECRET]',
    );
    expect(result.metadata.counts.secretsStripped).toBe(2);
  });

  it('T04 redacts token and private-key assignments', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761',
      ordinal: 3,
      locatorType: 'LINE_NUMBER',
      locator: { line: 12 },
      text: 'token=abc12345 private_key: local-secret',
    }] })], { mode: 'MINIMIZE' });

    expect(singleText(result)).toBe(
      'credential=[REDACTED_SECRET] credential: [REDACTED_SECRET]',
    );
    expect(result.metadata.counts.secretsStripped).toBe(2);
  });

  it('T04 restores the exact identifier spelling from each segment', () => {
    const result = buildScope([item({ segments: [
      { segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 }, text: 'ADA@example.test, +1 (555) 010-1234' },
      { segmentId: '72470c10-5d56-4210-9094-0b29d36ab761', ordinal: 4, locatorType: 'LINE_NUMBER', locator: { line: 13 }, text: 'ada@example.test, +1 555 010 1234' },
    ] })], { mode: 'MINIMIZE' });

    const segments = result.scope[0]?.segments ?? [];
    expect(segments.map((segment) => segment.text)).toEqual([
      '[EMAIL_1], [PHONE_1]',
      '[EMAIL_2], [PHONE_2]',
    ]);
    expect(segments.map((segment) => detokenize(segment.text, result.placeholders))).toEqual([
      'ADA@example.test, +1 (555) 010-1234',
      'ada@example.test, +1 555 010 1234',
    ]);
    expect(result.metadata.counts.placeholdersCreated).toBe(4);
  });

  it('T04 preserves ordinals and keeps IDs only in the scope map', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761',
      ordinal: 3,
      locatorType: 'LINE_NUMBER',
      locator: { line: 12, sourceId: '05cfa21d-48d9-4e1f-86c5-90d079a07701', evidenceId: 'must-not-leave-gateway' },
      text: 'Contact ada@example.test or +1 555 010 1234.',
    }] })], { mode: 'RAW', allowRaw: true });
    expect(result.scopeMap.get('EV-101#3')).toEqual({
      evidenceId: '9bbbc90a-9ba2-43a0-8fd3-8e2c075a4adc',
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761',
      locatorType: 'LINE_NUMBER',
      locator: { line: 12, sourceId: '05cfa21d-48d9-4e1f-86c5-90d079a07701', evidenceId: 'must-not-leave-gateway' },
    });
    expect(JSON.stringify(result.scope)).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
    expect(JSON.stringify(result.scope)).not.toMatch(/"(?:evidenceId|segmentId)"/);
    expect(result.scope[0]?.segments[0]?.locator).toEqual({ line: 12, sourceId: '[REDACTED_UUID]' });
  });

  it('T04 drops a segment that is empty after stripping and creates no map entry', () => {
    const result = buildScope([item({ segments: [{
      segmentId: '62470c10-5d56-4210-9094-0b29d36ab761', ordinal: 3, locatorType: 'LINE_NUMBER', locator: { line: 12 }, text: 'View in browser',
    }] })], { mode: 'MINIMIZE' });
    expect(result.skipped).toEqual([{ evidenceDisplayId: 'EV-101', reason: 'EMPTY' }]);
    expect(result.scopeMap.size).toBe(0);
  });
});
