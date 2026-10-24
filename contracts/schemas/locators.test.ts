import { describe, it, expect } from 'vitest';
import { LocatorSchema } from './locators';

const ok = (v: unknown) => LocatorSchema.safeParse(v).success;

describe('LocatorSchema', () => {
  it('PAGE', () => {
    expect(ok({ locatorType: 'PAGE', locator: { page: 1 } })).toBe(true);
    expect(ok({ locatorType: 'PAGE', locator: { page: 0 } })).toBe(false);
  });
  it('PAGE_PARAGRAPH', () => {
    expect(ok({ locatorType: 'PAGE_PARAGRAPH', locator: { page: 2, paragraph: 3 } })).toBe(true);
    expect(ok({ locatorType: 'PAGE_PARAGRAPH', locator: { page: 2 } })).toBe(false);
  });
  it('CHAR_RANGE', () => {
    expect(ok({ locatorType: 'CHAR_RANGE', locator: { start: 0, end: 5 } })).toBe(true);
    expect(ok({ locatorType: 'CHAR_RANGE', locator: { start: -1, end: 5 } })).toBe(false);
  });
  it('CHAR_RANGE rejects end <= start', () => {
    expect(ok({ locatorType: 'CHAR_RANGE', locator: { start: 5, end: 5 } })).toBe(false);
    expect(ok({ locatorType: 'CHAR_RANGE', locator: { start: 6, end: 5 } })).toBe(false);
  });
  it('LINE_NUMBER', () => {
    expect(ok({ locatorType: 'LINE_NUMBER', locator: { line: 4 } })).toBe(true);
    expect(ok({ locatorType: 'LINE_NUMBER', locator: { line: 4, endLine: 9 } })).toBe(true);
    expect(ok({ locatorType: 'LINE_NUMBER', locator: { line: 0 } })).toBe(false);
  });
  it('TIMESTAMP', () => {
    expect(ok({ locatorType: 'TIMESTAMP', locator: { startSeconds: 0, endSeconds: 12.5 } })).toBe(true);
    expect(ok({ locatorType: 'TIMESTAMP', locator: { startSeconds: -1, endSeconds: 2 } })).toBe(false);
  });
  it('rejects extra keys inside locator', () => {
    expect(ok({ locatorType: 'PAGE', locator: { page: 1, extra: true } })).toBe(false);
    expect(ok({ locatorType: 'LINE_NUMBER', locator: { line: 1, bogus: 1 } })).toBe(false);
  });
  it('rejects PAGE with a line locator', () => {
    expect(ok({ locatorType: 'PAGE', locator: { line: 3 } })).toBe(false);
  });
  it('rejects unknown locatorType and non-objects', () => {
    expect(ok({ locatorType: 'NOPE', locator: {} })).toBe(false);
    expect(ok(null)).toBe(false);
  });
});
