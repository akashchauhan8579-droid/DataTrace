import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeToken, claimKey } from './normalize';

describe('normalizeText', () => {
  it('straightens curly quotes', () => {
    expect(normalizeText('\u2018hi\u2019 \u201Cthere\u201D')).toBe('\'hi\' "there"');
  });
  it('converts en and em dashes to hyphen', () => {
    expect(normalizeText('a\u2013b\u2014c')).toBe('a-b-c');
  });
  it('strips zero-width characters', () => {
    expect(normalizeText('da\u200Bta\u200C tr\u200Dace\uFEFF')).toBe('data trace');
  });
  it('applies NFKC (ligature and full-width letters)', () => {
    expect(normalizeText('\uFB01le')).toBe('file');
    expect(normalizeText('\uFF21\uFF22\uFF23 \uFF11\uFF12')).toBe('abc 12');
  });
  it('collapses whitespace and trims', () => {
    expect(normalizeText('  a \t\n  b\u00A0\u00A0c  ')).toBe('a b c');
  });
  it('lowercases', () => {
    expect(normalizeText('Personal DATA')).toBe('personal data');
  });
  it('is idempotent', () => {
    const samples = [
      '  \u201CHello\u201D \u2014 W\u200Borld \uFB01 \uFF21  ',
      'Plain text',
      '\u2018x\u2019\u2013\u2014 y',
      '',
    ];
    for (const s of samples) {
      const once = normalizeText(s);
      expect(normalizeText(once)).toBe(once);
    }
  });
});

describe('normalizeToken', () => {
  it('splits on punctuation', () => {
    expect(normalizeToken('email,address;phone/number')).toEqual(['address', 'email', 'number', 'phone']);
  });
  it('drops stopwords', () => {
    expect(normalizeToken('the data of your company')).toEqual(['company', 'data']);
  });
  it('sorts and de-duplicates', () => {
    expect(normalizeToken('zeta alpha zeta beta alpha')).toEqual(['alpha', 'beta', 'zeta']);
  });
  it('returns an empty array for stopwords only or empty input', () => {
    expect(normalizeToken('the of and')).toEqual([]);
    expect(normalizeToken('')).toEqual([]);
  });
});

describe('claimKey', () => {
  const base = { predicate: 'COLLECTS', subject: 'Acme', object: 'Personal data' };
  it('is identical for reordered or re-cased words', () => {
    expect(claimKey(base)).toBe(claimKey({ ...base, object: 'data PERSONAL' }));
  });
  it('differs when the predicate differs', () => {
    expect(claimKey(base)).not.toBe(claimKey({ ...base, predicate: 'SELLS' }));
  });
  it('treats "your personal data" the same as "personal data"', () => {
    expect(claimKey({ ...base, object: 'your personal data' })).toBe(claimKey(base));
  });
  it('has the documented format', () => {
    expect(claimKey(base)).toBe('COLLECTS|acme|data personal');
  });
});
